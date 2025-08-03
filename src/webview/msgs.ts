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

import { TC } from '../types';

export interface CreateProblemMsg {
    type: 'createProblem';
}
export interface GetProblemMsg {
    type: 'getProblem';
}
export interface EditProblemDetailsMsg {
    type: 'editProblemDetails';
    title: string;
    url: string;
    timeLimit: number;
    isSpecialJudge: boolean;
}
export interface DelProblemMsg {
    type: 'delProblem';
}
export interface RunTcsMsg {
    type: 'runTcs';
    compile?: boolean;
}
export interface StopTcsMsg {
    type: 'stopTcs';
}
export interface AddTcMsg {
    type: 'addTc';
}
export interface LoadTcsMsg {
    type: 'loadTcs';
}
export interface RunTcMsg {
    type: 'runTc';
    idx: number;
    compile?: boolean;
}
export interface ChooseTcFileMsg {
    type: 'chooseTcFile';
    idx: number;
    label: 'stdin' | 'answer';
}
export interface UpdateTcMsg {
    type: 'updateTc';
    idx: number;
    tc: TC;
}
export interface CompareTcMsg {
    type: 'compareTc';
    idx: number;
}
export interface DelTcMsg {
    type: 'delTc';
    idx: number;
}
export interface OpenFileMsg {
    type: 'openFile';
    path: string;
}
export interface ChooseCheckerFileMsg {
    type: 'chooseCheckerFile';
}
