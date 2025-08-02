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

import { access, constants, mkdir, rm } from 'fs/promises';
import { extname, join } from 'path';
import * as vscode from 'vscode';
import Companion from './companion';
import { CphCapable } from './cphCapable';
import { CphNg } from './cphNg';
import { io, Logger } from './io';
import Settings from './settings';
import { SidebarProvider } from './sidebarProvider';
import { isRunningVerdict } from './types';

class ExtensionManager {
    private logger: Logger = new Logger('extension');
    private sidebarProvider!: SidebarProvider;
    private companion!: Companion;
    private cphNg!: CphNg;
    private timer!: NodeJS.Timeout;

    public async activate(context: vscode.ExtensionContext) {
        this.logger.info('Activating CPH-NG extension');
        try {
            if (Settings.cache.cleanOnStartup) {
                this.logger.info('Cleaning cache on startup');
                await rm(Settings.cache.directory, {
                    force: true,
                    recursive: true,
                });
            }

            await Promise.all([
                mkdir(join(Settings.cache.directory, 'bin'), {
                    recursive: true,
                }),
                mkdir(join(Settings.cache.directory, 'out'), {
                    recursive: true,
                }),
                mkdir(join(Settings.cache.directory, 'diff'), {
                    recursive: true,
                }),
                mkdir(join(Settings.cache.directory, 'io'), {
                    recursive: true,
                }),
            ]);
            this.logger.info('Cache directories created successfully');

            this.companion = new Companion(async (problem, document) => {
                this.logger.debug('Companion callback triggered', {
                    problemName: problem.name,
                    documentPath: document.fileName,
                });
                this.cphNg.problem = problem;
                await this.cphNg.saveProblem();
                await vscode.window.showTextDocument(document);
                this.updateContext();
            });
            this.cphNg = new CphNg();
            this.cphNg.addProblemChangeListener(() => {
                this.logger.trace('Problem change detected');
                this.updateContext();
            });
            this.sidebarProvider = new SidebarProvider(
                context.extensionUri,
                this.cphNg,
            );

            context.subscriptions.push(
                vscode.window.registerWebviewViewProvider(
                    SidebarProvider.viewType,
                    this.sidebarProvider as vscode.WebviewViewProvider,
                    {
                        webviewOptions: {
                            retainContextWhenHidden:
                                Settings.sidebar.retainWhenHidden,
                        },
                    },
                ),
            );
            context.subscriptions.push(
                vscode.window.onDidChangeActiveTextEditor(() => {
                    this.checkActiveFile();
                }),
            );

            this.timer = setInterval(() => this.checkActiveFile(), 1000);
            context.subscriptions.push({
                dispose: () => clearInterval(this.timer),
            });

            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.createProblem',
                    async () => {
                        this.sidebarProvider.focus();
                        await this.cphNg.createProblem();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.runTestCases',
                    async () => {
                        this.sidebarProvider.focus();
                        await this.cphNg.runTcs();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.stopTestCases',
                    async () => {
                        this.sidebarProvider.focus();
                        await this.cphNg.stopTcs();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.addTestCase',
                    async () => {
                        await this.cphNg.addTc();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.loadTestCases',
                    async () => {
                        await this.cphNg.loadTcs();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.deleteProblem',
                    async () => {
                        await this.cphNg.delProblem();
                    },
                ),
            );

            this.updateContext();
            this.logger.info('CPH-NG extension activated successfully');
        } catch (e) {
            this.logger.error('Failed to activate extension', e);
            io.error(
                vscode.l10n.t('Failed to activate CPH-NG extension: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }

    public deactivate() {
        this.logger.info('Deactivating CPH-NG extension');
        this.companion.dispose();
        this.logger.info('CPH-NG extension deactivated');
    }

    private updateContext() {
        this.logger.trace('updateContext');
        const hasProblem = !!this.cphNg.problem;
        const isRunning =
            this.cphNg.problem?.tcs.some((tc) =>
                isRunningVerdict(tc.result?.verdict),
            ) || false;

        this.logger.debug('Context update', { hasProblem, isRunning });
        vscode.commands.executeCommand(
            'setContext',
            'cph-ng.hasProblem',
            hasProblem,
        );
        vscode.commands.executeCommand(
            'setContext',
            'cph-ng.isRunning',
            isRunning,
        );
    }

    private async checkActiveFile() {
        this.logger.trace('checkActiveFile');
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.scheme !== 'file') {
                return;
            }

            const filePath = editor.document.fileName;
            if (filePath.startsWith(Settings.cache.directory)) {
                return;
            }

            if (
                this.cphNg.problem?.tcs
                    .flatMap((tc) =>
                        [
                            tc.stdin.useFile ? [tc.stdin.path] : [],
                            tc.result?.stdout.useFile
                                ? [tc.result.stdout.path]
                                : [],
                            tc.result?.stderr.useFile
                                ? [tc.result.stderr.path]
                                : [],
                        ].flat(),
                    )
                    .includes(filePath)
            ) {
                this.logger.debug('Test case file is active', { filePath });
            } else if (this.cphNg.problem?.checkerPath === filePath) {
                this.logger.debug('Checker file is active', { filePath });
            } else if (['.cpp', '.c'].includes(extname(filePath))) {
                this.logger.debug('C/C++ file is active', { filePath });
                if (this.cphNg.problem?.srcPath !== filePath) {
                    this.logger.trace(
                        'Last source file',
                        this.cphNg.problem?.srcPath,
                        'is not the current file',
                        { filePath },
                    );
                    try {
                        await access(
                            await this.cphNg.getBinByCpp(filePath),
                            constants.R_OK,
                        );
                        try {
                            await this.cphNg.loadProblem(
                                await this.cphNg.getBinByCpp(filePath),
                            );
                            if (
                                !this.cphNg.problem &&
                                Settings.cphCapable.autoImport
                            ) {
                                const problem = await CphCapable.loadProblem(
                                    CphCapable.getProbByCpp(filePath),
                                );
                                if (problem) {
                                    this.cphNg.problem = problem;
                                    this.cphNg.saveProblem();
                                    this.updateContext();
                                }
                            }
                        } catch (e) {
                            io.error(
                                vscode.l10n.t('Failed to load problem: {msg}', {
                                    msg: (e as Error).message,
                                }),
                            );
                        }
                    } catch {
                        this.cphNg.problem = undefined;
                        this.updateContext();
                    }
                }
            } else {
                this.cphNg.problem = undefined;
                this.updateContext();
            }
        } catch (e) {
            io.error(
                vscode.l10n.t('Error in checkActiveFile: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }
}

let extensionManager: ExtensionManager;

export function activate(context: vscode.ExtensionContext) {
    extensionManager = new ExtensionManager();
    extensionManager.activate(context);
}

export function deactivate() {
    extensionManager && extensionManager.deactivate();
}
