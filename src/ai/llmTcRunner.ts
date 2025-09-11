import * as vscode from 'vscode';
import { CphNg } from '../module/cphNg';
import { io } from '../utils/io';
import { TCIO } from '../utils/types';

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
                ? vscode.l10n.t('Running test case {idx} using CPH-NG...', {
                      idx,
                  })
                : vscode.l10n.t('Running all test cases using CPH-NG...'),
            confirmationMessages: {
                title: vscode.l10n.t('Run Test Cases'),
                message: idx
                    ? vscode.l10n.t(
                          'Do you want to run test case {idx} for the current problem?',
                          { idx },
                      )
                    : vscode.l10n.t(
                          'Do you want to run all test cases for the current problem?',
                      ),
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
                ? vscode.l10n.t(
                      'Data stored in file {path}, you can call `read_problem_file` to access it.',
                      { path: tcIo.path },
                  )
                : tcIo.data.trim()
                  ? '\n```\n' +
                    (tcIo.data.length > 1000
                        ? tcIo.data.substring(0, 1000) +
                          '... ' +
                          vscode.l10n.t('(truncated)')
                        : tcIo.data) +
                    '\n```'
                  : vscode.l10n.t('(<empty>)');

        if (!this.cphNg.checkProblem()) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    vscode.l10n.t(
                        'Error: No competitive programming problem found. Please open or create a problem first.',
                    ),
                ),
            );
        } else if (idx && !this.cphNg.checkIdx(idx - 1)) {
            result.content.push(
                new vscode.LanguageModelTextPart(
                    vscode.l10n.t(
                        'Error: Test case {idx} not found. Valid test cases range from 1 to {max}.',
                        { idx, max: this.cphNg.problem?.tcs.length },
                    ),
                ),
            );
        } else {
            token.onCancellationRequested(async () => {
                await this.cphNg.stopTcs(false);
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
                outputParts.push(vscode.l10n.t('Compilation Error'));
                outputParts.push('');
                outputParts.push(io.compilationMsg);
            } else {
                outputParts.push(vscode.l10n.t('Test cases run successfully.'));
                outputParts.push('');

                tcs.forEach((tc, testCaseIndex) => {
                    const testResult = tc.result!;
                    outputParts.push(
                        vscode.l10n.t('--- Test Case {index} ---', {
                            index: idx || testCaseIndex + 1,
                        }),
                    );
                    outputParts.push(
                        vscode.l10n.t('Verdict: {name} ({fullName})', {
                            name: testResult.verdict.name,
                            fullName: testResult.verdict.fullName,
                        }),
                    );
                    outputParts.push(
                        vscode.l10n.t('Time: {time}ms', {
                            time: testResult.time,
                        }),
                    );
                    if (testResult.msg) {
                        outputParts.push(
                            vscode.l10n.t('Message: {msg}', {
                                msg: testResult.msg,
                            }),
                        );
                    }
                    outputParts.push(
                        vscode.l10n.t('Input: {input}', {
                            input: tcIo2String(tc.stdin),
                        }),
                    );
                    outputParts.push(
                        vscode.l10n.t('Expected Output (Answer): {output}', {
                            output: tcIo2String(tc.answer),
                        }),
                    );
                    outputParts.push(
                        vscode.l10n.t('Actual Output: {output}', {
                            output: tcIo2String(testResult.stdout),
                        }),
                    );
                    outputParts.push(
                        vscode.l10n.t('Error Output: {output}', {
                            output: tcIo2String(testResult.stderr),
                        }),
                    );
                    outputParts.push('');
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
