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

import { spawn } from 'child_process';
import { access, constants, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import * as vscode from 'vscode';
import { Compiler } from './compiler';
import Settings from './settings';
import { TestCaseStatuses } from './testCaseStatuses';
import { TestCase, TestCaseStatus } from './types';
import Result from './result';

export interface CheckerResult {
    status: TestCaseStatus;
    message?: string;
    score?: number;
}

export class Checker {
    public async runChecker(
        checkerOutputPath: string,
        testCase: TestCase,
        abortController: AbortController,
    ): Promise<Result<{}>> {
        return new Promise(async (resolve) => {
            try {
                const tempDir = join(Settings.cache.directory, 'checker');
                const inputFile = testCase.inputFile
                    ? testCase.input
                    : join(tempDir, 'input.txt');
                const outputFile = testCase.outputFile
                    ? testCase.output!
                    : join(tempDir, 'output.txt');
                const answerFile = testCase.answerFile
                    ? testCase.answer!
                    : join(tempDir, 'answer.txt');
                await Promise.all([
                    !testCase.inputFile && writeFile(inputFile, testCase.input),
                    !testCase.outputFile &&
                        writeFile(outputFile, testCase.output!),
                    !testCase.answerFile &&
                        writeFile(answerFile, testCase.answer!),
                ]);

                const child = spawn(
                    checkerOutputPath,
                    [inputFile, outputFile, answerFile],
                    {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        signal: abortController.signal,
                    },
                );

                let stdout = '';
                let stderr = '';

                child.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                child.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                child.on('close', (code) => {
                    let status: TestCaseStatus;
                    let message = stderr.trim() || stdout.trim();

                    switch (code) {
                        case 0:
                            status = TestCaseStatuses.AC;
                            break;
                        case 1:
                            status = TestCaseStatuses.WA;
                            break;
                        case 2:
                            status = TestCaseStatuses.PE;
                            break;
                        case 3:
                            status = TestCaseStatuses.SE;
                            message = vscode.l10n.t('Checker run failed');
                            break;
                        case 4:
                            status = TestCaseStatuses.WA;
                            message = vscode.l10n.t('Unexpected EOF');
                            break;
                        case 5:
                            status = TestCaseStatuses.PC;
                            break;
                        default:
                            status = TestCaseStatuses.SE;
                            message = vscode.l10n.t(
                                'Checker returned unknown exit code: {code}',
                                { code },
                            );
                    }

                    resolve({
                        status,
                        message: message.trim(),
                    });
                });

                child.on('error', (err: Error) => {
                    resolve({
                        status: TestCaseStatuses.SE,
                        message: vscode.l10n.t(
                            'Failed to run checker: {error}',
                            {
                                error: err.message,
                            },
                        ),
                    });
                });
            } catch (error) {
                const err = error as Error;
                resolve({
                    status: TestCaseStatuses.SE,
                    message: vscode.l10n.t('Checker setup failed: {error}', {
                        error: err.message,
                    }),
                });
            }
        });
    }
}
