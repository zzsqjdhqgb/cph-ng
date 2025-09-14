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
import { createReadStream } from 'fs';
import { dirname } from 'path';
import { cwd } from 'process';
import { pipeline } from 'stream/promises';
import Logger from '../helpers/logger';
import { TCIO } from '../utils/types';

interface ProcessExecutorOptions {
    cmd: string[];
    timeout?: number;
    stdin?: TCIO;
    ac?: AbortController;
}

export interface ProcessResult {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    killed: boolean;
    startTime: number;
    endTime: number;
}

interface ProcessInfo {
    child: ChildProcessWithoutNullStreams;
    stdout: string;
    stderr: string;
    killed: boolean;
    startTime: number;
}

export default class ProcessExecutor {
    private static logger: Logger = new Logger('processExecutor');

    public static async execute(
        options: ProcessExecutorOptions,
    ): Promise<ProcessResult> {
        this.logger.trace('execute', options);
        const process = await this.createProcess(options);
        if (options.stdin) {
            const stdin = process.child.stdin;
            if (options.stdin.useFile) {
                pipeline(createReadStream(options.stdin.path), stdin);
            } else {
                stdin.write(options.stdin.data);
                stdin.end();
            }
        }
        return new Promise(async (resolve) => {
            process.child.on('close', (code, signal) => {
                resolve(this.createResult(process, code, signal));
            });
            process.child.on('error', (error) => {
                resolve(this.createErrorResult(process, error));
            });
        });
    }

    public static async executeWithPipe(
        process1Options: ProcessExecutorOptions,
        process2Options: ProcessExecutorOptions,
    ): Promise<{ process1: ProcessResult; process2: ProcessResult }> {
        const process1 = await this.createProcess(process1Options);
        const process2 = await this.createProcess(process2Options);
        pipeline(process2.child.stdout, process1.child.stdin);
        pipeline(process1.child.stdout, process2.child.stdin);

        return new Promise(async (resolve) => {
            const results: {
                process1?: ProcessResult;
                process2?: ProcessResult;
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
            process1.child.on('close', (code, signal) => {
                results.process1 = this.createResult(process1, code, signal);
                checkCompletion();
            });
            process2.child.on('close', (code, signal) => {
                results.process2 = this.createResult(process2, code, signal);
                checkCompletion();
            });
            process1.child.on('error', (error) => {
                results.process1 = this.createErrorResult(process1, error);
                process2.child.kill();
                checkCompletion();
            });
            process2.child.on('error', (error) => {
                results.process2 = this.createErrorResult(process2, error);
                process1.child.kill();
                checkCompletion();
            });
        });
    }

    private static async createProcess(
        options: ProcessExecutorOptions,
    ): Promise<ProcessInfo> {
        this.logger.trace('createProcess', options);
        const { cmd, ac, timeout } = options;
        const process: ProcessInfo = {
            child: spawn(cmd[0], cmd.slice(1), {
                cwd: cmd[0] ? dirname(cmd[0]) : cwd(),
                signal: ac?.signal,
            }),
            stdout: '',
            stderr: '',
            killed: false,
            startTime: Date.now(),
        };
        this.logger.info('Running executable', cmd, process.child.pid);
        if (timeout) {
            const timeoutId = setTimeout(() => {
                this.logger.warn(
                    'Killing process',
                    process.child.pid,
                    'due to timeout',
                    timeout,
                );
                process.killed = true;
                process.child.kill('SIGKILL');
            }, timeout);
            process.child.on('close', () => clearTimeout(timeoutId));
            process.child.on('error', () => clearTimeout(timeoutId));
        }
        process.child.stdout.on('data', (data) => {
            process.stdout += data.toString();
        });
        process.child.stderr.on('data', (data) => {
            process.stderr += data.toString();
        });
        return process;
    }

    private static createResult(
        process: ProcessInfo,
        exitCode: number | null,
        signal: NodeJS.Signals | null,
    ): ProcessResult {
        this.logger.trace('createResult', { process, exitCode, signal });
        this.logger.debug('Process close', {
            pid: process.child.pid,
            exitCode,
            signal,
        });
        return {
            exitCode,
            signal,
            ...process,
            endTime: Date.now(),
        } satisfies ProcessResult;
    }

    private static createErrorResult(
        process: ProcessInfo,
        error: Error,
    ): ProcessResult {
        this.logger.trace('createErrorResult', { process, error });
        this.logger.error('Process error', {
            process: process.child.pid,
            error,
        });
        return {
            exitCode: null,
            signal: null,
            stdout: process.stdout,
            stderr: process.stderr + error.message,
            killed: process.killed,
            startTime: process.startTime,
            endTime: Date.now(),
        };
    }
}
