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

import {
    CancellationToken,
    l10n,
    LanguageModelTextPart,
    LanguageModelTool,
    LanguageModelToolInvocationOptions,
    LanguageModelToolInvocationPrepareOptions,
    LanguageModelToolResult,
    PreparedToolInvocation,
} from 'vscode';
import Io from '../helpers/io';
import ProblemsManager from '../modules/problemsManager';
import { getActivePath } from '../utils/global';
import { TCIO } from '../utils/types';

interface CphTestRunnerParams {
    idx?: number;
}

class LlmTcRunner implements LanguageModelTool<CphTestRunnerParams> {
    async prepareInvocation(
        options: LanguageModelToolInvocationPrepareOptions<CphTestRunnerParams>,
        _token: CancellationToken,
    ): Promise<PreparedToolInvocation> {
        const { idx } = options.input;
        return {
            invocationMessage: idx
                ? l10n.t('Running test case {idx} using CPH-NG...', {
                      idx,
                  })
                : l10n.t('Running all test cases using CPH-NG...'),
            confirmationMessages: {
                title: l10n.t('Run Test Cases'),
                message: idx
                    ? l10n.t(
                          'Do you want to run test case {idx} for the current problem?',
                          { idx },
                      )
                    : l10n.t(
                          'Do you want to run all test cases for the current problem?',
                      ),
            },
        };
    }

    async invoke(
        options: LanguageModelToolInvocationOptions<CphTestRunnerParams>,
        token: CancellationToken,
    ): Promise<LanguageModelToolResult> {
        const { idx } = options.input;
        const result = new LanguageModelToolResult([]);

        const tcIo2String = (tcIo: TCIO) =>
            tcIo.useFile
                ? l10n.t(
                      'Data stored in file {path}, you can call `read_problem_file` to access it.',
                      { path: tcIo.path },
                  )
                : tcIo.data.trim()
                  ? '\n```\n' +
                    (tcIo.data.length > 1000
                        ? tcIo.data.substring(0, 1000) +
                          '... ' +
                          l10n.t('(truncated)')
                        : tcIo.data) +
                    '\n```'
                  : l10n.t('(<empty>)');

        const activePath = getActivePath();
        const bgProblem = await ProblemsManager.getFullProblem(activePath);
        if (!bgProblem || !bgProblem.problem) {
            result.content.push(
                new LanguageModelTextPart(
                    l10n.t(
                        'Error: No competitive programming problem found. Please open or create a problem first.',
                    ),
                ),
            );
            return result;
        }

        const problem = bgProblem.problem;
        if (idx && (idx - 1 < 0 || idx - 1 >= problem.tcOrder.length)) {
            result.content.push(
                new LanguageModelTextPart(
                    l10n.t(
                        'Error: Test case {idx} not found. Valid test cases range from 1 to {max}.',
                        { idx, max: problem.tcOrder.length },
                    ),
                ),
            );
            return result;
        }

        {
            token.onCancellationRequested(async () => {
                await ProblemsManager.stopTcs({
                    type: 'stopTcs',
                    activePath,
                    onlyOne: false,
                });
            });

            if (idx) {
                await ProblemsManager.runTc({
                    type: 'runTc',
                    activePath,
                    id: problem.tcOrder[idx - 1],
                    compile: null,
                });
            } else {
                await ProblemsManager.runTcs({
                    type: 'runTcs',
                    activePath,
                    compile: null,
                });
            }

            const refreshedBg =
                await ProblemsManager.getFullProblem(activePath);
            const tcIds = idx
                ? [refreshedBg!.problem.tcOrder[idx - 1]]
                : refreshedBg!.problem.tcOrder;
            const tcs = tcIds.map((tcId) => problem.tcs[tcId]);
            const outputParts: string[] = [];
            if (tcs[0].result!.verdict.name === 'CE') {
                outputParts.push(l10n.t('Compilation Error'));
                outputParts.push('');
                outputParts.push(Io.compilationMsg);
            } else {
                outputParts.push(l10n.t('Test cases run successfully.'));
                outputParts.push('');

                tcs.forEach((tc, testCaseIndex) => {
                    const testResult = tc.result!;
                    outputParts.push(
                        l10n.t('--- Test Case {index} ---', {
                            index: idx || testCaseIndex + 1,
                        }),
                    );
                    outputParts.push(
                        l10n.t('Verdict: {name} ({fullName})', {
                            name: testResult.verdict.name,
                            fullName: testResult.verdict.fullName,
                        }),
                    );
                    outputParts.push(
                        l10n.t('Time: {time}ms', {
                            time: testResult.time,
                        }),
                    );
                    if (testResult.msg) {
                        outputParts.push(
                            l10n.t('Message: {msg}', {
                                msg: testResult.msg,
                            }),
                        );
                    }
                    outputParts.push(
                        l10n.t('Input: {input}', {
                            input: tcIo2String(tc.stdin),
                        }),
                    );
                    outputParts.push(
                        l10n.t('Expected Output (Answer): {output}', {
                            output: tcIo2String(tc.answer),
                        }),
                    );
                    outputParts.push(
                        l10n.t('Actual Output: {output}', {
                            output: tcIo2String(testResult.stdout),
                        }),
                    );
                    outputParts.push(
                        l10n.t('Error Output: {output}', {
                            output: tcIo2String(testResult.stderr),
                        }),
                    );
                    outputParts.push('');
                });
            }
            result.content.push(
                new LanguageModelTextPart(outputParts.join('\n')),
            );
        }
        return result;
    }
}

export default LlmTcRunner;
