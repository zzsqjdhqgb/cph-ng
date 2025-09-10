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
import { io, Logger } from '../../utils/io';
import Settings from '../../utils/settings';
import {
    CompileAdditionalData,
    DefaultCompileAdditionalData,
    Lang,
    LangCompileResult,
} from './lang';
import { basename, extname, join } from 'path';
import { type } from 'os';
import { TCVerdicts } from '../../utils/types.backend';
import * as vscode from 'vscode';
import { FileWithHash } from '../../utils/types';

export class LangC extends Lang {
    private logger: Logger = new Logger('langC');
    public extensions = ['c'];
    public async compile(
        src: FileWithHash,
        ac: AbortController,
        forceCompile: boolean | null,
        _: CompileAdditionalData = DefaultCompileAdditionalData,
    ): Promise<LangCompileResult> {
        this.logger.trace('compile', { src, forceCompile });

        const outputPath = join(
            Settings.cache.directory,
            'bin',
            basename(src.path, extname(src.path)) +
                (type() === 'Windows_NT' ? '.exe' : ''),
        );
        const { skip, hash } = await Lang.checkHash(
            src,
            outputPath,
            Settings.compilation.cCompiler + Settings.compilation.cArgs,
            forceCompile,
        );
        if (skip) {
            return {
                verdict: TCVerdicts.UKE,
                msg: '',
                data: { outputPath, hash },
            };
        }

        const {
            cCompiler: compiler,
            cArgs: args,
            timeout,
        } = Settings.compilation;

        try {
            this.logger.info('Starting compilation', {
                compiler,
                args,
                src: src.path,
                outputPath,
            });

            const compilerArgs = args.split(/\s+/).filter(Boolean);

            const result = await Lang.executor.execute({
                cmd: [compiler, ...compilerArgs, src.path, '-o', outputPath],
                ac,
                timeout,
            });

            this.logger.debug('Compilation completed successfully', {
                path: src.path,
                outputPath,
            });
            io.compilationMsg = result.stderr.trim();
            return {
                verdict: await access(outputPath, constants.X_OK)
                    .then(() => TCVerdicts.UKE)
                    .catch(() => TCVerdicts.CE),
                msg: '',
                data: { outputPath, hash },
            };
        } catch (e) {
            this.logger.error('Compilation failed', e);
            if (ac.signal.aborted) {
                this.logger.warn('Compilation aborted by user');
                return {
                    verdict: TCVerdicts.RJ,
                    msg: vscode.l10n.t('Compilation aborted by user.'),
                };
            }
            io.compilationMsg = (e as Error).message;
            return { verdict: TCVerdicts.CE, msg: '' };
        }
    }
    public async runCommand(target: string): Promise<string[]> {
        this.logger.trace('runCommand', { target });
        return [target];
    }
}
