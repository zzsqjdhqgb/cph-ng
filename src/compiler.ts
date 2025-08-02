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
import { Logger } from './io';

const execAsync = promisify(exec);

export class Compiler {
    private logger: Logger = new Logger('compiler');

    public async getExecutablePath(filePath: string): Promise<string> {
        this.logger.trace('getExecutablePath', { filePath });
        try {
            const base = basename(filePath, extname(filePath));
            const executablePath = join(
                Settings.cache.directory,
                'bin',
                base + (type() === 'Windows_NT' ? '.exe' : ''),
            );
            this.logger.debug('Generated executable path', { executablePath });
            return executablePath;
        } catch (e) {
            this.logger.error('Failed to generate executable path', e);
            throw new Error(
                `Failed to generate executable path: ${(e as Error).message}`,
            );
        }
    }

    public async compile(
        filePath: string,
        outputPath: string,
        abortController: AbortController,
    ): Promise<string> {
        this.logger.trace('compile', { filePath, outputPath });
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
                this.logger.warn('Unsupported file type', { type: ext });
                return vscode.l10n.t('Unsupported file type: {type}.', {
                    type: ext,
                });
        }

        try {
            await access(outputPath, constants.F_OK);
            this.logger.debug('Output file exists, removing it', {
                outputPath,
            });
            await unlink(outputPath);
        } catch {
            this.logger.debug('Output file does not exist, skipping removal', {
                outputPath,
            });
        }

        try {
            this.logger.info('Starting compilation', { compileCommand });
            const { stderr } = await execAsync(compileCommand, {
                timeout: Settings.compilation.timeout,
                cwd: dirname(filePath),
                signal: abortController.signal,
            });
            this.logger.debug('Compilation completed successfully', {
                filePath,
                outputPath,
            });
            return stderr;
        } catch (e) {
            this.logger.error('Compilation failed', e);
            return (e as Error).message;
        }
    }
}
