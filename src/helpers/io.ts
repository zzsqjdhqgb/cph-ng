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

import { l10n, window } from 'vscode';
import Logger from '../helpers/logger';

const compilationChannel = window.createOutputChannel(
    l10n.t('CPH-NG Compilation'),
);

export default class Io {
    private static logger: Logger = new Logger('io');
    private static _compilationMsg = '';

    public static info(msg: string, ...args: any) {
        this.logger.info(msg);
        return window.showInformationMessage(msg, ...args);
    }
    public static warn(msg: string, ...args: any) {
        this.logger.warn(msg);
        return window.showWarningMessage(msg, ...args);
    }
    public static error(msg: string, ...args: any) {
        this.logger.error(msg);
        return window.showErrorMessage(msg, ...args);
    }
    public static async confirm(
        msg: string,
        modal: boolean = false,
    ): Promise<boolean> {
        this.logger.info(msg);
        return (
            (await window.showInformationMessage(msg, { modal }, 'Yes')) ===
            'Yes'
        );
    }

    static set compilationMsg(msg: string) {
        this.logger.info('Setting compilation message', msg);
        compilationChannel.clear();
        compilationChannel.appendLine(msg);
        if (msg.trim()) {
            compilationChannel.show();
        } else {
            compilationChannel.hide();
        }
        this._compilationMsg = msg;
    }

    static get compilationMsg(): string {
        return this._compilationMsg;
    }
}
