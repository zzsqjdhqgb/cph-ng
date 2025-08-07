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

export const isRunningVerdict = (verdict?: TCVerdict): boolean => {
    return (
        verdict !== undefined &&
        ['WT', 'CP', 'CPD', 'JG', 'JGD', 'CMP'].includes(verdict?.name)
    );
};

export const isExpandVerdict = (verdict?: TCVerdict): boolean => {
    return !(
        (verdict !== undefined && ['AC', 'SK', 'RJ'].includes(verdict.name)) ||
        isRunningVerdict(verdict)
    );
};

export class TCVerdict {
    name: string;
    fullName: string;
    color: string;

    constructor(name: string, fullName: string, color: string) {
        this.name = name;
        this.fullName = fullName;
        this.color = color;
    }
}

export type TCIO =
    | { useFile: true; path: string }
    | { useFile: false; data: string };

export type TCResult = {
    verdict: TCVerdict;
    time: number;
    stdout: TCIO;
    stderr: TCIO;
    msg: string;
};

export interface TC {
    stdin: TCIO;
    answer: TCIO;
    isExpand: boolean;
    result?: TCResult;
}

export interface Problem {
    name: string;
    url?: string;
    tcs: TC[];
    timeLimit: number;
    srcPath: string;
    srcHash?: string;
    isSpecialJudge?: boolean;
    checkerPath?: string;
    checkerHash?: string;
}
export interface EmbeddedProblem {
    name: string;
    url?: string;
    tcs: {
        stdin: string;
        answer: string;
    }[];
    timeLimit: number;
    spjCode?: string;
}
