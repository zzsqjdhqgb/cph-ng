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

import { access, constants } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { l10n } from 'vscode';
import Io from '../../helpers/io';
import Logger from '../../helpers/logger';
import ProcessExecutor, { AbortReason } from '../../helpers/processExecutor';
import Settings from '../../modules/settings';
import { FileWithHash } from '../../utils/types';
import { TCVerdicts } from '../../utils/types.backend';
import {
    CompileAdditionalData,
    DefaultCompileAdditionalData,
    Lang,
    LangCompileResult,
} from './lang';

export class LangJava extends Lang {
    private logger: Logger = new Logger('langJava');
    public readonly name = 'Java';
    public readonly extensions = ['java'];
    protected async _compile(
        src: FileWithHash,
        ac: AbortController,
        forceCompile: boolean | null,
        {
            compilationSettings,
        }: CompileAdditionalData = DefaultCompileAdditionalData,
    ): Promise<LangCompileResult> {
        this.logger.trace('compile', { src, forceCompile });

        const classDir = join(Settings.cache.directory, 'bin');
        const outputPath = join(
            classDir,
            basename(src.path, extname(src.path)) + '.class',
        );

        const compiler =
            compilationSettings?.compiler ?? Settings.compilation.javaCompiler;
        const args =
            compilationSettings?.compilerArgs ?? Settings.compilation.javaArgs;

        const { skip, hash } = await Lang.checkHash(
            src,
            outputPath,
            compiler + args,
            forceCompile,
        );
        if (skip) {
            return {
                verdict: TCVerdicts.UKE,
                data: { outputPath, hash },
            };
        }

        const { timeout } = Settings.compilation;
        const compilerArgs = args.split(/\s+/).filter(Boolean);

        const result = await ProcessExecutor.execute({
            cmd: [compiler, ...compilerArgs, '-d', classDir, src.path],
            ac,
            timeout,
        });
        if (result instanceof Error) {
            return { verdict: TCVerdicts.SE, msg: result.message };
        }

        this.logger.debug('Compilation completed successfully', {
            path: src.path,
            outputPath,
        });
        Io.compilationMsg = result.stderr.trim();
        if (result.abortReason === AbortReason.UserAbort) {
            return {
                verdict: TCVerdicts.RJ,
                msg: l10n.t('Compilation aborted by user.'),
            };
        } else if (result.abortReason === AbortReason.Timeout) {
            return {
                verdict: TCVerdicts.CE,
                msg: l10n.t('Compilation timed out'),
            };
        } else if (result.codeOrSignal) {
            return {
                verdict: TCVerdicts.CE,
                msg: l10n.t('Compilation exited with code {code}', {
                    code: result.codeOrSignal,
                }),
            };
        }

        return {
            verdict: await access(outputPath, constants.R_OK)
                .then(() => TCVerdicts.UKE)
                .catch(() => TCVerdicts.CE),
            data: { outputPath, hash },
        };
    }

    public async runCommand(
        target: string,
        compilationSettings?: CompileAdditionalData['compilationSettings'],
    ): Promise<string[]> {
        this.logger.trace('runCommand', { target });
        const runner =
            compilationSettings?.runner ?? Settings.compilation.javaRunner;
        const runArgs =
            compilationSettings?.runnerArgs ?? Settings.compilation.javaRunArgs;
        const runArgsArray = runArgs.split(/\s+/).filter(Boolean);
        return [
            runner,
            ...runArgsArray,
            '-cp',
            dirname(target),
            basename(target, '.class'),
        ];
    }
}
