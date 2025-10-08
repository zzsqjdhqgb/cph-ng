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

import { mkdir, readFile, rm } from 'fs/promises';
import { debounce } from 'lodash';
import { release } from 'os';
import { join } from 'path';
import { EventEmitter } from 'stream';
import * as vscode from 'vscode';
import { version } from '../../package.json';
import LlmFileReader from '../ai/llmFileReader';
import LlmTcRunner from '../ai/llmTcRunner';
import Io from '../helpers/io';
import Logger from '../helpers/logger';
import Companion from '../modules/companion';
import CphCapable from '../modules/cphCapable';
import SidebarProvider from '../modules/sidebarProvider';
import {
    extensionPath,
    getActivePath,
    setActivePath,
    setExtensionUri,
    sidebarProvider,
} from '../utils/global';
import CphNg from './cphNg';
import ProblemsManager from './problemsManager';
import Settings from './settings';

interface ContextEvent {
    hasProblem: boolean;
    canImport: boolean;
    isRunning: boolean;
}

export default class ExtensionManager {
    private static logger: Logger = new Logger('extension');
    private static compatibleTimer: NodeJS.Timeout;
    public static event: EventEmitter<{
        context: ContextEvent[];
    }> = new EventEmitter();

    public static async activate(context: vscode.ExtensionContext) {
        ExtensionManager.logger.info('Activating CPH-NG extension');
        try {
            ExtensionManager.event.on('context', (context) => {
                for (const [key, value] of Object.entries(context)) {
                    vscode.commands.executeCommand(
                        'setContext',
                        `cph-ng.${key}`,
                        value,
                    );
                }
            });

            setExtensionUri(context.extensionUri);
            if (Settings.cache.cleanOnStartup) {
                ExtensionManager.logger.info('Cleaning cache on startup');
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
            ExtensionManager.logger.info(
                'Cache directories created successfully',
            );

            Companion.init();

            context.subscriptions.push(
                vscode.window.registerWebviewViewProvider(
                    SidebarProvider.viewType,
                    sidebarProvider,
                    {
                        webviewOptions: {
                            retainContextWhenHidden:
                                Settings.sidebar.retainWhenHidden,
                        },
                    },
                ),
            );
            context.subscriptions.push(
                vscode.lm.registerTool('run_test_cases', new LlmTcRunner()),
            );
            context.subscriptions.push(
                vscode.lm.registerTool(
                    'read_problem_file',
                    new LlmFileReader(),
                ),
            );
            context.subscriptions.push(
                vscode.window.onDidChangeActiveTextEditor(
                    debounce<(editor?: vscode.TextEditor) => void>((editor) => {
                        setActivePath(editor);
                        sidebarProvider.event.emit('activePath', {
                            activePath: getActivePath(),
                        });
                        ProblemsManager.dataRefresh();
                        ProblemsManager.saveIfIdle();
                    }, 50),
                ),
            );

            let lastAlertTime = 0;
            ExtensionManager.compatibleTimer = setInterval(async () => {
                const currentTime = Date.now();
                if (
                    vscode.extensions.getExtension(
                        'divyanshuagrawal.competitive-programming-helper',
                    )?.isActive &&
                    currentTime - lastAlertTime > 5 * 1000
                ) {
                    lastAlertTime = currentTime;
                    const result = (await Io.warn(
                        vscode.l10n.t(
                            "CPH-NG cannot run with CPH, but it can load CPH problem file. Please disable CPH to use CPH-NG. You can select the 'Ignore' option to ignore this warning in this session.",
                        ),
                        { modal: true },
                        { title: vscode.l10n.t('OK') },
                        { title: vscode.l10n.t('Ignore') },
                    )) satisfies vscode.MessageItem | undefined;
                    if (result?.title === vscode.l10n.t('Ignore')) {
                        clearInterval(ExtensionManager.compatibleTimer);
                    }
                }
            }, 1000 * 60);
            context.subscriptions.push({
                dispose: () => clearInterval(ExtensionManager.compatibleTimer),
            });

            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.versionInfo',
                    async () => {
                        const generated = await readFile(
                            join(extensionPath, 'dist', 'generated.json'),
                            'utf8',
                        ).then((data) => JSON.parse(data));
                        const msg = `Version: ${version}
Commit: ${generated.commitHash}
Date: ${generated.buildTime}
Build By: ${generated.buildBy}
OS: ${release()}`;
                        const result = (await Io.info(
                            'CPH-NG',
                            { modal: true, detail: msg },
                            { title: vscode.l10n.t('Copy') },
                        )) satisfies vscode.MessageItem | undefined;
                        if (result?.title === vscode.l10n.t('Copy')) {
                            await vscode.env.clipboard.writeText(msg);
                        }
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.importFromCph',
                    async () => CphCapable.importFromCph(),
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.createProblem',
                    async () => {
                        sidebarProvider.focus();
                        await CphNg.createProblem();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.importProblem',
                    async () => {
                        sidebarProvider.focus();
                        await CphNg.importProblem();
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.runTestCases',
                    async () => {
                        sidebarProvider.focus();
                        await ProblemsManager.runTcs({
                            type: 'runTcs',
                            compile: null,
                            activePath: getActivePath(),
                        });
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.stopTestCases',
                    async () => {
                        sidebarProvider.focus();
                        await ProblemsManager.stopTcs({
                            type: 'stopTcs',
                            onlyOne: false,
                            activePath: getActivePath(),
                        });
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.addTestCase',
                    async () => {
                        await ProblemsManager.addTc({
                            type: 'addTc',
                            activePath: getActivePath(),
                        });
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.loadTestCases',
                    async () => {
                        await ProblemsManager.loadTcs({
                            type: 'loadTcs',
                            activePath: getActivePath(),
                        });
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.deleteProblem',
                    async () => {
                        await ProblemsManager.delProblem({
                            type: 'delProblem',
                            activePath: getActivePath(),
                        });
                    },
                ),
            );
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    'cph-ng.submitToCodeforces',
                    async () => {
                        await ProblemsManager.submitToCodeforces({
                            type: 'submitToCodeforces',
                            activePath: getActivePath(),
                        });
                    },
                ),
            );

            setActivePath(vscode.window.activeTextEditor);
            ProblemsManager.dataRefresh();
            ExtensionManager.logger.info(
                'CPH-NG extension activated successfully',
            );
        } catch (e) {
            ExtensionManager.logger.error('Failed to activate extension', e);
            Io.error(
                vscode.l10n.t('Failed to activate CPH-NG extension: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }

    public static deactivate() {
        ExtensionManager.logger.info('Deactivating CPH-NG extension');
        Companion.stopServer();
        ProblemsManager.closeAll();
        ExtensionManager.logger.info('CPH-NG extension deactivated');
    }
}
