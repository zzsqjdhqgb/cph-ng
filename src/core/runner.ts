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

import { SHA256 } from 'crypto-js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { l10n } from 'vscode';
import Logger from '../helpers/logger';
import ProcessExecutor from '../helpers/processExecutor';
import {
    ProcessResult,
    ProcessResultHandler,
} from '../helpers/processResultHandler';
import ProblemsManager from '../modules/problemsManager';
import Settings from '../modules/settings';
import { assignResult } from '../utils/result';
import { Problem, TC, TCIO, TCResult } from '../utils/types';
import { tcIo2Str, TCVerdicts, write2TcIo } from '../utils/types.backend';
import { Checker } from './checker';
import { CompileResult } from './compiler';
import { Lang } from './langs/lang';

interface RunOptions {
    cmd: string[];
    timeLimit: number;
    stdin: TCIO;
    ac: AbortController;
    enableRunner: boolean;
}

export class Runner {
    private static logger: Logger = new Logger('runner');

    private static getTCHash(problem: Problem, tc: TC) {
        return SHA256(
            `${problem.src.path}-${
                tc.stdin.useFile ? tc.stdin.path : tc.stdin.data
            }`,
        )
            .toString()
            .substring(64 - 6);
    }

    // The ProcessResult.data must be not-null when verdict is UKE
    public static async doRun(
        options: RunOptions,
        interactor?: string,
    ): Promise<ProcessResult> {
        this.logger.trace('runExecutable', { options, interactor });
        return interactor
            ? this.runWithInteractor(interactor, options)
            : this.runWithoutInteractor(options);
    }

    private static async runWithoutInteractor(
        options: RunOptions,
    ): Promise<ProcessResult> {
        if (Settings.runner.useRunner && Settings.compilation.useWrapper) {
            return {
                verdict: TCVerdicts.RJ,
                msg: l10n.t(
                    'Cannot use both runner and wrapper at the same time',
                ),
            };
        }

        // Adjust time limit for runner overhead
        return ProcessResultHandler.parse(
            await (Settings.runner.useRunner && options.enableRunner
                ? ProcessExecutor.executeWithRunner({
                      ...options,
                      timeout: options.timeLimit + Settings.runner.timeAddition,
                  })
                : ProcessExecutor.execute({
                      ...options,
                      cmd: Settings.runner.unlimitedStack
                          ? [...options.cmd, '--unlimited-stack']
                          : options.cmd,
                      timeout: options.timeLimit + Settings.runner.timeAddition,
                  })),
        );
    }

    private static async runWithInteractor(
        interactor: string,
        options: RunOptions,
    ): Promise<ProcessResult> {
        // Prepare input and output files
        const hash = SHA256(
            `${options.cmd.join(' ')}-${Date.now()}-${Math.random()}`,
        )
            .toString()
            .substring(0, 8);
        const ioDir = join(Settings.cache.directory, 'io');
        const inputFile = join(ioDir, `${hash}.in`);
        const outputFile = join(ioDir, `${hash}.out`);
        await writeFile(inputFile, await tcIo2Str(options.stdin));
        await writeFile(outputFile, '');

        // Launch both processes with pipe
        const { process1: solResult, process2: intResult } =
            await ProcessExecutor.launchWithPipe(
                {
                    cmd: options.cmd,
                    timeout: options.timeLimit + Settings.runner.timeAddition,
                    ac: options.ac,
                },
                {
                    cmd: [interactor, inputFile, outputFile],
                    timeout: options.timeLimit + Settings.runner.timeAddition,
                    ac: options.ac,
                },
            );
        this.logger.debug('Interactor execution completed', {
            solResult,
            intResult,
        });

        // Process results
        const intProcessResult = ProcessResultHandler.parseChecker(intResult);
        const solProcessResult = ProcessResultHandler.parse(solResult);
        return {
            ...(intProcessResult.verdict !== TCVerdicts.UKE
                ? intProcessResult
                : solProcessResult),
            data: solProcessResult.data && {
                ...solProcessResult.data,
                stdout: await readFile(outputFile, 'utf-8'),
            },
        } satisfies ProcessResult;
    }

    public static async run(
        problem: Problem,
        result: TCResult,
        ac: AbortController,
        lang: Lang,
        tc: TC,
        compileData: NonNullable<CompileResult['data']>,
    ) {
        try {
            result.verdict = TCVerdicts.JG;
            await ProblemsManager.dataRefresh();

            const runResult = await this.doRun(
                {
                    cmd: await lang.runCommand(
                        compileData.src.outputPath,
                        problem.compilationSettings,
                    ),
                    timeLimit: problem.timeLimit,
                    stdin: tc.stdin,
                    ac,
                    enableRunner: lang.enableRunner,
                },
                compileData.interactor?.outputPath,
            );
            if (runResult.data) {
                const { time, memory, stdout, stderr } = runResult.data;

                // Update time and memory
                result.time = time;
                result.memory = memory;

                // Handle stdout and stderr
                if (
                    tc.answer.useFile ||
                    (Settings.runner.stdoutThreshold !== -1 &&
                        stdout.length >= Settings.runner.stdoutThreshold)
                ) {
                    result.stdout = {
                        useFile: true,
                        path: join(
                            Settings.cache.directory,
                            'out',
                            `${this.getTCHash(problem, tc)}.out`,
                        ),
                    };
                } else {
                    result.stdout.useFile = false;
                }
                result.stdout = await write2TcIo(result.stdout, stdout);
                if (
                    Settings.runner.stderrThreshold !== -1 &&
                    stderr.length >= Settings.runner.stderrThreshold
                ) {
                    result.stderr = {
                        useFile: true,
                        path: join(
                            Settings.cache.directory,
                            'out',
                            `${this.getTCHash(problem, tc)}.err`,
                        ),
                    };
                } else {
                    result.stderr.useFile = false;
                }
                result.stderr = await write2TcIo(result.stderr, stderr);
                await ProblemsManager.dataRefresh();
            }
            if (assignResult(result, runResult)) {
                return;
            }
            result.verdict = TCVerdicts.JGD;

            // Determine verdict
            if (result.time && result.time > problem.timeLimit) {
                result.verdict = TCVerdicts.TLE;
            } else if (result.memory && result.memory > problem.memoryLimit) {
                result.verdict = TCVerdicts.MLE;
            } else {
                result.verdict = TCVerdicts.CMP;
                await ProblemsManager.dataRefresh();
                assignResult(
                    result,
                    compileData.checker
                        ? await Checker.runChecker(
                              compileData.checker.outputPath,
                              tc,
                              ac,
                          )
                        : ProcessResultHandler.compareOutputs(
                              await tcIo2Str(result.stdout),
                              await tcIo2Str(tc.answer),
                              await tcIo2Str(result.stderr),
                          ),
                );
            }
        } catch (e) {
            assignResult(result, {
                verdict: TCVerdicts.SE,
                msg: l10n.t('Runtime error occurred: {error}', {
                    error: (e as Error).message,
                }),
            });
        } finally {
            await ProblemsManager.dataRefresh();
        }
    }
}
