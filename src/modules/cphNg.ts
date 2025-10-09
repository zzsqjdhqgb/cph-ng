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
import Io from '../helpers/io';
import Logger from '../helpers/logger';
import Problems from '../helpers/problems';
import CphCapable from './cphCapable';
import ProblemsManager from './problemsManager';

export default class CphNg {
    private static logger: Logger = new Logger('cphNg');

    public static async createProblem(filePath?: string): Promise<void> {
        if (!filePath) {
            Io.warn(
                vscode.l10n.t(
                    'No active editor found. Please open a file to create a problem.',
                ),
            );
            return;
        }
        if (await Problems.loadProblem(filePath)) {
            Io.warn(vscode.l10n.t('Problem already exists for this file'));
            return;
        }
        const problem = Problems.createProblem(filePath);
        await Problems.saveProblem(problem);
        await ProblemsManager.dataRefresh();
    }
    public static async importProblem(filePath?: string): Promise<void> {
        if (!filePath) {
            Io.warn(
                vscode.l10n.t(
                    'No active editor found. Please open a file to create a problem.',
                ),
            );
            return;
        }
        if (await Problems.loadProblem(filePath)) {
            Io.warn(vscode.l10n.t('Problem already exists for this file'));
            return;
        }
        const probFile = CphCapable.getProbBySrc(filePath);
        const problem = await CphCapable.loadProblem(probFile);
        if (problem) {
            await Problems.saveProblem(problem);
            await ProblemsManager.dataRefresh();
        }
    }
}
