// Copyright (C) 2025 Langning Chen
//
// This file is part of cph-ng.
//
// cph-ng is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// cph-ng is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with cph-ng.  If not, see <https://www.gnu.org/licenses/>.

import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { createServer, Server } from 'http';
import { dirname } from 'path';
import {
    commands,
    l10n,
    ProgressLocation,
    Uri,
    window,
    workspace,
} from 'vscode';
import Io from '../helpers/io';
import Logger from '../helpers/logger';
import Problems from '../helpers/problems';
import { renderTemplate } from '../utils/strTemplate';
import { Problem } from '../utils/types.backend';
import { CphProblem } from './cphCapable';
import ProblemsManager from './problemsManager';
import Settings from './settings';
import UserScriptManager from './userScriptManager';

type CphSubmitEmpty = {
    empty: true;
};
type CphSubmitData = {
    empty: false;
    problemName: string;
    url: string;
    sourceCode: string;
    languageId: number;
};
type CphSubmitResponse = CphSubmitEmpty | CphSubmitData;

export interface CompanionProblem {
    name: string;
    group: string;
    url: string;
    interactive: boolean;
    memoryLimit: number;
    timeLimit: number;
    tests: {
        input: string;
        output: string;
    }[];
    testType: 'single' | 'multiNumber';
    input: {
        type: 'stdin' | 'file' | 'regex';
        fileName?: string;
        pattern?: string;
    };
    output: {
        type: 'stdout' | 'file';
        fileName?: string;
    };
    languages: {
        java: {
            mainClass: string;
            taskClass: string;
        };
    };
    batch: {
        id: string;
        size: number;
    };
}

class Companion {
    private static logger: Logger = new Logger('companion');
    private static server: Server;
    private static isSubmitting = false;
    private static pendingSubmitData?: Exclude<
        CphSubmitResponse,
        { empty: true }
    >;
    private static pendingSubmitResolve?: () => void;
    private static batches: Map<string, CompanionProblem[]> = new Map();

    public static init() {
        Companion.logger.trace('init');
        Companion.server = createServer((request, response) => {
            let requestData = '';

            request.on('data', (chunk) => {
                requestData += chunk;
            });
            request.on('close', async () => {
                Companion.logger.debug('Received request', requestData);
                if (request.url === '/') {
                    if (requestData.trim() === '') {
                        Companion.logger.warn('Empty request data, ignoring');
                    } else {
                        try {
                            await Companion.handleIncomingProblem(
                                JSON.parse(requestData),
                            );
                        } catch (e) {
                            this.logger.error('Error parsing request data', e);
                            if (e instanceof SyntaxError) {
                                Io.warn(
                                    l10n.t('Companion data is invalid JSON'),
                                );
                            } else {
                                Io.warn(
                                    l10n.t(
                                        'Error occurred while processing companion data',
                                    ),
                                );
                            }
                        }
                    }
                    response.statusCode = 200;
                } else if (request.url === '/getSubmit') {
                    response.statusCode = 200;
                    response.write(
                        JSON.stringify(await Companion.processSubmit()),
                    );
                } else {
                    response.statusCode = 404;
                }
                response.end(() => {
                    if (request.url === '/getSubmit') {
                        Companion.pendingSubmitResolve?.();
                    }
                });
            });
        });

        Companion.server.on('error', (e) => {
            Companion.logger.error('Server error occurred', e);
            Io.error(
                l10n.t('Failed to start companion server: {msg}.', {
                    msg: e.message,
                }),
            );
        });

        Companion.logger.info(
            'Companion server listen at port',
            Settings.companion.listenPort,
        );
        Companion.server.listen(Settings.companion.listenPort);
    }

    public static stopServer() {
        Companion.logger.trace('stopServer');
        Companion.server.close();
        Companion.batches.clear();
    }

    private static async handleIncomingProblem(data: CompanionProblem) {
        this.logger.debug('Handling incoming problem', data);

        const batchId = data.batch.id;
        const batchSize = data.batch.size;
        const currentBatch = Companion.batches.get(batchId) ?? [];
        if (!Companion.batches.has(batchId)) {
            Companion.batches.set(batchId, currentBatch);
        }
        currentBatch.push(data);
        Companion.logger.info(
            `Received problem ${data.name} for batch ${batchId} (${currentBatch.length}/${batchSize})`,
        );

        if (currentBatch.length >= batchSize) {
            const companionProblems = [...currentBatch];
            Companion.batches.delete(batchId);
            await Companion.processProblem(companionProblems);
        }
    }

    private static async processProblem(companionProblems: CompanionProblem[]) {
        const srcPaths = await UserScriptManager.resolvePath(
            companionProblems,
            workspace.workspaceFolders?.map((f) => ({
                index: f.index,
                name: f.name,
                path: f.uri.fsPath,
            })) || [],
        );
        if (!srcPaths) {
            return;
        }
        Companion.logger.debug('Created problem source path', srcPaths);

        const createdDocuments: Uri[] = [];
        for (let i = 0; i < companionProblems.length; i++) {
            const companionProblem = companionProblems[i];
            const srcPath = srcPaths[i];
            if (!srcPath) {
                continue;
            }

            const problem = new CphProblem({
                name: companionProblem.name,
                url: companionProblem.url,
                tests: companionProblem.tests.map((test, id) => ({
                    ...test,
                    id,
                })),
                interactive: companionProblem.interactive,
                memoryLimit: companionProblem.memoryLimit,
                timeLimit: companionProblem.timeLimit,
                srcPath,
                group: companionProblem.group,
                local: true,
            }).toProblem();

            try {
                await mkdir(dirname(problem.src.path), { recursive: true });
            } catch (e) {
                Companion.logger.error('Failed to create directory', e);
                Io.error(
                    l10n.t('Failed to create directory for problem: {msg}', {
                        msg: (e as Error).message,
                    }),
                );
                continue;
            }

            try {
                await access(problem.src.path);
                Companion.logger.debug('Source file already exists', srcPath);
            } catch {
                Companion.logger.debug('Creating new source file', srcPath);
                await Companion.createSourceFile(problem);
            }

            await Problems.saveProblem(problem);
            createdDocuments.push(Uri.file(srcPath));
        }

        if (createdDocuments.length > 0) {
            await commands.executeCommand('vscode.open', createdDocuments[0]);

            if (createdDocuments.length > 1) {
                Io.info(
                    l10n.t('Created {count} problems', {
                        count: createdDocuments.length,
                    }),
                );
            }
        }

        await ProblemsManager.dataRefresh();
    }

    public static async submit(problem?: Problem): Promise<void> {
        Companion.logger.trace('submit', { problem });
        if (!problem) {
            return;
        }
        const languageList = {
            'GNU G++17 7.3.0': 54,
            'GNU G++20 13.2 (64 bit, winlibs)': 89,
            'GNU G++23 14.2 (64 bit, msys2)': 91,
        };
        if (Companion.isSubmitting) {
            Io.warn(l10n.t('A submission is already in progress.'));
            return Promise.reject(new Error('Submission already in progress'));
        }

        let submitLanguageId = Settings.companion.submitLanguage;
        if (!Object.values(languageList).includes(submitLanguageId)) {
            const choice = await window.showQuickPick(
                Object.keys(languageList),
                { placeHolder: l10n.t('Choose submission language') },
            );
            if (!choice) {
                Io.info(l10n.t('Submission cancelled.'));
                return;
            }
            submitLanguageId =
                languageList[choice as keyof typeof languageList];
            Settings.companion.submitLanguage = submitLanguageId;
        }

        const sourceCode = await readFile(problem.src.path, 'utf-8');
        Companion.logger.debug('Read source code for submission', {
            srcPath: problem.src.path,
            sourceCode,
        });
        if (sourceCode.trim() === '') {
            Io.warn(l10n.t('Source code is empty. Submission cancelled.'));
            return;
        }
        Companion.logger.info(
            `Submitting problem ${problem.name} using language ${submitLanguageId} and file ${problem.src.path}`,
        );
        const requestData: Exclude<CphSubmitResponse, CphSubmitEmpty> = {
            empty: false,
            problemName: problem.name,
            url: problem.url || '',
            sourceCode:
                sourceCode +
                (Settings.companion.addTimestamp
                    ? `\n// Submitted via cph-ng at ${new Date().toISOString()}`
                    : ''),
            languageId: submitLanguageId,
        };
        Companion.logger.debug('Submission data', requestData);

        Companion.isSubmitting = true;
        return await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: l10n.t('Waiting response from cph-submit...'),
                cancellable: true,
            },
            async (_, token) =>
                new Promise<void>((resolve, _) => {
                    Companion.pendingSubmitData = requestData;

                    const cleanup = () => {
                        Companion.isSubmitting = false;
                        Companion.pendingSubmitData = undefined;
                        Companion.pendingSubmitResolve = undefined;
                    };
                    Companion.pendingSubmitResolve = () => {
                        Companion.logger.info(
                            'Submission payload consumed by companion',
                        );
                        cleanup();
                        resolve();
                    };

                    token.onCancellationRequested(() => {
                        Io.warn(l10n.t('Submission cancelled.'));
                        cleanup();
                        resolve();
                    });
                }),
        );
    }

    private static async processSubmit(): Promise<CphSubmitResponse> {
        Companion.logger.trace('processSubmit');
        const data = Companion.pendingSubmitData;
        if (data) {
            Companion.logger.debug('Pending submission data found', data);
            Companion.pendingSubmitData = undefined;
            return data;
        }
        Companion.logger.trace('No pending submission data');
        return { empty: true };
    }

    private static async createSourceFile(problem: Problem): Promise<void> {
        Companion.logger.trace('createSourceFile', {
            problem,
        });
        try {
            if (Settings.problem.templateFile) {
                Companion.logger.debug('Using template file', {
                    templateFile: Settings.problem.templateFile,
                });
                try {
                    await writeFile(
                        problem.src.path,
                        await renderTemplate(problem),
                    );
                    Companion.logger.debug('Template applied successfully', {
                        srcPath: problem.src.path,
                    });
                } catch (e) {
                    Companion.logger.warn('Template file error', e);
                    Io.warn(
                        l10n.t(
                            'Failed to use template file: {msg}, creating empty file instead',
                            { msg: (e as Error).message },
                        ),
                    );
                    await writeFile(problem.src.path, '');
                    Companion.logger.debug('Created empty source file', {
                        srcPath: problem.src.path,
                    });
                }
            } else {
                Companion.logger.debug(
                    'No template file configured, creating empty file',
                );
                await writeFile(problem.src.path, '');
            }
        } catch (e) {
            Companion.logger.error('Failed to create source file', e);
            throw new Error(
                `Failed to create source file: ${(e as Error).message}`,
            );
        }
    }
}

export default Companion;
