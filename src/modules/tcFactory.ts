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

import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { mkdir, readdir, unlink } from 'fs/promises';
import { orderBy } from 'natural-orderby';
import { basename, dirname, extname, join, relative } from 'path';
import { l10n, Uri, window, workspace } from 'vscode';
import Io from '../helpers/io';
import { exists } from '../utils/process';
import { renderTemplate } from '../utils/strTemplate';
import { Problem, TC, TCIO } from '../utils/types';
import Settings from './settings';

async function getAllFiles(dirPath: string): Promise<string[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
        entries.map((entry) => {
            const fullPath = join(dirPath, entry.name);
            return entry.isDirectory() ? getAllFiles(fullPath) : fullPath;
        }),
    );
    return files.flat();
}

export default class TcFactory {
    public static async fromFile(path: string, isInput?: boolean): Promise<TC> {
        if (isInput === undefined) {
            isInput = !(extname(path) in ['.out', '.ans']);
        }
        let stdinFile: string | undefined, answerFile: string | undefined;
        isInput ? (stdinFile = path) : (answerFile = path);
        const pairExt = isInput ? ['ans', 'out'] : ['in'];
        const behavior = Settings.problem.foundMatchTestCaseBehavior;
        if (behavior !== 'never') {
            for (const ext of pairExt) {
                const pairPath = path.replace(extname(path), `.${ext}`);
                if (!(await exists(pairPath))) {
                    continue;
                }
                if (
                    behavior === 'ask' &&
                    !(await Io.confirm(
                        l10n.t(
                            'Found matching {found} file: {file}. Do you want to use it?',
                            {
                                found: isInput
                                    ? l10n.t('answer')
                                    : l10n.t('stdin'),
                                file: basename(pairPath),
                            },
                        ),
                        true,
                    ))
                ) {
                    continue;
                }
                isInput ? (answerFile = pairPath) : (stdinFile = pairPath);
                break;
            }
        }
        const stdin = (
            stdinFile
                ? { useFile: true, path: stdinFile }
                : { useFile: false, data: '' }
        ) satisfies TCIO;
        const answer = (
            answerFile
                ? { useFile: true, path: answerFile }
                : { useFile: false, data: '' }
        ) satisfies TCIO;
        return { stdin, answer, isExpand: false, isDisabled: false };
    }

    public static async fromZip(
        problem: Problem,
        zipPath: string,
    ): Promise<TC[]> {
        const srcPath = problem.src.path;
        const zipData = new AdmZip(zipPath);
        const srcUri = Uri.file(srcPath);
        const workspaceFolder = workspace.getWorkspaceFolder(srcUri)!;
        const workspacePath = workspaceFolder.uri.fsPath;
        const folderPath = renderTemplate(Settings.problem.unzipFolder, [
            ['workspace', workspacePath],
            ['dirname', dirname(srcPath)],
            [
                'relativeDirname',
                relative(workspacePath, dirname(srcPath)) || '.',
            ],
            ['basename', basename(srcPath)],
            ['extname', extname(srcPath)],
            ['basenameNoExt', basename(srcPath, extname(srcPath))],
            ['zipDirname', dirname(zipPath)],
            ['zipBasename', basename(zipPath)],
            ['zipBasenameNoExt', basename(zipPath, extname(zipPath))],
        ]);
        await mkdir(folderPath, { recursive: true });
        zipData.extractAllTo(folderPath, true);
        if (Settings.problem.deleteAfterUnzip) {
            await unlink(zipPath);
        }
        return await this.fromFolder(problem, folderPath);
    }
    public static async fromFolder(
        problem: Problem,
        folderPath: string,
    ): Promise<TC[]> {
        const allFiles = await getAllFiles(folderPath);
        const tcs: TC[] = [];
        for (const filePath of allFiles) {
            const fileName = basename(filePath);
            const ext = extname(fileName).toLowerCase();
            if (ext === '.in') {
                tcs.push({
                    stdin: { useFile: true, path: filePath },
                    answer: { useFile: false, data: '' },
                    isExpand: false,
                    isDisabled: false,
                });
            }
        }
        for (const filePath of allFiles) {
            const fileName = basename(filePath);
            const ext = extname(fileName).toLowerCase();
            if (ext === '.ans' || ext === '.out') {
                const inputFile = join(
                    dirname(filePath),
                    fileName.replace(ext, '.in'),
                );
                const existingTestCase = tcs.find(
                    (tc) => tc.stdin.useFile && tc.stdin.path === inputFile,
                );
                if (existingTestCase) {
                    existingTestCase.answer = {
                        useFile: true,
                        path: filePath,
                    };
                } else {
                    tcs.push({
                        stdin: { useFile: false, data: '' },
                        answer: { useFile: true, path: filePath },
                        isExpand: false,
                        isDisabled: false,
                    });
                }
            }
        }
        if (!tcs.length) {
            Io.warn(l10n.t('No test cases found.'));
            return [];
        }
        const orderedTcs = orderBy(tcs, [
            (it) => (it.stdin.useFile ? 0 : 1),
            (it) =>
                it.stdin.useFile
                    ? basename(it.stdin.path)
                    : it.answer.useFile
                      ? basename(it.answer.path)
                      : '',
        ]);
        const chosenIdx = await window.showQuickPick(
            orderedTcs.map((tc, idx) => ({
                label: `${basename(
                    tc.stdin.useFile
                        ? tc.stdin.path
                        : tc.answer.useFile
                          ? tc.answer.path
                          : 'unknown',
                )}`,
                description: l10n.t('Input {input}, Answer {answer}', {
                    input: tc.stdin.useFile
                        ? tc.stdin.path.replace(folderPath + '/', '')
                        : l10n.t('not found'),
                    answer: tc.answer.useFile
                        ? tc.answer.path.replace(folderPath + '/', '')
                        : l10n.t('not found'),
                }),
                value: idx,
                picked: true,
            })),
            {
                canPickMany: true,
                title: l10n.t('Select test cases to add'),
            },
        );
        if (!chosenIdx) {
            return [];
        }
        return chosenIdx.map((idx) => orderedTcs[idx.value]);
    }
    public static async applyTcs(problem: Problem, tcs: TC[]) {
        if (Settings.problem.clearBeforeLoad) {
            problem.tcOrder = [];
        }
        for (const tc of tcs) {
            const uuid = randomUUID();
            problem.tcs[uuid] = tc;
            problem.tcOrder.push(uuid);
        }
    }
}
