import * as vscode from 'vscode';
import { CphNg } from './cphNg';
import { TCIO } from './types';
import { readFile } from 'fs/promises';

interface LlmFileReaderParams {
    fileType: 'input' | 'output' | 'answer' | 'error';
    idx?: number;
}

class LlmFileReader implements vscode.LanguageModelTool<LlmFileReaderParams> {
    private cphNg: CphNg;

    constructor(cphNg: CphNg) {
        this.cphNg = cphNg;
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<LlmFileReaderParams>,
        _token: vscode.CancellationToken,
    ): Promise<vscode.PreparedToolInvocation> {
        const { fileType, idx } = options.input;
        const fileDescription = idx
            ? `test case ${idx}'s ${fileType}`
            : `the problem's ${fileType}`;

        return {
            invocationMessage: `Reading ${fileDescription} file...`,
            confirmationMessages: {
                title: 'Read Problem File',
                message: `Do you want to read the content of ${fileDescription} file?`,
            },
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<LlmFileReaderParams>,
        _token: vscode.CancellationToken,
    ): Promise<vscode.LanguageModelToolResult> {
        const { fileType, idx } = options.input;
        const result = new vscode.LanguageModelToolResult([]);

        if (!this.cphNg.checkProblem()) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    `Error: No competitive programming problem found. Please open or create a problem first.`,
                ),
            );
            return result;
        }

        const problem = this.cphNg.problem!;
        let tcIo: TCIO | undefined;

        if (idx) {
            if (!this.cphNg.checkIdx(idx)) {
                result.content.push(
                    new vscode.LanguageModelTextPart(
                        `Error: Test case ${idx} not found. Valid test cases range from 1 to ${problem.tcs.length}.`,
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
                            `Error: Invalid file type '${fileType}'. Must be 'input', 'output', 'answer', or 'error'.`,
                        ),
                    );
                    return result;
            }
        } else {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    `Error: Please specify a test case index (idx) to read ${fileType} data, as it's typically tied to a specific test case.`,
                ),
            );
            return result;
        }

        if (!tcIo) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    `Error: Could not retrieve data for ${fileType} of test case ${idx}. It might not exist or tests haven't been run yet.`,
                ),
            );
            return result;
        }

        if (tcIo.useFile && tcIo.path) {
            try {
                const fileContent = (await readFile(tcIo.path))
                    .toString()
                    .trim();
                if (fileContent) {
                    result.content.push(
                        new vscode.LanguageModelTextPart(
                            `Content of ${fileType} for test case ${idx}:\n\`\`\`\n${fileContent}\n\`\`\``,
                        ),
                    );
                } else {
                    result.content.push(
                        new vscode.LanguageModelTextPart(
                            `Content of ${fileType} for test case ${idx} is empty.`,
                        ),
                    );
                }
            } catch (e: any) {
                result.content.push(
                    new vscode.LanguageModelTextPart(
                        `Error reading file ${tcIo.path}: ${
                            e.message || 'Unknown error'
                        }.`,
                    ),
                );
            }
        } else if (!tcIo.useFile) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    `The ${fileType} data for test case ${idx} is inline and not stored in a separate file. Content:\n\`\`\`\n${tcIo.data.trim()}\n\`\`\``,
                ),
            );
        } else {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    `Error: The path for ${fileType} of test case ${idx} is not available.`,
                ),
            );
        }

        return result;
    }
}

export default LlmFileReader;
