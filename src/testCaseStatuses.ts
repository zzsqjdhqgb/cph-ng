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
import { TestCaseStatus } from './types';

export class TestCaseStatuses {
    static UKE = new TestCaseStatus('UKE', vscode.l10n.t('Unknown Error'), '0, 0, 255');
    static AC = new TestCaseStatus('AC', vscode.l10n.t('Accepted'), '73, 205, 50');
    static PE = new TestCaseStatus('PE', vscode.l10n.t('Presentation Error'), '255, 119, 142');
    static WA = new TestCaseStatus('WA', vscode.l10n.t('Wrong Answer'), '211, 20, 13');
    static TLE = new TestCaseStatus('TLE', vscode.l10n.t('Time Limit Exceeded'), '12, 0, 102');
    static MLE = new TestCaseStatus('MLE', vscode.l10n.t('Memory Limit Exceeded'), '83, 0, 167');
    static OLE = new TestCaseStatus('OLE', vscode.l10n.t('Output Limit Exceeded'), '131, 0, 167');
    static RE = new TestCaseStatus('RE', vscode.l10n.t('Runtime Error'), '26, 38, 200');
    static RF = new TestCaseStatus('RF', vscode.l10n.t('Restricted Function'), '0, 145, 130');
    static CE = new TestCaseStatus('CE', vscode.l10n.t('Compilation Error'), '139, 116, 0');
    static SE = new TestCaseStatus('SE', vscode.l10n.t('System Error'), '0, 0, 0');
    static WT = new TestCaseStatus('WT', vscode.l10n.t('Waiting'), '65, 0, 217');
    static FC = new TestCaseStatus('FC', vscode.l10n.t('Fetched'), '76, 0, 255');
    static CP = new TestCaseStatus('CP', vscode.l10n.t('Compiling'), '94, 25, 255');
    static CPD = new TestCaseStatus('CPD', vscode.l10n.t('Compiled'), '115, 64, 255');
    static JG = new TestCaseStatus('JG', vscode.l10n.t('Judging'), '132, 79, 255');
    static JGD = new TestCaseStatus('JGD', vscode.l10n.t('Judged'), '150, 127, 255');
    static CMP = new TestCaseStatus('CMP', vscode.l10n.t('Comparing'), '168, 125, 255');
    static SK = new TestCaseStatus('SK', vscode.l10n.t('Skipped'), '75, 75, 75');
    static RJ = new TestCaseStatus('RJ', vscode.l10n.t('Rejected'), '78, 0, 0');
}
