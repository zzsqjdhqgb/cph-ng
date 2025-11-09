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

import { randomUUID } from 'crypto';
import { enc, MD5 } from 'crypto-js';
import { readFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { FileType, l10n, window, workspace } from 'vscode';
import { version } from '../../package.json';
import FolderChooser from '../helpers/folderChooser';
import Io from '../helpers/io';
import Logger from '../helpers/logger';
import Problems from '../helpers/problems';
import { Problem } from '../utils/types';

export interface CphProblem {
    name: string;
    url: string;
    tests: { id: number; input: string; output: string }[];
    interactive: boolean;
    memoryLimit: number;
    timeLimit: number;
    srcPath: string;
    group: string;
    local: boolean;
}

export default class CphCapable {
    private static logger: Logger = new Logger('cphCapable');

    public static getProbBySrc(srcFile: string): string {
        this.logger.trace('getProbBySrc', { srcFile });
        const probPath = join(
            dirname(srcFile),
            '.cph',
            `.${basename(srcFile)}_${MD5(srcFile).toString(enc.Hex)}.prob`,
        );
        this.logger.debug('Generated problem file path', { probPath });
        return probPath;
    }

    public static toProblem(cphProblem: CphProblem): Problem {
        this.logger.trace('toProblem', { cphProblem });
        const problem: Problem = {
            version,
            name: cphProblem.name,
            url: cphProblem.url,
            tcs: {},
            tcOrder: [],
            timeLimit: cphProblem.timeLimit,
            memoryLimit: cphProblem.memoryLimit,
            src: { path: cphProblem.srcPath },
            timeElapsed: 0,
        } satisfies Problem;
        for (const test of cphProblem.tests) {
            const id = randomUUID();
            problem.tcs[id] = {
                stdin: { useFile: false, data: test.input },
                answer: { useFile: false, data: test.output },
                isExpand: false,
            };
            problem.tcOrder.push(id);
        }
        this.logger.info('Converted CphProblem to Problem', { problem });
        return problem;
    }

    public static async loadProblem(probFile: string): Promise<Problem | null> {
        this.logger.trace('loadProblem', { probFile });
        try {
            const problem = CphCapable.toProblem(
                JSON.parse(
                    await readFile(probFile, 'utf-8'),
                ) satisfies CphProblem,
            );
            this.logger.debug('Loaded problem from file', {
                probFile,
                problem,
            });
            return problem;
        } catch (e) {
            this.logger.error('Failed to load problem', e);
            return null;
        }
    }

    public static async importFromCph(): Promise<void> {
        this.logger.trace('importFromCph');
        const uri = await FolderChooser.chooseFolder(
            l10n.t('Please select the .cph folder contains the problem files'),
        );
        if (!uri) {
            this.logger.info('No folder selected, aborting import');
            return;
        }
        this.logger.info('Selected folder for import', { uri });
        const probFiles = await workspace.fs.readDirectory(uri);
        this.logger.debug('Read directory contents', { probFiles });
        const problems: Problem[] = [];
        for (const [name, type] of probFiles) {
            if (type === FileType.File && name.endsWith('.prob')) {
                const probFilePath = join(uri.fsPath, name);
                const problem = await this.loadProblem(probFilePath);
                if (problem) {
                    problems.push(problem);
                    this.logger.info('Imported problem', { probFilePath });
                } else {
                    this.logger.warn('Failed to import problem', {
                        probFilePath,
                    });
                }
            }
        }
        if (problems.length === 0) {
            Io.info(l10n.t('No problem files found in the selected folder.'));
            return;
        }
        const chosenIdx = await window.showQuickPick(
            problems.map((p, idx) => ({
                label: p.name,
                description: [
                    l10n.t('Number of test cases: {cnt}', {
                        cnt: p.tcOrder.length,
                    }),
                    p.checker ? l10n.t('Special Judge') : '',
                    p.interactor ? l10n.t('Interactive') : '',
                    p.bfCompare ? l10n.t('Brute Force Comparison') : '',
                ]
                    .join(' ')
                    .trim(),
                detail: p.url,
                picked: true,
                value: idx,
            })),
            {
                canPickMany: true,
                title: l10n.t('Select problems to import'),
            },
        );
        if (!chosenIdx || chosenIdx.length === 0) {
            this.logger.info('No problems selected for import, aborting');
            return;
        }
        this.logger.info('Selected problems for import', { chosenIdx });
        const selectedProblems = chosenIdx.map((idx) => problems[idx.value]);
        for (const problem of selectedProblems) {
            await Problems.saveProblem(problem);
        }
    }
}
