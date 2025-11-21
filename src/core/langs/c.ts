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

import { access, constants, readFile } from 'fs/promises';
import { type } from 'os';
import { basename, extname, join } from 'path';
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

export class LangC extends Lang {
    private logger: Logger = new Logger('langC');
    public readonly name = 'C';
    public readonly extensions = ['c'];
    public readonly enableRunner = true;
    protected async _compile(
        src: FileWithHash,
        ac: AbortController,
        forceCompile: boolean | null,
        {
            compilationSettings,
            debug,
        }: CompileAdditionalData = DefaultCompileAdditionalData,
    ): Promise<LangCompileResult> {
        this.logger.trace('compile', { src, forceCompile });

        const outputPath = join(
            Settings.cache.directory,
            'bin',
            basename(src.path, extname(src.path)) +
                (type() === 'Windows_NT' ? '.exe' : ''),
        );

        const compiler =
            compilationSettings?.compiler ?? Settings.compilation.cCompiler;
        const args =
            compilationSettings?.compilerArgs ?? Settings.compilation.cArgs;

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

        const cmd = [compiler, src.path, ...compilerArgs, '-o', outputPath];
        if (Settings.runner.unlimitedStack && type() === 'Windows_NT') {
            cmd.push('-Wl,--stack,268435456');
        }
        debug && cmd.push('-g', '-O0');

        const result = await ProcessExecutor.execute({ cmd, ac, timeout });
        if (result instanceof Error) {
            return { verdict: TCVerdicts.SE, msg: result.message };
        }
        this.logger.debug('Compilation completed successfully', {
            path: src.path,
            outputPath,
        });

        Io.compilationMsg = await readFile(result.stderrPath, 'utf-8');
        if (result.abortReason === AbortReason.UserAbort) {
            return {
                verdict: TCVerdicts.RJ,
                msg: l10n.t('Compilation aborted by user'),
            };
        } else if (result.abortReason === AbortReason.Timeout) {
            return {
                verdict: TCVerdicts.CE,
                msg: l10n.t('Compilation timed out'),
            };
        } else if (result.codeOrSignal) {
            Io.compilationMsg = await readFile(result.stderrPath, 'utf-8');
            return {
                verdict: TCVerdicts.CE,
                msg: l10n.t('Compiler exited with code {code}', {
                    code: result.codeOrSignal,
                }),
            };
        }

        return {
            verdict: await access(outputPath, constants.X_OK)
                .then(() => TCVerdicts.UKE)
                .catch(() => TCVerdicts.CE),
            data: { outputPath, hash },
        };
    }
    public async runCommand(target: string): Promise<string[]> {
        this.logger.trace('runCommand', { target });
        return [target];
    }
}
