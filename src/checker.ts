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

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { testCaseIOToPath, TestCaseVerdicts } from './types.backend';
import { TestCase, TestCaseVerdict } from './types';
import Result from './result';
import { Logger } from './io';

export class Checker {
    private logger: Logger = new Logger('checker');

    public async runChecker(
        checkerOutputPath: string,
        testCase: TestCase,
        abortController: AbortController,
    ): Promise<Result<{}>> {
        this.logger.trace('runChecker', {
            checkerOutputPath,
            testCase,
            abortController,
        });
        return new Promise(async (resolve) => {
            try {
                const inputFile = await testCaseIOToPath(testCase.stdin);
                const outputFile = await testCaseIOToPath(
                    testCase.result!.stdout,
                );
                const answerFile = await testCaseIOToPath(
                    testCase.result!.stderr,
                );

                this.logger.info(
                    'Running checker',
                    checkerOutputPath,
                    'with arguments',
                    [inputFile, outputFile, answerFile],
                );
                const child = spawn(
                    checkerOutputPath,
                    [inputFile, outputFile, answerFile],
                    {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        signal: abortController.signal,
                    },
                );

                let stdout = '';
                let stderr = '';

                child.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                child.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                child.on('close', (code) => {
                    this.logger.debug('Checker stopped', {
                        stdout,
                        stderr,
                        code,
                    });
                    let verdict: TestCaseVerdict;
                    let message = stderr.trim() || stdout.trim();

                    switch (code) {
                        case 0:
                            verdict = TestCaseVerdicts.AC;
                            break;
                        case 1:
                            verdict = TestCaseVerdicts.WA;
                            break;
                        case 2:
                            verdict = TestCaseVerdicts.PE;
                            break;
                        case 3:
                            verdict = TestCaseVerdicts.SE;
                            message = vscode.l10n.t('Checker run failed');
                            break;
                        case 4:
                            verdict = TestCaseVerdicts.WA;
                            message = vscode.l10n.t('Unexpected EOF');
                            break;
                        case 5:
                            verdict = TestCaseVerdicts.PC;
                            break;
                        default:
                            verdict = TestCaseVerdicts.SE;
                            this.logger.warn(
                                'Checker returned unknown exit code',
                                code,
                            );
                            message = vscode.l10n.t(
                                'Checker returned unknown exit code: {code}',
                                { code },
                            );
                    }

                    resolve({
                        verdict: verdict,
                        message: message.trim(),
                    });
                });

                child.on('error', (e: Error) => {
                    this.logger.warn('Failed to run checker', e);
                    resolve({
                        verdict: TestCaseVerdicts.SE,
                        message: vscode.l10n.t(
                            'Failed to run checker: {error}',
                            {
                                error: e.message,
                            },
                        ),
                    });
                });
            } catch (e) {
                this.logger.warn('Checker setup failed', e);
                resolve({
                    verdict: TestCaseVerdicts.SE,
                    message: vscode.l10n.t('Checker setup failed: {error}', {
                        error: (e as Error).message,
                    }),
                });
            }
        });
    }
}
