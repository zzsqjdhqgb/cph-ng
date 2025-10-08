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
import SidebarProvider from '../modules/sidebarProvider';

export let extensionUri: vscode.Uri;
export let extensionPath: string;
export const setExtensionUri = (uri: vscode.Uri) => {
    extensionUri = uri;
    extensionPath = uri.fsPath;
};
export const sidebarProvider = new SidebarProvider();
export const getActivePath = () => {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (!activeUri || activeUri.scheme !== 'file') {
        return undefined;
    }
    return activeUri.fsPath;
};
export const waitUntil = async (check: () => boolean) => {
    return new Promise<void>((resolve, _reject) => {
        if (check()) {
            resolve();
        }
        const intervalId = setInterval(() => {
            if (check()) {
                clearInterval(intervalId);
                resolve();
            }
        }, 50);
    });
};
