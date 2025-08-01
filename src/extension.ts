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

import { mkdir, rm } from 'fs/promises';
import { extname, join } from 'path';
import * as vscode from 'vscode';
import Companion from './companion';
import { CphCapable } from './cphCapable';
import { CphNg } from './cphNg';
import { io } from './io';
import Settings from './settings';
import { SidebarProvider } from './sidebarProvider';
import { TestCaseStatuses } from './testCaseStatuses';
import { Problem } from './types';

class ExtensionManager {
    private sidebarProvider!: SidebarProvider;
    private companion!: Companion;
    private cphNg!: CphNg;
    private timer!: NodeJS.Timeout;

    public async activate(context: vscode.ExtensionContext) {
        try {
            if (Settings.cache.cleanOnStartup) {
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
            ]);

            this.companion = new Companion((problem: Problem) => {
                this.cphNg.problem = problem;
                this.cphNg.saveProblem();
                this.updateContext();
            });
            this.cphNg = new CphNg();
            this.cphNg.addProblemChangeListener(() => {
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
                        await this.cphNg.runTestCases();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.stopTestCases',
                    async () => {
                        this.sidebarProvider.focus();
                        await this.cphNg.stopTestCases();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.addTestCase',
                    async () => {
                        await this.cphNg.addTestCase();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.loadTestCases',
                    async () => {
                        await this.cphNg.loadTestCases();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.deleteProblem',
                    async () => {
                        await this.cphNg.deleteProblem();
                    },
                ),
            );

            this.updateContext();
        } catch (error: unknown) {
            const err = error as Error;
            io.error(
                vscode.l10n.t('Failed to activate CPH-NG extension: {error}', {
                    error: err.message,
                }),
            );
        }
    }

    public deactivate() {
        this.companion.dispose();
    }

    private updateContext() {
        const hasProblem = !!this.cphNg.problem;
        const isRunning =
            this.cphNg.problem?.testCases.some(
                (tc) =>
                    tc.status &&
                    [
                        TestCaseStatuses.CP,
                        TestCaseStatuses.CPD,
                        TestCaseStatuses.JG,
                        TestCaseStatuses.JGD,
                    ].includes(tc.status),
            ) || false;

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
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.scheme !== 'file') {
                return;
            }

            const filePath = editor.document.fileName;
            if (filePath.startsWith(Settings.cache.directory)) {
                return;
            }

            if (['.cpp', '.c'].includes(extname(filePath))) {
                if (this.cphNg.problem?.srcPath !== filePath) {
                    try {
                        await this.cphNg.loadProblem(
                            this.cphNg.getBinByCpp(filePath),
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
                    } catch (error: unknown) {
                        const err = error as Error;
                        io.error(
                            vscode.l10n.t('Failed to load problem: {error}', {
                                error: err.message,
                            }),
                        );
                    }
                }
            } else if (
                !this.cphNg.problem?.testCases
                    .flatMap((tc) =>
                        [
                            tc.inputFile ? [tc.input] : [],
                            tc.answerFile ? [tc.answer] : [],
                            tc.outputFile && tc.output ? [tc.output] : [],
                        ].flat(),
                    )
                    .includes(filePath)
            ) {
                this.cphNg.problem = undefined;
                this.updateContext();
            }
        } catch (error: unknown) {
            const err = error as Error;
            io.error(
                vscode.l10n.t('Error in checkActiveFile: {error}', {
                    error: err.message,
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
