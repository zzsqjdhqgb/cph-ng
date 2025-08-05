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
import { tcIo2Path, TCVerdicts } from '../utils/types.backend';
import { TC, TCVerdict } from '../utils/types';
import Result from '../utils/result';
import { Logger } from '../utils/io';

export class Checker {
    private logger: Logger = new Logger('checker');

    public async runChecker(
        checkerOutputPath: string,
        tc: TC,
        abortController: AbortController,
    ): Promise<Result<{}>> {
        this.logger.trace('runChecker', {
            checkerOutputPath,
            tc,
            abortController,
        });
        return new Promise(async (resolve) => {
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
                    let verdict: TCVerdict;
                    let msg = stderr.trim() || stdout.trim();

                    switch (code) {
                        case 0:
                            verdict = TCVerdicts.AC;
                            break;
                        case 1:
                            verdict = TCVerdicts.WA;
                            break;
                        case 2:
                            verdict = TCVerdicts.PE;
                            break;
                        case 3:
                            verdict = TCVerdicts.SE;
                            msg += `\n${vscode.l10n.t('Checker run failed')}`;
                            break;
                        case 4:
                            verdict = TCVerdicts.WA;
                            msg += `\n${vscode.l10n.t('Unexpected EOF')}`;
                            break;
                        case 5:
                            verdict = TCVerdicts.PC;
                            break;
                        default:
                            verdict = TCVerdicts.SE;
                            this.logger.warn(
                                'Checker returned unknown exit code',
                                code,
                            );
                            msg += `\n${vscode.l10n.t(
                                'Checker returned unknown exit code: {code}',
                                { code },
                            )}`;
                    }

                    resolve({
                        verdict,
                        msg: msg.trim(),
                    });
                });

                child.on('error', (e: Error) => {
                    this.logger.warn('Failed to run checker', e);
                    resolve({
                        verdict: TCVerdicts.SE,
                        msg: vscode.l10n.t('Failed to run checker: {msg}', {
                            msg: e.message,
                        }),
                    });
                });
            } catch (e) {
                this.logger.warn('Checker setup failed', e);
                resolve({
                    verdict: TCVerdicts.SE,
                    msg: vscode.l10n.t('Checker setup failed: {msg}', {
                        msg: (e as Error).message,
                    }),
                });
            }
        });
    }
}
