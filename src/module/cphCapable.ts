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

import { enc, MD5 } from 'crypto-js';
import { readFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { Logger } from '../utils/io';
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

export class CphCapable {
    private static logger: Logger = new Logger('cphCapable');

    public static getProbByCpp(cppFile: string): string {
        this.logger.trace('getProbByCpp', { cppFile });
        const probPath = join(
            dirname(cppFile),
            '.cph',
            `.${basename(cppFile)}_${MD5(cppFile).toString(enc.Hex)}.prob`,
        );
        this.logger.debug('Generated problem file path', { probPath });
        return probPath;
    }

    public static toProblem(cphProblem: CphProblem): Problem {
        this.logger.trace('toProblem', { cphProblem });
        const problem = {
            name: cphProblem.name,
            url: cphProblem.url,
            tcs: cphProblem.tests.map((test) => ({
                stdin: { useFile: false, data: test.input },
                answer: { useFile: false, data: test.output },
                isExpand: false,
            })),
            timeLimit: cphProblem.timeLimit,
            srcPath: cphProblem.srcPath,
        } as Problem;
        this.logger.info('Converted CphProblem to Problem', { problem });
        return problem;
    }

    public static async loadProblem(
        probFile: string,
    ): Promise<Problem | undefined> {
        this.logger.trace('loadProblem', { probFile });
        try {
            const data = await readFile(probFile);
            const problem = CphCapable.toProblem(
                JSON.parse(data.toString()) as CphProblem,
            );
            this.logger.debug('Loaded problem from file', {
                probFile,
                problem,
            });
            return problem;
        } catch (e) {
            this.logger.error('Failed to load problem', e);
            return undefined;
        }
    }
}
