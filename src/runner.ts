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
import { createReadStream } from 'fs';
import { dirname } from 'path';
import * as vscode from 'vscode';
import Settings from './settings';
import { TestCaseStatuses } from './testCaseStatuses';
import { TestCase, TestCaseStatus } from './types';

export interface RunResult {
    output: string;
    error: string;
    time?: number;
    status: TestCaseStatus;
}

export class Runner {
    public async runExecutable(
        executablePath: string,
        timeLimit: number,
        testCase: TestCase,
        abortController: AbortController,
    ): Promise<RunResult> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const child = spawn(executablePath, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: dirname(executablePath),
                signal: abortController.signal,
            });

            let output = '';
            let error = '';
            let killed = false;

            const killTimeout = setTimeout(() => {
                killed = true;
                child.kill('SIGKILL');
            }, timeLimit + Settings.runner.timeAddition);

            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.stderr.on('data', (data) => {
                error += data.toString();
            });

            const commonResolve = (
                finalStatus: TestCaseStatus,
                additionalError: string,
            ) => {
                const endTime = Date.now();
                clearTimeout(killTimeout);
                resolve({
                    output: output.trim(),
                    error: `${error}\n${additionalError}`.trim(),
                    status: finalStatus,
                    time: endTime - startTime,
                });
            };

            child.on('close', (code, signal) => {
                if (killed) {
                    commonResolve(
                        TestCaseStatuses.TLE,
                        vscode.l10n.t('Killed due to timeout'),
                    );
                } else if (code) {
                    commonResolve(
                        TestCaseStatuses.RE,
                        vscode.l10n.t('Process exited with code: {code}.', {
                            code,
                        }),
                    );
                } else if (signal) {
                    commonResolve(
                        TestCaseStatuses.RE,
                        vscode.l10n.t('Process exited with signal: {signal}.', {
                            signal,
                        }),
                    );
                } else {
                    commonResolve(TestCaseStatuses.UKE, '');
                }
            });

            child.on('error', (err: Error) => {
                commonResolve(
                    abortController.signal.aborted
                        ? TestCaseStatuses.RJ
                        : TestCaseStatuses.SE,
                    err.message,
                );
            });

            if (testCase.inputFile) {
                const inputFile = testCase.input;
                const inputStream = createReadStream(inputFile, {
                    encoding: 'utf8',
                });

                inputStream.on('data', (chunk) => {
                    child.stdin.write(chunk);
                });

                inputStream.on('end', () => {
                    child.stdin.end();
                });

                inputStream.on('error', (err: Error) => {
                    commonResolve(
                        TestCaseStatuses.SE,
                        vscode.l10n.t('Input file read failed: {message}.', {
                            message: err.message,
                        }),
                    );
                });
            } else {
                child.stdin.write(testCase.input);
                child.stdin.end();
            }
        });
    }
}
