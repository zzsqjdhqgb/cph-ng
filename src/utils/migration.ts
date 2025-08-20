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

import { Problem } from './types';
import { Problem as Problem_0_0_12 } from './types/0.0.12';
import { Problem as Problem_0_1_0 } from './types/0.1.0';

export type OldProblem = Problem | Problem_0_1_0 | Problem_0_0_12;

const migrateFunctions: Record<string, (oldProblem: any) => any> = {
    '0.1.0': (problem: Problem_0_1_0): Problem => {
        return {
            ...problem,
            version: '0.1.1',
        };
    },
    '0.0.12': (problem: Problem_0_0_12): Problem_0_1_0 => {
        return {
            ...problem,
            src: {
                path: problem.srcPath,
                hash: problem.srcHash,
            },
            checker:
                problem.isSpecialJudge && problem.checkerPath
                    ? {
                          path: problem.checkerPath,
                          hash: problem.checkerHash,
                      }
                    : undefined,
        } satisfies Problem_0_1_0;
    },
};

export const migration = (problem: OldProblem): Problem => {
    while (true) {
        const version: string =
            (problem as any).version ||
            ((problem as any).srcPath ? '0.0.12' : '0.1.0');
        if (!migrateFunctions[version]) {
            break;
        }
        problem = migrateFunctions[version](problem);
    }
    return problem as Problem;
};
