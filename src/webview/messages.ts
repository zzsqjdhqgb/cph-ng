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

import { TestCase } from '../types';

export interface CreateProblemMessage {
    type: 'createProblem';
}
export interface GetProblemMessage {
    type: 'getProblem';
}
export interface EditProblemDetailsMessage {
    type: 'editProblemDetails';
    title: string;
    url: string;
    timeLimit: number;
    isSpecialJudge: boolean;
}
export interface DeleteProblemMessage {
    type: 'deleteProblem';
}
export interface RunTestCasesMessage {
    type: 'runTestCases';
}
export interface StopTestCasesMessage {
    type: 'stopTestCases';
}
export interface AddTestCaseMessage {
    type: 'addTestCase';
}
export interface LoadTestCasesMessage {
    type: 'loadTestCases';
}
export interface RunTestCaseMessage {
    type: 'runTestCase';
    index: number;
}
export interface ChooseTestCaseFileMessage {
    type: 'chooseTestCaseFile';
    index: number;
    label: 'stdin' | 'answer';
}
export interface UpdateTestCaseMessage {
    type: 'updateTestCase';
    index: number;
    testCase: TestCase;
}
export interface CompareTestCaseMessage {
    type: 'compareTestCase';
    index: number;
}
export interface DeleteTestCaseMessage {
    type: 'deleteTestCase';
    index: number;
}
export interface OpenFileMessage {
    type: 'openFile';
    path: string;
}
export interface ChooseCheckerFileMessage {
    type: 'chooseCheckerFile';
}
