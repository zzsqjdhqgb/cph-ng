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

import * as vscode from 'vscode';
import { tcIo2Path, TCVerdicts } from '../utils/types.backend';
import { TC } from '../utils/types';
import Result from '../utils/result';
import { Logger } from '../utils/io';
import { ProcessExecutor } from '../utils/processExecutor';
import { ProcessResultHandler } from '../utils/processResultHandler';

export class Checker {
    private logger: Logger = new Logger('checker');
    private executor: ProcessExecutor = new ProcessExecutor();

    public async runChecker(
        checkerOutputPath: string,
        tc: TC,
        abortController: AbortController,
    ): Promise<Result<undefined>> {
        this.logger.trace('runChecker', {
            checkerOutputPath,
            tc,
            abortController,
        });

        try {
            const inputFile = await tcIo2Path(tc.stdin);
            const outputFile = await tcIo2Path(tc.result!.stdout);
            const answerFile = await tcIo2Path(tc.answer);

            this.logger.info(
                'Running checker',
                checkerOutputPath,
                'with arguments',
                [inputFile, outputFile, answerFile],
            );

            const result = await this.executor.execute({
                cmd: [checkerOutputPath, inputFile, outputFile, answerFile],
                ac: abortController,
            });

            this.logger.debug('Checker completed', {
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
            });

            return ProcessResultHandler.toChecker(result, abortController);
        } catch (e) {
            this.logger.warn('Checker setup failed', e);
            return {
                verdict: TCVerdicts.SE,
                msg: vscode.l10n.t('Checker setup failed: {msg}', {
                    msg: (e as Error).message,
                }),
            };
        }
    }
}
