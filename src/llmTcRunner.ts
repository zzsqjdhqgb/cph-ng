import * as vscode from 'vscode';
import { CphNg } from './cphNg';
import { TCIO } from './types';
import { io } from './io';

interface CphTestRunnerParams {
    idx?: number;
}

class LlmTcRunner implements vscode.LanguageModelTool<CphTestRunnerParams> {
    private cphNg: CphNg;

    constructor(cphNg: CphNg) {
        this.cphNg = cphNg;
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<CphTestRunnerParams>,
        _token: vscode.CancellationToken,
    ): Promise<vscode.PreparedToolInvocation> {
        const { idx } = options.input;
        return {
            invocationMessage: idx
                ? `Running test case ${idx} using CPH-NG...`
                : `Running all test cases using CPH-NG...`,
            confirmationMessages: {
                title: 'Run Test Cases',
                message: idx
                    ? `Do you want to run test case ${idx} for the current problem?`
                    : 'Do you want to run all test cases for the current problem?',
            },
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<CphTestRunnerParams>,
        token: vscode.CancellationToken,
    ): Promise<vscode.LanguageModelToolResult> {
        const { idx } = options.input;
        const result = new vscode.LanguageModelToolResult([]);

        const tcIo2String = (tcIo: TCIO) =>
            tcIo.useFile
                ? `Data stored in file ${tcIo.path}, you can call \`read_problem_file\` to access it.`
                : tcIo.data.trim()
                  ? `\n\`\`\`\n${
                        tcIo.data.length > 1000
                            ? tcIo.data.substring(0, 1000) + '... (truncated)'
                            : tcIo.data
                    }\n\`\`\``
                  : `(<empty>)`;

        if (!this.cphNg.checkProblem()) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    `Error: No competitive programming problem found. Please open or create a problem first.`,
                ),
            );
        } else if (idx && !this.cphNg.checkIdx(idx - 1)) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    `Error: Test case ${idx} not found. Valid test cases range from 1 to ${this.cphNg.problem?.tcs.length}.`,
                ),
            );
        } else {
            token.onCancellationRequested(async () => {
                await this.cphNg.stopTcs();
            });

            if (idx) {
                await this.cphNg.runTc(idx - 1);
            } else {
                await this.cphNg.runTcs();
            }

            const tcs = idx
                ? [this.cphNg.problem!.tcs[idx - 1]]
                : this.cphNg.problem!.tcs;
            const outputParts: string[] = [];
            if (tcs[0].result!.verdict.name === 'CE') {
                outputParts.push(`Compilation Error`);
                outputParts.push(``);
                outputParts.push(io.compilationMsg);
            } else {
                outputParts.push(`Test cases run successfully.`);
                outputParts.push(``);

                tcs.forEach((tc, testCaseIndex) => {
                    const testResult = tc.result!;
                    outputParts.push(
                        `--- Test Case ${idx || testCaseIndex + 1} ---`,
                    );
                    outputParts.push(
                        `Verdict: ${testResult.verdict.name} (${testResult.verdict.fullName})`,
                    );
                    outputParts.push(`Time: ${testResult.time}ms`);
                    if (testResult.msg) {
                        outputParts.push(`Message: ${testResult.msg}`);
                    }
                    outputParts.push(`Input: ${tcIo2String(tc.stdin)}`);
                    outputParts.push(
                        `Expected Output (Answer): ${tcIo2String(tc.answer)}`,
                    );
                    outputParts.push(
                        `Actual Output: ${tcIo2String(testResult.stdout)}`,
                    );
                    outputParts.push(
                        `Error Output: ${tcIo2String(testResult.stderr)}`,
                    );
                    outputParts.push(``);
                });
            }
            result.content.push(
                new vscode.LanguageModelTextPart(outputParts.join('\n')),
            );
        }
        return result;
    }
}

export default LlmTcRunner;
