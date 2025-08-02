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
import { TestCaseVerdicts } from './types.backend';
import { TestCase, TestCaseVerdict } from './types';
import Result from './result';
import { Logger } from './io';

type RunnerResult = Result<{
    time: number;
    stdout: string;
    stderr: string;
}>;

export class Runner {
    private logger: Logger = new Logger('runner');

    public async runExecutable(
        executablePath: string,
        timeLimit: number,
        testCase: TestCase,
        abortController: AbortController,
    ): Promise<RunnerResult> {
        this.logger.trace('runExecutable', {
            executablePath,
            timeLimit,
            testCase,
        });
        this.logger.info('Running executable', executablePath);
        return new Promise((resolve) => {
            const startTime = Date.now();
            const child = spawn(executablePath, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: dirname(executablePath),
                signal: abortController.signal,
            });

            let stdout = '';
            let stderr = '';
            let killed = false;

            const killTimeout = setTimeout(() => {
                killed = true;
                this.logger.warn('Killing process due to timeout', {
                    executablePath,
                    timeLimit,
                });
                child.kill('SIGKILL');
            }, timeLimit + Settings.runner.timeAddition);

            child.stdout.on('data', (data) => {
                stdout += data.toString();
                this.logger.debug('Process stdout', { data: data.toString() });
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
                this.logger.debug('Process stderr', { data: data.toString() });
            });

            const commonResolve = (
                verdict: TestCaseVerdict,
                message: string,
            ) => {
                const endTime = Date.now();
                clearTimeout(killTimeout);
                this.logger.debug('Process completed', {
                    verdict,
                    message,
                    duration: endTime - startTime,
                });
                resolve({
                    verdict,
                    message,
                    data: {
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                        time: endTime - startTime,
                    },
                } as RunnerResult);
            };

            child.on('close', (code, signal) => {
                if (killed) {
                    commonResolve(
                        TestCaseVerdicts.TLE,
                        vscode.l10n.t('Killed due to timeout'),
                    );
                } else if (code) {
                    commonResolve(
                        TestCaseVerdicts.RE,
                        vscode.l10n.t('Process exited with code: {code}.', {
                            code,
                        }),
                    );
                } else if (signal) {
                    commonResolve(
                        TestCaseVerdicts.RE,
                        vscode.l10n.t('Process exited with signal: {signal}.', {
                            signal,
                        }),
                    );
                } else {
                    commonResolve(TestCaseVerdicts.UKE, '');
                }
            });

            child.on('error', (err: Error) => {
                this.logger.error('Process error', err);
                commonResolve(
                    abortController.signal.aborted
                        ? TestCaseVerdicts.RJ
                        : TestCaseVerdicts.SE,
                    err.message,
                );
            });

            if (testCase.stdin.useFile) {
                const inputStream = createReadStream(testCase.stdin.path, {
                    encoding: 'utf8',
                });

                inputStream.on('data', (chunk) => {
                    child.stdin.write(chunk);
                    this.logger.debug('Writing to stdin', { chunk });
                });

                inputStream.on('end', () => {
                    child.stdin.end();
                    this.logger.debug('Input stream ended');
                });

                inputStream.on('error', (err: Error) => {
                    this.logger.error('Input stream error', err);
                    commonResolve(
                        TestCaseVerdicts.SE,
                        vscode.l10n.t('Input file read failed: {message}.', {
                            message: err.message,
                        }),
                    );
                });
            } else {
                child.stdin.write(testCase.stdin.data);
                child.stdin.end();
                this.logger.debug('Input written to stdin', {
                    stdin: testCase.stdin.data,
                });
            }
        });
    }
}
