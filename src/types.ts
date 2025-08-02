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

export const isRunningVerdict = (verdict?: TestCaseVerdict): boolean => {
    return (
        verdict !== undefined &&
        ['WT', 'CP', 'CPD', 'JG', 'JGD', 'CMP'].includes(verdict?.name)
    );
};

export const isExpandVerdict = (verdict?: TestCaseVerdict): boolean => {
    return !(
        (verdict !== undefined && ['AC', 'SK', 'RJ'].includes(verdict.name)) ||
        isRunningVerdict(verdict)
    );
};

export class TestCaseVerdict {
    name: string;
    fullName: string;
    color: string;

    constructor(name: string, fullName: string, color: string) {
        this.name = name;
        this.fullName = fullName;
        this.color = color;
    }
}

export type TestCaseIO =
    | { useFile: true; path: string }
    | { useFile: false; data: string };

export type TestCaseResult = {
    verdict: TestCaseVerdict;
    time: number;
    stdout: TestCaseIO;
    stderr: TestCaseIO;
    message: string;
};

export interface TestCase {
    stdin: TestCaseIO;
    answer: TestCaseIO;
    isExpand: boolean;
    result?: TestCaseResult;
}

export interface Problem {
    name: string;
    url?: string;
    testCases: TestCase[];
    timeLimit: number;
    srcPath: string;
    srcHash?: string;
    isSpecialJudge?: boolean;
    checkerPath?: string;
    checkerHash?: string;
}
