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

import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, dirname, extname } from 'path';
import { l10n } from 'vscode';
import { gunzipSync, gzipSync } from 'zlib';
import Settings from '../modules/settings';
import { migration, OldProblem } from '../utils/migration';
import { renderPathWithFile } from '../utils/strTemplate';
import { Problem, TcIo } from '../utils/types.backend';
import Io from './io';
import Logger from './logger';

export default class Problems {
    private static logger: Logger = new Logger('problems');

    public static async getBinBySrc(srcPath: string): Promise<string | null> {
        return renderPathWithFile(
            Settings.problem.problemFilePath,
            srcPath,
            true,
        );
    }

    public static createProblem(srcFile: string): Problem {
        return new Problem(basename(srcFile, extname(srcFile)), srcFile);
    }

    public static async loadProblem(srcFile: string): Promise<Problem | null> {
        this.logger.trace('loadProblem', { srcFile });
        const binPath = await this.getBinBySrc(srcFile);
        if (!binPath) {
            return null;
        }
        try {
            var data = await readFile(binPath);
        } catch {
            return null;
        }
        try {
            var oldProblem = JSON.parse(
                gunzipSync(data).toString(),
            ) satisfies OldProblem;
        } catch (e) {
            Io.warn(
                l10n.t('Parse problem {file} failed: {msg}.', {
                    file: basename(binPath),
                    msg: (e as Error).message,
                }),
            );
            return null;
        }
        try {
            var problem = migration(oldProblem);
        } catch (e) {
            Io.warn(
                l10n.t('Migrate problem {file} failed: {msg}.', {
                    file: basename(binPath),
                    msg: (e as Error).message,
                }),
            );
            return null;
        }
        problem.src.path = srcFile;
        this.logger.info('Problem', problem.src.path, 'loaded');
        this.logger.trace('Loaded problem data', { problem });
        return problem;
    }

    public static async saveProblem(problem: Problem): Promise<boolean> {
        const binPath = await this.getBinBySrc(problem.src.path);
        if (!binPath) {
            return false;
        }
        this.logger.trace('Saving problem data', { binPath, problem });
        try {
            await mkdir(dirname(binPath), { recursive: true });
            await writeFile(
                binPath,
                gzipSync(Buffer.from(JSON.stringify(problem))),
            );
            this.logger.info('Saved problem', problem.src.path);
            return true;
        } catch (e) {
            this.logger.error('Failed to save problem', problem.src.path, e);
            Io.error(
                l10n.t('Failed to save problem: {msg}', {
                    msg: (e as Error).message,
                }),
            );
            return false;
        }
    }

    public static isRelated(problem?: Problem, path?: string): Boolean {
        if (!problem || !path) {
            return false;
        }
        path = path.toLowerCase();
        if (
            Settings.problem.inputFileExtensionList.includes(extname(path)) ||
            Settings.problem.outputFileExtensionList.includes(extname(path))
        ) {
            return true;
        }
        if (
            path.startsWith(Settings.cache.directory.toLowerCase()) ||
            problem.src.path.toLowerCase() === path ||
            problem.checker?.path.toLowerCase() === path ||
            problem.interactor?.path.toLowerCase() === path ||
            problem.bfCompare?.bruteForce?.path.toLowerCase() === path ||
            problem.bfCompare?.generator?.path.toLowerCase() === path
        ) {
            return true;
        }
        const tcIoRelated = (tcIo?: TcIo) =>
            tcIo && tcIo.useFile && tcIo.data.toLowerCase() === path;
        for (const tc of Object.values(problem.tcs)) {
            if (
                tcIoRelated(tc.stdin) ||
                tcIoRelated(tc.answer) ||
                tcIoRelated(tc.result?.stdout) ||
                tcIoRelated(tc.result?.stderr)
            ) {
                return true;
            }
        }
        return false;
    }
}
