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

import { exec } from 'child_process';
import { access, constants, unlink } from 'fs/promises';
import { type } from 'os';
import { basename, dirname, extname, join } from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import Settings from './settings';

const execAsync = promisify(exec);

export class Compiler {
    public async getExecutablePath(filePath: string): Promise<string> {
        try {
            const base = basename(filePath, extname(filePath));
            return join(
                Settings.cache.directory,
                'bin',
                base + (type() === 'Windows_NT' ? '.exe' : ''),
            );
        } catch (error: unknown) {
            const err = error as Error;
            throw new Error(
                `Failed to generate executable path: ${err.message}`,
            );
        }
    }

    public async compile(
        filePath: string,
        outputPath: string,
        abortController: AbortController,
    ): Promise<string> {
        const ext = extname(filePath);
        let compileCommand = '';

        switch (ext) {
            case '.cpp':
                compileCommand = `${Settings.compilation.cppCompiler} ${Settings.compilation.cppArgs} "${filePath}" -o "${outputPath}"`;
                break;
            case '.c':
                compileCommand = `${Settings.compilation.cCompiler} ${Settings.compilation.cArgs} "${filePath}" -o "${outputPath}"`;
                break;
            default:
                return vscode.l10n.t('Unsupported file type: {type}.', {
                    type: ext,
                });
        }

        try {
            await access(outputPath, constants.F_OK);
            await unlink(outputPath);
        } catch {}

        try {
            const { stderr } = await execAsync(compileCommand, {
                timeout: Settings.compilation.timeout,
                cwd: dirname(filePath),
                signal: abortController.signal,
            });
            return stderr;
        } catch (e: unknown) {
            const error = e as Error;
            return error.message;
        }
    }
}
