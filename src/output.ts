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

class Output {
    private outputChannel: vscode.LogOutputChannel;
    private compilationChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('CPH-NG', {
            log: true,
        });
        this.compilationChannel = vscode.window.createOutputChannel(
            vscode.l10n.t('CPH-NG Compilation'),
        );
    }

    public trace(message: string): void {
        this.outputChannel.trace(message);
    }
    public debug(message: string): void {
        this.outputChannel.debug(message);
    }
    public info(message: string): void {
        this.outputChannel.info(message);
    }
    public warn(message: string): void {
        this.outputChannel.warn(message);
    }
    public error(message: string): void {
        this.outputChannel.error(message);
    }
    public critical(message: string): void {
        this.outputChannel.error(message);
    }

    public setCompilationMessage(message: string): void {
        this.compilationChannel.clear();
        this.compilationChannel.appendLine(message);
        this.compilationChannel.show();
    }
}

export const output = new Output();
