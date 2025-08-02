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

import * as vscode from 'vscode';
import { CphNg } from './cphNg';
import Settings from './settings';
import * as messages from './webview/messages';
import { Logger } from './io';

export interface JudgeResult {
    verdict: 'AC' | 'WA' | 'TLE' | 'RE' | 'CE';
    details: string;
    testResults: TestResult[];
}

export interface TestResult {
    input: string;
    expected: string;
    output: string;
    verdict: 'AC' | 'WA' | 'TLE' | 'RE';
    time: number;
    error?: string;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'cphSidebar';
    private _view?: vscode.WebviewView;
    private logger: Logger = new Logger('sidebar');

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private helper: CphNg,
    ) {
        this.logger.trace('constructor', { _extensionUri });
        helper.addProblemChangeListener((problem) => {
            this.logger.debug('Problem change listener triggered', { problem });
            this._view?.webview.postMessage({ type: 'problem', problem });
        });
    }

    public focus() {
        this.logger.trace('focus');
        vscode.commands.executeCommand(
            'workbench.view.extension.cph-ng-sidebar',
        );
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this.logger.trace('resolveWebviewView', { webviewView });
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            this.logger.debug('Received message from webview', { message });
            try {
                switch (message.type) {
                    case 'createProblem':
                        await this.helper.createProblem();
                        break;
                    case 'getProblem':
                        await this.helper.getProblem();
                        break;
                    case 'editProblemDetails':
                        const editProblemDetailsMessage =
                            message as messages.EditProblemDetailsMessage;
                        await this.helper.editProblemDetails(
                            editProblemDetailsMessage.title,
                            editProblemDetailsMessage.url,
                            editProblemDetailsMessage.timeLimit,
                            editProblemDetailsMessage.isSpecialJudge,
                        );
                        break;
                    case 'deleteProblem':
                        await this.helper.deleteProblem();
                        break;
                    case 'addTestCase':
                        await this.helper.addTestCase();
                        break;
                    case 'loadTestCases':
                        await this.helper.loadTestCases();
                        break;
                    case 'updateTestCase':
                        let updateTestCaseMessage =
                            message as messages.UpdateTestCaseMessage;
                        await this.helper.updateTestCase(
                            updateTestCaseMessage.index,
                            updateTestCaseMessage.testCase,
                        );
                        break;
                    case 'runTestCase':
                        const runTestCaseMessage =
                            message as messages.RunTestCaseMessage;
                        await this.helper.runTestCase(runTestCaseMessage.index);
                        break;
                    case 'runTestCases':
                        await this.helper.runTestCases();
                        break;
                    case 'stopTestCases':
                        await this.helper.stopTestCases();
                        break;
                    case 'chooseTestCaseFile':
                        const chooseTestCaseFileMessage =
                            message as messages.ChooseTestCaseFileMessage;
                        await this.helper.chooseTestCaseFile(
                            chooseTestCaseFileMessage.index,
                            chooseTestCaseFileMessage.label,
                        );
                        break;
                    case 'compareTestCase':
                        const compareTestCaseMessage =
                            message as messages.CompareTestCaseMessage;
                        this.helper.compareTestCase(
                            compareTestCaseMessage.index,
                        );
                        break;
                    case 'deleteTestCase':
                        const deleteTestCaseMessage =
                            message as messages.DeleteTestCaseMessage;
                        await this.helper.deleteTestCase(
                            deleteTestCaseMessage.index,
                        );
                        break;
                    case 'openFile':
                        const openFileMessage =
                            message as messages.OpenFileMessage;
                        vscode.window.showTextDocument(
                            await vscode.workspace.openTextDocument(
                                openFileMessage.path,
                            ),
                        );
                        break;
                    case 'chooseCheckerFile':
                        await this.helper.chooseCheckerFile();
                        break;
                    default:
                        this.logger.warn('Unknown message type:', message.type);
                }
            } catch (error: unknown) {
                const err = error as Error;
                this.logger.error('Error handling webview message', {
                    messageType: message.type,
                    error: err,
                });
            }
        });
    }

    public refresh() {
        this.logger.trace('refresh');
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(
                this._view.webview,
            );
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        this.logger.trace('_getHtmlForWebview', { webview });
        const getUri = (filename: string) =>
            webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, filename),
            );
        let isDarkMode =
            vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
                ? true
                : false;
        if (Settings.sidebar.colorTheme === 'light') {
            isDarkMode = false;
        }
        if (Settings.sidebar.colorTheme === 'dark') {
            isDarkMode = true;
        }
        return `<!DOCTYPE html><html>
<head>
<link rel="stylesheet" href="${getUri('dist/styles.css')}">
</head>

<body>
<div id="root"></div>
<script src="${getUri('dist/frontend.js')}"></script>
<script>
window.vscode = acquireVsCodeApi();
window.isDarkMode = ${isDarkMode};
window.hiddenStatuses = ${JSON.stringify(Settings.sidebar.hiddenStatuses)};
window.partyUri = '${
            Settings.sidebar.showAcGif ? getUri('res/party.gif') : ''
        }';
window.language = '${vscode.env.language}';
</script>
</body>
</html>`;
    }
}
