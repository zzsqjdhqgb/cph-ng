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

import { access, readFile, writeFile } from 'fs/promises';
import { createServer, Server } from 'http';
import { join } from 'path';
import * as vscode from 'vscode';
import { CphCapable, CphProblem } from './cphCapable';
import { io } from './io';
import Settings from './settings';
import { renderTemplate } from './strTemplate';
import { Problem } from './types';

class Companion {
    server: Server;

    constructor(onCreateProblem: (problem: Problem) => void) {
        this.server = createServer((request, response) => {
            let requestData = '';

            request.on('data', (chunk) => {
                requestData += chunk;
            });

            request.on('close', async () => {
                try {
                    const problem = CphCapable.toProblem(
                        JSON.parse(requestData) as CphProblem,
                    );
                    const workspaceFolder =
                        vscode.workspace.workspaceFolders?.[0].uri.fsPath;

                    if (!workspaceFolder) {
                        io.info(
                            vscode.l10n.t(
                                'No workspace folder found. Please open a workspace folder.',
                            ),
                        );
                        return;
                    }

                    problem.srcPath = join(
                        workspaceFolder.toString(),
                        this.getProblemFileName(problem.name),
                    );

                    try {
                        await access(problem.srcPath);
                    } catch {
                        await this.createSourceFile(problem);
                    }

                    const document = await vscode.workspace.openTextDocument(
                        problem.srcPath,
                    );
                    await vscode.window.showTextDocument(document);
                    onCreateProblem(problem);
                } catch (e) {
                    // Handle parsing errors silently
                }
            });

            response.end();
        });

        this.server.on('error', (e) => {
            if (
                vscode.extensions.getExtension(
                    'divyanshuagrawal.competitive-programming-helper',
                )?.isActive
            ) {
                io.warn(
                    vscode.l10n.t(
                        'CPH-NG is not compatible with CPH, please disable CPH to use CPH-NG.',
                    ),
                );
            } else {
                io.error(
                    vscode.l10n.t(
                        'Failed to start companion server: {error}.',
                        { error: e.message },
                    ),
                );
            }
        });

        this.server.listen(Settings.companion.listenPort);
    }

    public dispose() {
        this.server.close();
    }

    private async createSourceFile(problem: Problem): Promise<void> {
        try {
            if (Settings.problem.templateFile) {
                try {
                    const template = await readFile(
                        Settings.problem.templateFile,
                        'utf-8',
                    );
                    const renderedTemplate = renderTemplate(template, [
                        ['title', problem.name],
                        ['timeLimit', problem.timeLimit.toString()],
                        ['url', problem.url || ''],
                    ]);
                    await writeFile(problem.srcPath, renderedTemplate);
                } catch (templateError: unknown) {
                    const err = templateError as Error;
                    io.warn(
                        vscode.l10n.t(
                            'Failed to use template file: {error}, creating empty file instead',
                            { error: err.message },
                        ),
                    );
                    await writeFile(problem.srcPath, '');
                }
            } else {
                await writeFile(problem.srcPath, '');
            }
        } catch (error: unknown) {
            const err = error as Error;
            throw new Error(`Failed to create source file: ${err.message}`);
        }
    }

    private getProblemFileName(name: string) {
        const words = name.match(/[\p{L}]+|[0-9]+/gu);
        return (
            (words ? `${words.join('_')}` : `${name.replace(/\W+/g, '_')}`) +
            '.cpp'
        );
    }
}

export default Companion;
