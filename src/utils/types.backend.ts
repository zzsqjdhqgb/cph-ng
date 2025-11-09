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

import { SHA256 } from 'crypto-js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { l10n } from 'vscode';
import Settings from '../modules/settings';
import { TCIO, TCVerdict } from './types';

export class TCVerdicts {
    static UKE = new TCVerdict('UKE', l10n.t('Unknown Error'), '#0000ff');
    static AC = new TCVerdict('AC', l10n.t('Accepted'), '#49cd32');
    static PC = new TCVerdict('PC', l10n.t('Partially Correct'), '#ed9813');
    static PE = new TCVerdict('PE', l10n.t('Presentation Error'), '#ff778e');
    static WA = new TCVerdict('WA', l10n.t('Wrong Answer'), '#d3140d');
    static TLE = new TCVerdict('TLE', l10n.t('Time Limit Exceed'), '#0c0066');
    static MLE = new TCVerdict('MLE', l10n.t('Memory Limit Exceed'), '#5300a7');
    static OLE = new TCVerdict('OLE', l10n.t('Output Limit Exceed'), '#8300a7');
    static RE = new TCVerdict('RE', l10n.t('Runtime Error'), '#1a26c8');
    static RF = new TCVerdict('RF', l10n.t('Restricted Function'), '#008f81');
    static CE = new TCVerdict('CE', l10n.t('Compilation Error'), '#8b7400');
    static SE = new TCVerdict('SE', l10n.t('System Error'), '#000000');
    static WT = new TCVerdict('WT', l10n.t('Waiting'), '#4100d9');
    static FC = new TCVerdict('FC', l10n.t('Fetched'), '#4c00ff');
    static CP = new TCVerdict('CP', l10n.t('Compiling'), '#5e19ff');
    static CPD = new TCVerdict('CPD', l10n.t('Compiled'), '#7340ff');
    static JG = new TCVerdict('JG', l10n.t('Judging'), '#844fff');
    static JGD = new TCVerdict('JGD', l10n.t('Judged'), '#967fff');
    static CMP = new TCVerdict('CMP', l10n.t('Comparing'), '#a87dff');
    static SK = new TCVerdict('SK', l10n.t('Skipped'), '#4b4b4b');
    static RJ = new TCVerdict('RJ', l10n.t('Rejected'), '#4e0000');
}

export const write2TcIo = async (tcIo: TCIO, data: string) => {
    if (tcIo.useFile) {
        await writeFile(tcIo.path, data);
    } else {
        tcIo.data = data;
    }
    return tcIo;
};
export const tcIo2Str = async (tcIo: TCIO): Promise<string> => {
    if (tcIo.useFile) {
        return await readFile(tcIo.path, 'utf-8');
    } else {
        return tcIo.data;
    }
};
export const tcIo2Path = async (tcIo: TCIO): Promise<string> => {
    if (tcIo.useFile) {
        return tcIo.path;
    } else {
        const path = join(
            Settings.cache.directory,
            'io',
            SHA256(tcIo.data).toString().substring(0, 8),
        );
        await writeFile(path, tcIo.data);
        return path;
    }
};
