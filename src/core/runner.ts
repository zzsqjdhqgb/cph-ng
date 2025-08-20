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
import Settings from '../utils/settings';
import { TCVerdicts } from '../utils/types.backend';
import { TCIO, TCVerdict } from '../utils/types';
import Result from '../utils/result';
import { Logger } from '../utils/io';

type RunnerResult = Result<undefined> & {
    time: number;
    stdout: string;
    stderr: string;
};

export class Runner {
    private logger: Logger = new Logger('runner');

    public async runExecutable(
        executablePath: string,
        timeLimit: number,
        stdin: TCIO,
        abortController: AbortController,
    ): Promise<RunnerResult> {
        this.logger.trace('runExecutable', {
            executablePath,
            timeLimit,
            stdin,
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

            const commonResolve = (verdict: TCVerdict, msg: string) => {
                const endTime = Date.now();
                clearTimeout(killTimeout);
                this.logger.debug('Process completed', {
                    verdict,
                    msg,
                    duration: endTime - startTime,
                });
                resolve({
                    verdict,
                    msg,
                    stdout,
                    stderr,
                    time: endTime - startTime,
                } satisfies RunnerResult);
            };

            child.on('close', (code, signal) => {
                if (killed) {
                    commonResolve(
                        TCVerdicts.TLE,
                        vscode.l10n.t('Killed due to timeout'),
                    );
                } else if (code) {
                    commonResolve(
                        TCVerdicts.RE,
                        vscode.l10n.t('Process exited with code: {code}.', {
                            code,
                        }),
                    );
                } else if (signal) {
                    commonResolve(
                        TCVerdicts.RE,
                        vscode.l10n.t('Process exited with signal: {signal}.', {
                            signal,
                        }),
                    );
                } else {
                    commonResolve(TCVerdicts.UKE, '');
                }
            });

            child.on('error', (e: Error) => {
                this.logger.error('Process error', e);
                commonResolve(
                    abortController.signal.aborted
                        ? TCVerdicts.RJ
                        : TCVerdicts.SE,
                    e.message,
                );
            });

            if (stdin.useFile) {
                const inputStream = createReadStream(stdin.path, {
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

                inputStream.on('error', (e: Error) => {
                    this.logger.error('Input stream error', e);
                    commonResolve(
                        TCVerdicts.SE,
                        vscode.l10n.t('Input file read failed: {msg}.', {
                            msg: e.message,
                        }),
                    );
                });
            } else {
                child.stdin.write(stdin.data);
                child.stdin.end();
                this.logger.debug('Input written to stdin', {
                    stdin: stdin.data,
                });
            }
        });
    }
}
