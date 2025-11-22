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
import { platform } from 'process';
import { l10n } from 'vscode';
import Logger from '../helpers/logger';
import ProcessExecutor from '../helpers/processExecutor';
import {
    ProcessData,
    ProcessResultHandler,
} from '../helpers/processResultHandler';
import ProblemsManager from '../modules/problemsManager';
import Settings from '../modules/settings';
import { extensionPath } from '../utils/global';
import { KnownResult, Result } from '../utils/result';
import {
    Problem,
    TCIO,
    TCVerdicts,
    TCWithResult,
} from '../utils/types.backend';
import { Checker } from './checker';
import { CompileData } from './compiler';
import { LangCpp } from './langs/cpp';
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

    // The KnownResult<ProcessData>.data must be not-null when verdict is UKE
    public static async doRun(
        options: RunOptions,
        interactor?: string,
    ): Promise<Result<ProcessData>> {
        this.logger.trace('runExecutable', { options, interactor });
        return interactor
            ? this.runWithInteractor(interactor, options)
            : this.runWithoutInteractor(options);
    }

    private static async getRunnerPath(): Promise<string | null> {
        const srcPath =
            platform === 'win32'
                ? join(extensionPath, 'res', 'runner-windows.cpp')
                : join(extensionPath, 'res', 'runner-linux.cpp');
        const runnerLang = new LangCpp();
        const langCompileResult = await runnerLang.compile(
            { path: srcPath },
            new AbortController(),
            null,
            {
                canUseWrapper: false,
                compilationSettings: {
                    compiler: Settings.compilation.cppCompiler,
                    compilerArgs:
                        platform === 'win32'
                            ? '-lpsapi -ladvapi32 -static'
                            : '-pthread',
                },
            },
        );
        if (langCompileResult instanceof KnownResult) {
            this.logger.error(
                'Failed to compile runner program',
                langCompileResult,
            );
            return null;
        }
        return langCompileResult.data.outputPath;
    }

    private static async runWithoutInteractor(
        options: RunOptions,
    ): Promise<Result<ProcessData>> {
        if (Settings.runner.useRunner && Settings.compilation.useWrapper) {
            return new KnownResult(
                TCVerdicts.RJ,
                l10n.t('Cannot use both runner and wrapper at the same time'),
            );
        }

        let runnerPath: string | null = null;
        if (Settings.runner.useRunner && options.enableRunner) {
            runnerPath = await this.getRunnerPath();
            if (!runnerPath) {
                return new KnownResult(
                    TCVerdicts.SE,
                    l10n.t('Failed to compile runner program'),
                );
            }
        }

        // Adjust time limit for runner overhead
        return await ProcessResultHandler.parse(
            await (runnerPath
                ? ProcessExecutor.executeWithRunner(
                      {
                          ...options,
                          timeout:
                              options.timeLimit + Settings.runner.timeAddition,
                      },
                      runnerPath,
                  )
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
    ): Promise<KnownResult<ProcessData>> {
        // Prepare input and output files
        const hash = SHA256(
            `${options.cmd.join(' ')}-${Date.now()}-${Math.random()}`,
        )
            .toString()
            .substring(0, 8);
        const ioDir = join(Settings.cache.directory, 'io');
        const inputFile = join(ioDir, `${hash}.in`);
        const outputFile = join(ioDir, `${hash}.out`);
        await writeFile(inputFile, await options.stdin.toString());
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
        const intProcessResult =
            await ProcessResultHandler.parseChecker(intResult);
        const solProcessResult = await ProcessResultHandler.parse(solResult);
        return {
            ...(solProcessResult instanceof KnownResult
                ? solProcessResult
                : intProcessResult),
            data: intProcessResult.data && {
                ...intProcessResult.data,
                stdoutPath: outputFile,
            },
        };
    }

    public static async run(
        problem: Problem,
        tc: TCWithResult,
        lang: Lang,
        ac: AbortController,
        compileData: CompileData,
    ) {
        try {
            tc.result.verdict = TCVerdicts.JG;
            await ProblemsManager.dataRefresh();

            const runResult = await this.doRun(
                {
                    cmd: await lang.getRunCommand(
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
                const { time, memory, stdoutPath, stderrPath } = runResult.data;

                // Update time and memory
                tc.result.time = time;
                tc.result.memory = memory;

                // Handle stdout and stderr
                ((tc.result.stdout = new TCIO(true, stdoutPath)),
                    await tc.result.stdout.inlineSmall());
                ((tc.result.stderr = new TCIO(true, stderrPath)),
                    await tc.result.stderr.inlineSmall());
                await ProblemsManager.dataRefresh();
            }
            if (runResult instanceof KnownResult) {
                tc.result.fromResult(runResult);
                return;
            }
            tc.result.verdict = TCVerdicts.JGD;

            // Determine verdict
            if (tc.result.time && tc.result.time > problem.timeLimit) {
                tc.result.verdict = TCVerdicts.TLE;
            } else if (
                tc.result.memory &&
                tc.result.memory > problem.memoryLimit
            ) {
                tc.result.verdict = TCVerdicts.MLE;
            } else {
                tc.result.verdict = TCVerdicts.CMP;
                await ProblemsManager.dataRefresh();
                if (compileData.checker) {
                    const checkerResult = await Checker.runChecker(
                        compileData.checker.outputPath,
                        tc,
                        ac,
                    );
                    tc.result.fromResult(checkerResult);
                    const stderrPath = checkerResult.data?.stderrPath;
                    if (stderrPath) {
                        tc.result.msg.push(await readFile(stderrPath, 'utf-8'));
                    }
                } else {
                    tc.result.fromResult(
                        ProcessResultHandler.compareOutputs(
                            await tc.result.stdout.toString(),
                            await tc.answer.toString(),
                            await tc.result.stderr.toString(),
                        ),
                    );
                }
            }
        } catch (e) {
            tc.result.verdict = TCVerdicts.SE;
            tc.result.msg.push(
                l10n.t('Runtime error occurred: {error}', {
                    error: (e as Error).message,
                }),
            );
        } finally {
            await ProblemsManager.dataRefresh();
        }
    }
}
