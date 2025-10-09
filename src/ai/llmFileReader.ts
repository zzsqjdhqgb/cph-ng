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

import { readFile } from 'fs/promises';
import * as vscode from 'vscode';
import ProblemsManager from '../modules/problemsManager';
import { getActivePath } from '../utils/global';
import { TCIO } from '../utils/types';

interface LlmFileReaderParams {
    fileType: 'input' | 'output' | 'answer' | 'error';
    idx?: number;
}

class LlmFileReader implements vscode.LanguageModelTool<LlmFileReaderParams> {
    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<LlmFileReaderParams>,
        _token: vscode.CancellationToken,
    ): Promise<vscode.PreparedToolInvocation> {
        const { fileType, idx } = options.input;
        const fileDescription = idx
            ? vscode.l10n.t("test case {idx}'s {fileType}", { idx, fileType })
            : vscode.l10n.t("the problem's {fileType}", { fileType });

        return {
            invocationMessage: vscode.l10n.t(
                'Reading {fileDescription} file...',
                { fileDescription },
            ),
            confirmationMessages: {
                title: vscode.l10n.t('Read Problem File'),
                message: vscode.l10n.t(
                    'Do you want to read the content of {fileDescription} file?',
                    { fileDescription },
                ),
            },
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<LlmFileReaderParams>,
        _token: vscode.CancellationToken,
    ): Promise<vscode.LanguageModelToolResult> {
        const { fileType, idx } = options.input;
        const result = new vscode.LanguageModelToolResult([]);

        const activePath = getActivePath();
        const bgProblem = await ProblemsManager.getFullProblem(activePath);
        if (!bgProblem || !bgProblem.problem) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    vscode.l10n.t(
                        'Error: No competitive programming problem found. Please open or create a problem first.',
                    ),
                ),
            );
            return result;
        }

        const problem = bgProblem.problem;
        let tcIo: TCIO | undefined;

        if (idx) {
            if (idx - 1 < 0 || idx - 1 >= problem.tcs.length) {
                result.content.push(
                    new vscode.LanguageModelTextPart(
                        vscode.l10n.t(
                            'Error: Test case {idx} not found. Valid test cases range from 1 to {max}.',
                            { idx, max: problem.tcs.length },
                        ),
                    ),
                );
                return result;
            }
            const testCase = problem.tcs[idx - 1];
            switch (fileType) {
                case 'input':
                    tcIo = testCase.stdin;
                    break;
                case 'output':
                    tcIo = testCase.result?.stdout;
                    break;
                case 'answer':
                    tcIo = testCase.answer;
                    break;
                case 'error':
                    tcIo = testCase.result?.stderr;
                    break;
                default:
                    result.content.push(
                        new vscode.LanguageModelTextPart(
                            vscode.l10n.t(
                                "Error: Invalid file type '{fileType}'. Must be 'input', 'output', 'answer', or 'error'.",
                                { fileType },
                            ),
                        ),
                    );
                    return result;
            }
        } else {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    vscode.l10n.t(
                        'Error: Please specify a test case index `idx` to read {fileType} data, as it is typically tied to a specific test case.',
                        { fileType },
                    ),
                ),
            );
            return result;
        }

        if (!tcIo) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    vscode.l10n.t(
                        "Error: Could not retrieve data for {fileType} of test case {idx}. It might not exist or tests haven't been run yet.",
                        { fileType, idx },
                    ),
                ),
            );
            return result;
        }

        if (tcIo.useFile && tcIo.path) {
            try {
                const fileContent = (await readFile(tcIo.path, 'utf-8')).trim();
                if (fileContent) {
                    result.content.push(
                        new vscode.LanguageModelTextPart(
                            vscode.l10n.t(
                                'Content of {fileType} for test case {idx}:',
                                { fileType, idx },
                            ) +
                                '\n```\n' +
                                fileContent +
                                '\n```',
                        ),
                    );
                } else {
                    result.content.push(
                        new vscode.LanguageModelTextPart(
                            vscode.l10n.t(
                                `Content of {fileType} for test case {idx} is empty.`,
                                { fileType, idx },
                            ),
                        ),
                    );
                }
            } catch (e: any) {
                result.content.push(
                    new vscode.LanguageModelTextPart(
                        vscode.l10n.t(`Error reading file {path}: {error}.`, {
                            path: tcIo.path,
                            error: e.message || 'Unknown error',
                        }),
                    ),
                );
            }
        } else if (!tcIo.useFile) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    vscode.l10n.t(
                        'The {fileType} data for test case {idx} is inline and not stored in a separate file. Content:',
                        { fileType, idx },
                    ) +
                        '\n```\n' +
                        tcIo.data.trim() +
                        '\n```',
                ),
            );
        } else {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    vscode.l10n.t(
                        `Error: The path for {fileType} of test case {idx} is not available.`,
                        { fileType, idx },
                    ),
                ),
            );
        }

        return result;
    }
}

export default LlmFileReader;
