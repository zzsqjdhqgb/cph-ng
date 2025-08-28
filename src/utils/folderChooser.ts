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
import Settings from './settings';
import { io } from './io';

export class FolderChooser {
    static async getSubfoldersRecursively(
        folderUri: vscode.Uri,
    ): Promise<vscode.Uri[]> {
        const subfolders: vscode.Uri[] = [];
        const entries = await vscode.workspace.fs.readDirectory(folderUri);
        for (const [name, type] of entries) {
            if (type === vscode.FileType.Directory && name[0] !== '.') {
                const subfolderUri = vscode.Uri.joinPath(folderUri, name);
                subfolders.push(subfolderUri);
                const nestedSubfolders =
                    await this.getSubfoldersRecursively(subfolderUri);
                subfolders.push(...nestedSubfolders);
            }
        }
        return subfolders;
    }

    static async chooseFolderWithDialog(
        title: string,
    ): Promise<vscode.Uri | null> {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            title,
            canSelectFolders: true,
            canSelectFiles: false,
        });
        if (folderUri && folderUri[0]) {
            return folderUri[0];
        } else {
            return null;
        }
    }

    static async chooseFolderWithQuickPick(
        title: string,
    ): Promise<vscode.Uri | null> {
        if (!vscode.workspace.workspaceFolders) {
            io.error(vscode.l10n.t('No workspace folder is open.'));
            return null;
        }

        const subfolders = await Promise.all(
            vscode.workspace.workspaceFolders.map(async (folder) => [
                ...(await this.getSubfoldersRecursively(folder.uri)).map(
                    (uri) => ({ folder, uri }),
                ),
                { folder, uri: folder.uri },
            ]),
        ).then((results) => results.flat());

        const selected = await vscode.window.showQuickPick(
            subfolders.map((subfolder) => ({
                label: vscode.workspace.asRelativePath(subfolder.uri),
                description: subfolder.folder.name,
                details: subfolder.uri.fsPath,
            })),
            {
                title,
            },
        );

        if (!selected) {
            return null;
        }
        return vscode.Uri.file(selected.description);
    }

    static async chooseFolder(title: string): Promise<vscode.Uri | null> {
        if (Settings.basic.folderOpener === 'tree') {
            return await this.chooseFolderWithDialog(title);
        } else {
            return await this.chooseFolderWithQuickPick(title);
        }
    }
}
