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

import { access, readFile, writeFile } from 'fs/promises';
import { createServer, Server } from 'http';
import { join } from 'path';
import * as vscode from 'vscode';
import { CphCapable, CphProblem } from './cphCapable';
import { io, Logger } from '../utils/io';
import Settings from '../utils/settings';
import { renderTemplate } from '../utils/strTemplate';
import { Problem } from '../utils/types';

class Companion {
    private logger: Logger = new Logger('companion');
    server: Server;

    constructor(
        onCreateProblem: (
            problem: Problem,
            document: vscode.TextDocument,
        ) => void,
    ) {
        this.logger.trace('constructor', {
            onCreateProblem,
        });
        this.server = createServer((request, response) => {
            let requestData = '';

            request.on('data', (chunk) => {
                requestData += chunk;
            });

            request.on('close', async () => {
                this.logger.debug('Received request', requestData);
                try {
                    const problem = CphCapable.toProblem(
                        JSON.parse(requestData) as CphProblem,
                    );
                    const workspaceFolder =
                        vscode.workspace.workspaceFolders?.[0].uri.fsPath;

                    if (!workspaceFolder) {
                        this.logger.warn('No workspace folder found');
                        io.info(
                            vscode.l10n.t(
                                'No workspace folder found. Please open a workspace folder.',
                            ),
                        );
                        return;
                    }

                    problem.srcPath = join(
                        workspaceFolder.toString(),
                        this.getProblemFileName(problem.name),
                    );
                    this.logger.info('Created problem source path', {
                        srcPath: problem.srcPath,
                    });

                    try {
                        await access(problem.srcPath);
                        this.logger.debug('Source file already exists', {
                            srcPath: problem.srcPath,
                        });
                    } catch {
                        this.logger.info('Creating new source file', {
                            srcPath: problem.srcPath,
                        });
                        await this.createSourceFile(problem);
                    }

                    const document = await vscode.workspace.openTextDocument(
                        problem.srcPath,
                    );
                    this.logger.info('Opened document', {
                        document: document.fileName,
                    });
                    onCreateProblem(problem, document);
                } catch (e) {
                    this.logger.warn('Parse data from companion failed', e);
                    io.warn(
                        vscode.l10n.t(
                            'Parse data from companion failed: {msg}.',
                            {
                                msg: (e as Error).message,
                            },
                        ),
                    );
                }
            });

            response.end();
        });

        this.server.on('error', (e) => {
            this.logger.error('Server error occurred', e);
            io.error(
                vscode.l10n.t('Failed to start companion server: {msg}.', {
                    msg: e.message,
                }),
            );
        });

        this.logger.info(
            'Companion server listen at port',
            Settings.companion.listenPort,
        );
        this.server.listen(Settings.companion.listenPort);
    }

    public dispose() {
        this.logger.trace('dispose');
        this.server.close();
    }

    private async createSourceFile(problem: Problem): Promise<void> {
        this.logger.trace('createSourceFile', {
            problem,
        });
        try {
            if (Settings.problem.templateFile) {
                this.logger.info('Using template file', {
                    templateFile: Settings.problem.templateFile,
                });
                try {
                    const template = await readFile(
                        Settings.problem.templateFile,
                        'utf-8',
                    );
                    const renderedTemplate = renderTemplate(template, [
                        ['title', problem.name],
                        ['timeLimit', problem.timeLimit.toString()],
                        ['url', problem.url || ''],
                    ]);
                    await writeFile(problem.srcPath, renderedTemplate);
                    this.logger.info('Template applied successfully', {
                        srcPath: problem.srcPath,
                    });
                } catch (e) {
                    this.logger.warn('Template file error', e);
                    io.warn(
                        vscode.l10n.t(
                            'Failed to use template file: {msg}, creating empty file instead',
                            { msg: (e as Error).message },
                        ),
                    );
                    await writeFile(problem.srcPath, '');
                    this.logger.info('Created empty source file', {
                        srcPath: problem.srcPath,
                    });
                }
            } else {
                this.logger.info(
                    'No template file configured, creating empty file',
                );
                await writeFile(problem.srcPath, '');
            }
        } catch (e) {
            this.logger.error('Failed to create source file', e);
            throw new Error(
                `Failed to create source file: ${(e as Error).message}`,
            );
        }
    }

    private getProblemFileName(name: string) {
        this.logger.trace('getProblemFileName', {
            name,
        });
        const words = name.match(/[\p{L}]+|[0-9]+/gu);
        const fileName =
            (words ? `${words.join('_')}` : `${name.replace(/\W+/g, '_')}`) +
            '.cpp';
        this.logger.debug('Generated problem file name', {
            originalName: name,
            fileName,
        });
        return fileName;
    }
}

export default Companion;
