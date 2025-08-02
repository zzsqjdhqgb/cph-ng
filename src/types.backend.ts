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

import * as vscode from 'vscode';
import { TestCaseIO, TestCaseVerdict } from './types';
import { readFile, writeFile } from 'fs/promises';
import Settings from './settings';
import { join } from 'path';
import { SHA256 } from 'crypto-js';

export class TestCaseVerdicts {
    static UKE = new TestCaseVerdict(
        'UKE',
        vscode.l10n.t('Unknown Error'),
        '0, 0, 255',
    );
    static AC = new TestCaseVerdict(
        'AC',
        vscode.l10n.t('Accepted'),
        '73, 205, 50',
    );
    static PC = new TestCaseVerdict(
        'PC',
        vscode.l10n.t('Partially Correct'),
        '237, 152, 19',
    );
    static PE = new TestCaseVerdict(
        'PE',
        vscode.l10n.t('Presentation Error'),
        '255, 119, 142',
    );
    static WA = new TestCaseVerdict(
        'WA',
        vscode.l10n.t('Wrong Answer'),
        '211, 20, 13',
    );
    static TLE = new TestCaseVerdict(
        'TLE',
        vscode.l10n.t('Time Limit Exceeded'),
        '12, 0, 102',
    );
    static MLE = new TestCaseVerdict(
        'MLE',
        vscode.l10n.t('Memory Limit Exceeded'),
        '83, 0, 167',
    );
    static OLE = new TestCaseVerdict(
        'OLE',
        vscode.l10n.t('Output Limit Exceeded'),
        '131, 0, 167',
    );
    static RE = new TestCaseVerdict(
        'RE',
        vscode.l10n.t('Runtime Error'),
        '26, 38, 200',
    );
    static RF = new TestCaseVerdict(
        'RF',
        vscode.l10n.t('Restricted Function'),
        '0, 145, 130',
    );
    static CE = new TestCaseVerdict(
        'CE',
        vscode.l10n.t('Compilation Error'),
        '139, 116, 0',
    );
    static SE = new TestCaseVerdict(
        'SE',
        vscode.l10n.t('System Error'),
        '0, 0, 0',
    );
    static WT = new TestCaseVerdict(
        'WT',
        vscode.l10n.t('Waiting'),
        '65, 0, 217',
    );
    static FC = new TestCaseVerdict(
        'FC',
        vscode.l10n.t('Fetched'),
        '76, 0, 255',
    );
    static CP = new TestCaseVerdict(
        'CP',
        vscode.l10n.t('Compiling'),
        '94, 25, 255',
    );
    static CPD = new TestCaseVerdict(
        'CPD',
        vscode.l10n.t('Compiled'),
        '115, 64, 255',
    );
    static JG = new TestCaseVerdict(
        'JG',
        vscode.l10n.t('Judging'),
        '132, 79, 255',
    );
    static JGD = new TestCaseVerdict(
        'JGD',
        vscode.l10n.t('Judged'),
        '150, 127, 255',
    );
    static CMP = new TestCaseVerdict(
        'CMP',
        vscode.l10n.t('Comparing'),
        '168, 125, 255',
    );
    static SK = new TestCaseVerdict(
        'SK',
        vscode.l10n.t('Skipped'),
        '75, 75, 75',
    );
    static RJ = new TestCaseVerdict(
        'RJ',
        vscode.l10n.t('Rejected'),
        '78, 0, 0',
    );
}

export const writeToTestCaseIO = async (
    testCaseIO: TestCaseIO,
    data: string,
    alwaysUseFile: boolean = false,
) => {
    if (testCaseIO.useFile) {
        await writeFile(testCaseIO.path, data);
    } else if (alwaysUseFile) {
        const path = join(
            Settings.cache.directory,
            'io',
            SHA256(data).toString(),
        );
        await writeFile(path, data);
        testCaseIO = { useFile: true, path };
    } else {
        testCaseIO.data = data;
    }
    return testCaseIO;
};
export const testCaseIOToString = async (
    testCaseIO: TestCaseIO,
): Promise<string> => {
    if (testCaseIO.useFile) {
        return await readFile(testCaseIO.path, 'utf-8');
    } else {
        return testCaseIO.data;
    }
};
export const testCaseIOToPath = async (
    testCaseIO: TestCaseIO,
): Promise<string> => {
    if (testCaseIO.useFile) {
        return testCaseIO.path;
    } else {
        const path = join(
            Settings.cache.directory,
            'io',
            SHA256(testCaseIO.data).toString(),
        );
        await writeFile(path, testCaseIO.data);
        return path;
    }
};
