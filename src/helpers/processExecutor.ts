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

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { SHA256 } from 'crypto-js';
import { createReadStream } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { constants } from 'os';
import { dirname, join } from 'path';
import { cwd, platform } from 'process';
import { pipeline } from 'stream/promises';
import { l10n } from 'vscode';
import Logger from '../helpers/logger';
import Settings from '../modules/settings';
import { extensionPath } from '../utils/global';
import { exists } from '../utils/process';
import { TCIO } from '../utils/types';
import { tcIo2Path } from '../utils/types.backend';
import Io from './io';

interface LaunchOptions {
    cmd: string[];
    timeout?: number;
    ac?: AbortController;
    debug?: boolean;
    stdin?: TCIO;
}
interface LaunchResult {
    child: ChildProcessWithoutNullStreams;
    acSignal: AbortSignal;
    stdout: string;
    stderr: string;
    startTime: number;
    endTime?: number;
    memory?: number;
}

export type ExecuteResult =
    | Error
    | {
          // The exit code or signal that terminated the process
          codeOrSignal: number | NodeJS.Signals;
          stdout: string;
          stderr: string;
          time: number;
          memory?: number;
          abortReason?: AbortReason;
      };

type RunnerOutput =
    | {
          error: false;
          killed: boolean;
          time: number;
          memory: number;
          exitCode: number;
          signal: number;
      }
    | {
          error: true;
          error_type: number;
          error_code: number;
      };

export enum AbortReason {
    UserAbort = 'user_abort',
    Timeout = 'timeout',
}

export default class ProcessExecutor {
    private static logger: Logger = new Logger('processExecutor');

    public static async executeWithRunner(
        options: LaunchOptions,
    ): Promise<ExecuteResult> {
        this.logger.trace('executeWithRunner', options);
        if (options.debug) {
            return ProcessExecutor.toErrorResult(
                l10n.t('Debug mode not supported with runner'),
            );
        }
        if (!options.stdin) {
            return ProcessExecutor.toErrorResult(
                l10n.t('stdin is required for runner execution'),
            );
        }

        const runnerPath = join(Settings.cache.directory, 'bin', 'runner.a');
        if (!(await exists(runnerPath))) {
            if (!['win32', 'linux'].includes(platform)) {
                return ProcessExecutor.toErrorResult(
                    l10n.t(`Runner is unsupported for {platform}`, {
                        platform,
                    }),
                );
            }
            const result = await ProcessExecutor.execute({
                cmd: [
                    Settings.compilation.cppCompiler,
                    '-o',
                    runnerPath,
                    ...(platform === 'win32'
                        ? [
                              join(extensionPath, 'res', 'runner-windows.cpp'),
                              '-lpsapi',
                              '-ladvapi32',
                              '-static',
                          ]
                        : [
                              join(extensionPath, 'res', 'runner-linux.cpp'),
                              '-pthread',
                          ]),
                ],
            });
            if (result instanceof Error) {
                Io.compilationMsg = result.message;
                return ProcessExecutor.toErrorResult(
                    l10n.t('Failed to compile runner program'),
                );
            } else if (result.codeOrSignal) {
                Io.compilationMsg = result.stderr;
                return ProcessExecutor.toErrorResult(
                    l10n.t('Failed to compile runner program'),
                );
            }
        }

        const { cmd, stdin, ac, timeout } = options;
        const unifiedAc = new AbortController();
        if (ac) {
            ac.signal.addEventListener('abort', () =>
                unifiedAc.abort(AbortReason.UserAbort),
            );
        }

        const hash = SHA256(`${cmd.join(' ')}-${Date.now()}-${Math.random()}`)
            .toString()
            .substring(0, 8);

        const ioDir = join(Settings.cache.directory, 'io');
        const inputFile = await tcIo2Path(stdin);
        const outputFile = join(ioDir, `${hash}.out`);
        const errorFile = join(ioDir, `${hash}.err`);
        await writeFile(outputFile, '');
        await writeFile(errorFile, '');

        const runnerCmd = [
            runnerPath,
            cmd.join(' '),
            inputFile,
            outputFile,
            errorFile,
        ];
        if (Settings.runner.unlimitedStack) {
            runnerCmd.push('--unlimited-stack');
        }

        // We use our own timeout handling to allow graceful exit
        const launch = await this.launch({
            cmd: runnerCmd,
        });

        const timeoutId = setTimeout(() => {
            this.logger.warn(
                'Soft killing runner',
                launch.child.pid,
                'due to timeout',
                timeout,
            );
            unifiedAc.abort(AbortReason.Timeout);
        }, timeout);
        unifiedAc.signal.addEventListener('abort', () => {
            launch.child.stdin.write('k');
            launch.child.stdin.end();
        });

        return new Promise(async (resolve) => {
            launch.child.on('close', async (code, signal) => {
                clearTimeout(timeoutId);
                if (code || signal) {
                    resolve(
                        this.toErrorResult(
                            l10n.t(
                                'Runner does not exit properly with code {code}',
                                { code: code ?? signal! },
                            ),
                        ),
                    );
                    return;
                }
                try {
                    this.logger.info('Reading runner output', launch);
                    const runInfo = JSON.parse(launch.stdout) as RunnerOutput;
                    this.logger.info('Runner output', runInfo);
                    if (runInfo.error) {
                        resolve(
                            this.toErrorResult(
                                l10n.t('Runner error {type} with code {code}', {
                                    type: runInfo.error_type,
                                    code: runInfo.error_code,
                                }),
                            ),
                        );
                    } else {
                        resolve(
                            this.toResult(
                                {
                                    ...launch,
                                    acSignal: unifiedAc.signal,
                                    stdout: await readFile(outputFile, 'utf8'),
                                    stderr: await readFile(errorFile, 'utf8'),
                                    // Just need to ensure endTime - startTime = time
                                    startTime: 0,
                                    endTime: runInfo.time,
                                    memory: runInfo.memory,
                                },
                                (Object.entries(constants.signals).find(
                                    ([, val]) => val === runInfo.signal,
                                )?.[0] as NodeJS.Signals) || runInfo.exitCode,
                            ),
                        );
                    }
                } catch (e) {
                    this.logger.error('Error parsing runner output', e);
                    if (e instanceof SyntaxError) {
                        resolve(
                            this.toErrorResult(
                                l10n.t('Runner output is invalid JSON'),
                            ),
                        );
                    } else {
                        resolve(
                            this.toErrorResult(
                                l10n.t(
                                    'Error occurred while processing runner output',
                                ),
                            ),
                        );
                    }
                }
            });
            launch.child.on('error', (error) => {
                clearTimeout(timeoutId);
                resolve(this.toErrorResult(error));
            });
        });
    }

    public static async execute(
        options: LaunchOptions,
    ): Promise<ExecuteResult> {
        this.logger.trace('execute', options);
        const launch = await this.launch(options);
        return new Promise(async (resolve) => {
            launch.child.on('close', (code, signal) => {
                resolve(this.toResult(launch, code ?? signal!));
            });
            launch.child.on('error', (error) => {
                error.name === 'AbortError' ||
                    resolve(this.toErrorResult(error));
            });
        });
    }

    public static async launchWithPipe(
        process1Options: LaunchOptions,
        process2Options: LaunchOptions,
    ): Promise<{ process1: ExecuteResult; process2: ExecuteResult }> {
        const process1 = await this.launch(process1Options);
        const process2 = await this.launch(process2Options);

        // Pipe the processes
        pipeline(process2.child.stdout, process1.child.stdin);
        pipeline(process1.child.stdout, process2.child.stdin);

        // Wait for both processes to complete
        return new Promise(async (resolve) => {
            const results: {
                process1?: ExecuteResult;
                process2?: ExecuteResult;
            } = {};

            const checkCompletion = () => {
                this.logger.trace('checkCompletion', {
                    results,
                });
                if (results.process1 && results.process2) {
                    resolve({
                        process1: results.process1,
                        process2: results.process2,
                    });
                }
            };

            // Handle any process exit or error
            // https://nodejs.org/docs/latest/api/child_process.html#event-close
            // "One of the two will always be non-null."
            process1.child.on('close', (code, signal) => {
                results.process1 ||= this.toResult(process1, code ?? signal!);
                checkCompletion();
            });
            process2.child.on('close', (code, signal) => {
                results.process2 ||= this.toResult(process2, code ?? signal!);
                checkCompletion();
            });
            process1.child.on('error', (error) => {
                if (error.name === 'AbortError') {
                    return;
                }
                results.process1 ||= this.toErrorResult(error);
                results.process2 || process2.child.kill();
                checkCompletion();
            });
            process2.child.on('error', (error) => {
                if (error.name === 'AbortError') {
                    return;
                }
                results.process2 ||= this.toErrorResult(error);
                results.process1 || process1.child.kill();
                checkCompletion();
            });
        });
    }

    public static async launch(options: LaunchOptions): Promise<LaunchResult> {
        this.logger.trace('createProcess', options);
        const { cmd, ac, timeout, debug, stdin } = options;

        // Use a unified AbortController to handle both external and internal aborts
        const unifiedAc = new AbortController();
        if (ac) {
            ac.signal.addEventListener('abort', () =>
                unifiedAc.abort(AbortReason.UserAbort),
            );
        }

        const child = spawn(cmd[0], cmd.slice(1), {
            cwd: cmd[0] ? dirname(cmd[0]) : cwd(),
            signal: unifiedAc.signal,
        });
        this.logger.info('Running executable', options, child.pid);
        const result: LaunchResult = {
            child,
            acSignal: unifiedAc.signal,
            stdout: '',
            stderr: '',
            startTime: Date.now(),
        };

        // Send SIGSTOP for debugging
        if (debug) {
            if (!child.kill('SIGSTOP')) {
                this.logger.error(
                    'Failed to stop process for debugging',
                    child.pid,
                );
            }
        }

        // Process timeout
        if (timeout) {
            const timeoutId = setTimeout(() => {
                this.logger.warn(
                    `Process ${child.pid} reached timeout ${timeout}ms`,
                );
                unifiedAc.abort(AbortReason.Timeout);
            }, timeout);
            child.on('close', () => clearTimeout(timeoutId));
            child.on('error', () => clearTimeout(timeoutId));
        }

        // Process stdio
        if (stdin) {
            stdin.useFile
                ? pipeline(createReadStream(stdin.path), child.stdin)
                : (child.stdin.write(stdin.data), child.stdin.end());
        }
        child.stdout.on('data', (data) => {
            result.stdout += data.toString();
        });
        child.stderr.on('data', (data) => {
            result.stderr += data.toString();
        });

        return result;
    }

    private static toResult(
        launch: LaunchResult,
        data: number | NodeJS.Signals,
    ): ExecuteResult {
        this.logger.trace('toResult', { launch, data });
        this.logger.debug(`Process ${launch.child.pid} close`, data);
        return {
            codeOrSignal: data,
            abortReason: launch.acSignal.reason as AbortReason | undefined,
            // A fallback for time if not set
            time: (launch.endTime ?? Date.now()) - launch.startTime,
            ...launch,
        };
    }
    private static toErrorResult(data: Error | string): ExecuteResult {
        this.logger.trace('toErrorResult', { data });
        if (data instanceof Error) {
            return data;
        }
        return new Error(data);
    }
}
