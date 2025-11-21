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

import assert from 'assert';
import { readFile, writeFile } from 'fs/promises';
import { l10n } from 'vscode';
import Logger from '../helpers/logger';
import Settings from '../modules/settings';
import Result from '../utils/result';
import { TCVerdict } from '../utils/types';
import { TCVerdicts } from '../utils/types.backend';
import { AbortReason, ExecuteResult } from './processExecutor';

export interface WrapperData {
    time: number; // in nanoseconds
}

export type ProcessResult = Result<{
    time: number;
    memory?: number;
    stdoutPath: string;
    stderrPath: string;
}>;

export class ProcessResultHandler {
    private static logger: Logger = new Logger('processResultHandler');

    public static async extractWrapperData(
        stderrPath: string,
    ): Promise<WrapperData | undefined> {
        const stderrContent = await readFile(stderrPath, 'utf-8');
        const wrapperDataRegex = /-----CPH DATA STARTS-----(\{.*?\})-----/s;
        const match = stderrContent.match(wrapperDataRegex);
        if (match) {
            const wrapperDataStr = match[1];
            let wrapperData: WrapperData | undefined;
            try {
                wrapperData = JSON.parse(wrapperDataStr) as WrapperData;
            } catch (e) {
                this.logger.error(
                    'Failed to parse wrapper data JSON',
                    e as Error,
                );
            }
            await writeFile(
                stderrPath,
                stderrContent.replace(wrapperDataRegex, '').trim(),
            );
            return wrapperData;
        } else {
            return undefined;
        }
    }

    public static async parse(
        result: ExecuteResult,
        ignoreExitCode: boolean = false,
    ): Promise<ProcessResult> {
        this.logger.trace('parse', { result, ignoreExitCode });
        this.logger.info('Parsing process result', { result, ignoreExitCode });
        if (result instanceof Error) {
            return {
                verdict: TCVerdicts.SE,
                msg: result.message,
            };
        }
        const wrapperData = await this.extractWrapperData(result.stderrPath);

        // Use wrapper time if available
        const time = wrapperData
            ? Math.max(wrapperData.time, 1) / 1000.0
            : result.time;

        let verdict: TCVerdict = TCVerdicts.UKE;
        let msg: string = '';

        if (result.abortReason === AbortReason.Timeout) {
            verdict = TCVerdicts.TLE;
            msg = l10n.t('Killed due to timeout');
        } else if (result.abortReason === AbortReason.UserAbort) {
            verdict = TCVerdicts.RJ;
            msg = l10n.t('Aborted by user');
        } else if (
            // Always handle signal termination
            // Handle exit code only when not ignored
            typeof result.codeOrSignal === 'string' ||
            (!ignoreExitCode && result.codeOrSignal !== 0)
        ) {
            verdict = TCVerdicts.RE;
            msg = l10n.t('Process exited with code: {code}.', {
                code: result.codeOrSignal,
            });
        }

        return {
            verdict,
            msg,
            data: {
                time,
                memory: result.memory,
                stdoutPath: result.stdoutPath,
                stderrPath: result.stderrPath,
            },
        };
    }

    public static async parseChecker(
        result: ExecuteResult,
    ): Promise<ProcessResult> {
        const preResult = await this.parse(result, true);
        if (preResult.verdict !== TCVerdicts.UKE) {
            return preResult;
        }

        // We have already handled these two cases in parse
        assert(!(result instanceof Error));
        assert(typeof result.codeOrSignal === 'number');

        return {
            ...this.getTestlibVerdict(result.codeOrSignal),
            data: {
                time: result.time,
                memory: result.memory,
                stdoutPath: result.stdoutPath,
                stderrPath: result.stderrPath,
            },
        };
    }

    private static getTestlibVerdict(code: number): Result<undefined> {
        switch (code) {
            case 0:
                return { verdict: TCVerdicts.AC };
            case 1:
                return { verdict: TCVerdicts.WA };
            case 2:
                return { verdict: TCVerdicts.PE };
            case 3:
                return { verdict: TCVerdicts.SE };
            case 4:
                return {
                    verdict: TCVerdicts.WA,
                    msg: l10n.t('Unexpected EOF'),
                };
            case 7:
                return { verdict: TCVerdicts.PC };
            default:
                this.logger.warn('Testlib returned unknown exit code', code);
                return {
                    verdict: TCVerdicts.SE,
                    msg: l10n.t('Testlib returned unknown exit code: {code}', {
                        code,
                    }),
                };
        }
    }

    public static compareOutputs(
        stdout: string,
        answer: string,
        stderr: string,
    ): Result<undefined> {
        if (!Settings.comparing.ignoreError && stderr) {
            return { verdict: TCVerdicts.RE, msg: '' };
        }

        const fixedOutput = stdout
            .trimEnd()
            .split('\n')
            .map((line) => line.trimEnd())
            .join('\n');
        const fixedAnswer = answer
            .trimEnd()
            .split('\n')
            .map((line) => line.trimEnd())
            .join('\n');
        if (
            Settings.comparing.oleSize &&
            fixedOutput.length > fixedAnswer.length * Settings.comparing.oleSize
        ) {
            return { verdict: TCVerdicts.OLE, msg: '' };
        }

        const compressOutput = stdout.replace(/\r|\n|\t|\s/g, '');
        const compressAnswer = answer.replace(/\r|\n|\t|\s/g, '');
        if (compressOutput !== compressAnswer) {
            return { verdict: TCVerdicts.WA, msg: '' };
        }
        if (fixedOutput !== fixedAnswer && !Settings.comparing.regardPEAsAC) {
            return { verdict: TCVerdicts.PE, msg: '' };
        }
        return { verdict: TCVerdicts.AC, msg: '' };
    }
}
