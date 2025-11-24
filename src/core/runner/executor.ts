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

import { LangCpp } from '@/core/langs/cpp';
import Cache from '@/helpers/cache';
import Logger from '@/helpers/logger';
import ProcessExecutor from '@/helpers/processExecutor';
import {
    ProcessData,
    ProcessResultHandler,
} from '@/helpers/processResultHandler';
import Settings from '@/helpers/settings';
import { extensionPath } from '@/utils/global';
import { KnownResult, Result } from '@/utils/result';
import { TcIo, TcVerdicts } from '@/utils/types.backend';
import { join } from 'path';
import { platform } from 'process';
import { l10n } from 'vscode';

export interface RunOptions {
    cmd: string[];
    timeLimit: number;
    stdin: TcIo;
    ac: AbortController;
    enableRunner: boolean;
}

export class Executor {
    private static logger: Logger = new Logger('executor');

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
                TcVerdicts.RJ,
                l10n.t('Cannot use both runner and wrapper at the same time'),
            );
        }

        let runnerPath: string | null = null;
        if (Settings.runner.useRunner && options.enableRunner) {
            runnerPath = await this.getRunnerPath();
            if (!runnerPath) {
                return new KnownResult(
                    TcVerdicts.SE,
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
        const inputFile = await options.stdin.toPath();
        const outputFile = await Cache.createIo();

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
}
