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

import { UUID } from 'crypto';
import { writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { commands, debug, l10n, Uri, window } from 'vscode';
import { Compiler } from '../core/compiler';
import Langs from '../core/langs/langs';
import { Runner } from '../core/runner';
import FolderChooser from '../helpers/folderChooser';
import Io from '../helpers/io';
import Logger from '../helpers/logger';
import ProcessExecutor from '../helpers/processExecutor';
import {
    getActivePath,
    problemFs,
    sidebarProvider,
    waitUntil,
} from '../utils/global';
import { exists } from '../utils/process';
import { KnownResult } from '../utils/result';
import { isExpandVerdict, isRunningVerdict } from '../utils/types';
import {
    Problem,
    Tc,
    TcIo,
    TcResult,
    TcVerdicts,
    TcWithResult,
} from '../utils/types.backend';
import * as msgs from '../webview/msgs';
import Companion from './companion';
import { CphProblem } from './cphCapable';
import ExtensionManager from './extensionManager';
import ProblemFs, { generateTcUri } from './problemFs';
import Settings from './settings';
import TcFactory from './tcFactory';

interface FullProblem {
    problem: Problem;
    ac: AbortController | null;
    startTime: number;
}

export default class ProblemsManager {
    private static logger: Logger = new Logger('problemsManager');
    private static fullProblems: FullProblem[] = [];

    public static async listFullProblems(): Promise<FullProblem[]> {
        return this.fullProblems;
    }
    public static async getFullProblem(
        path?: string,
    ): Promise<FullProblem | null> {
        if (!path) {
            return null;
        }
        for (const fullProblem of this.fullProblems) {
            if (fullProblem.problem.isRelated(path)) {
                this.logger.trace(
                    'Found loaded problem',
                    fullProblem.problem.src.path,
                    'for path',
                    path,
                );
                return fullProblem;
            }
        }
        const problem = await Problem.fromSrc(path);
        if (!problem) {
            this.logger.debug('Failed to load problem for path', path);
            return null;
        }
        this.logger.debug('Loaded problem', problem.src.path, 'for path', path);
        const fullProblem = {
            problem,
            ac: null,
            startTime: Date.now(),
        } satisfies FullProblem;
        this.fullProblems.push(fullProblem);
        return fullProblem;
    }
    public static async dataRefresh() {
        this.logger.trace('Starting data refresh');
        const activePath = getActivePath();
        const idles: FullProblem[] = this.fullProblems.filter(
            (fullProblem) =>
                !fullProblem.ac && !fullProblem.problem.isRelated(activePath),
        );
        for (const idle of idles) {
            idle.problem.timeElapsed += Date.now() - idle.startTime;
            idle.problem.tcs = Object.fromEntries(
                Object.entries(idle.problem.tcs).filter(([key]) =>
                    idle.problem.tcOrder.includes(key as UUID),
                ),
            );
            await idle.problem.save();
            this.logger.debug('Closed idle problem', idle.problem.src.path);
        }
        this.fullProblems = this.fullProblems.filter((p) => !idles.includes(p));

        const fullProblem = await this.getFullProblem(activePath);
        const canImport =
            !!activePath && (await exists(CphProblem.getProbBySrc(activePath)));
        sidebarProvider.event.emit('problem', {
            problem: fullProblem && {
                problem: fullProblem.problem,
                startTime: fullProblem.startTime,
            },
            bgProblems: this.fullProblems
                .map((bgProblem) => ({
                    name: bgProblem.problem.name,
                    srcPath: bgProblem.problem.src.path,
                }))
                .filter(
                    (bgProblem) =>
                        bgProblem.srcPath !== fullProblem?.problem.src.path,
                ),
            canImport,
        });
        ExtensionManager.event.emit('context', {
            hasProblem: !!fullProblem,
            canImport,
            isRunning: !!fullProblem?.ac,
        });
        fullProblem &&
            (await problemFs.fireAuthorityChange(fullProblem.problem.src.path));
    }
    public static async closeAll() {
        for (const fullProblem of this.fullProblems) {
            fullProblem.ac?.abort();
            await waitUntil(() => !fullProblem.ac);
            fullProblem.problem.timeElapsed +=
                Date.now() - fullProblem.startTime;
            await fullProblem.problem.save();
        }
        this.fullProblems = [];
    }

    public static async createProblem(
        msg: msgs.CreateProblemMsg,
    ): Promise<void> {
        const src = msg.activePath;
        if (!src) {
            Io.warn(
                l10n.t(
                    'No active editor found. Please open a file to create a problem.',
                ),
            );
            return;
        }
        const binPath = await Problem.getBinBySrc(src);
        if (binPath && (await exists(binPath))) {
            Io.warn(l10n.t('Problem already exists for this file.'));
            return;
        }
        const problem = new Problem(basename(src, extname(src)), src);
        await problem.save();
        await ProblemsManager.dataRefresh();
    }
    public static async importProblem(
        msg: msgs.ImportProblemMsg,
    ): Promise<void> {
        const src = msg.activePath;
        if (!src) {
            Io.warn(
                l10n.t(
                    'No active editor found. Please open a file to create a problem.',
                ),
            );
            return;
        }
        const binPath = await Problem.getBinBySrc(src);
        if (binPath && (await exists(binPath))) {
            Io.warn(l10n.t('Problem already exists for this file.'));
            return;
        }
        const probFile = CphProblem.getProbBySrc(src);
        const problem = (await CphProblem.fromFile(probFile))?.toProblem();
        if (!problem) {
            Io.warn(l10n.t('Failed to load problem from CPH.'));
            return;
        }
        await problem.save();
        await ProblemsManager.dataRefresh();
    }

    public static async editProblemDetails(msg: msgs.EditProblemDetailsMsg) {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        fullProblem.problem.name = msg.title;
        fullProblem.problem.url = msg.url;
        fullProblem.problem.timeLimit = msg.timeLimit;
        fullProblem.problem.memoryLimit = msg.memoryLimit;
        fullProblem.problem.compilationSettings = msg.compilationSettings;
        await this.dataRefresh();
    }
    public static async delProblem(msg: msgs.DelProblemMsg) {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        await fullProblem.problem.del();
        this.fullProblems = this.fullProblems.filter((p) => p !== fullProblem);
        await this.dataRefresh();
    }

    public static async addTc(msg: msgs.AddTcMsg) {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        fullProblem.problem.addTc(new Tc());
        await this.dataRefresh();
    }
    public static async loadTcs(msg: msgs.LoadTcsMsg) {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }

        const option = (
            await window.showQuickPick(
                [
                    {
                        label: l10n.t('Load from a zip file'),
                        value: 'zip',
                    },
                    {
                        label: l10n.t('Load from a folder'),
                        value: 'folder',
                    },
                ],
                { canPickMany: false },
            )
        )?.value;
        if (!option) {
            return undefined;
        }

        if (option === 'zip') {
            const zipFile = await window.showOpenDialog({
                title: l10n.t('Choose a zip file containing test cases'),
                filters: { 'Zip files': ['zip'], 'All files': ['*'] },
            });
            if (!zipFile) {
                return undefined;
            }
            fullProblem.problem.applyTcs(
                await TcFactory.fromZip(
                    fullProblem.problem.src.path,
                    zipFile[0].fsPath,
                ),
            );
        } else if (option === 'folder') {
            const folderUri = await FolderChooser.chooseFolder(
                l10n.t('Choose a folder containing test cases'),
            );
            if (!folderUri) {
                return undefined;
            }
            fullProblem.problem.applyTcs(
                await TcFactory.fromFolder(folderUri.fsPath),
            );
        }
        await this.dataRefresh();
    }
    public static async updateTc(msg: msgs.UpdateTcMsg) {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        fullProblem.problem.tcs[msg.id] = Tc.fromI(msg.tc);
        await this.dataRefresh();
    }

    public static async runTc(msg: msgs.RunTcMsg): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        fullProblem.ac && fullProblem.ac.abort();
        fullProblem.ac = new AbortController();

        try {
            const tc = fullProblem.problem.tcs[msg.id] as TcWithResult;
            tc.result = new TcResult();
            tc.result.verdict = TcVerdicts.CP;
            tc.isExpand = false;
            await this.dataRefresh();

            // Compile
            const compileResult = await Compiler.compileAll(
                fullProblem.problem,
                msg.compile,
                fullProblem.ac,
            );
            if (compileResult instanceof KnownResult) {
                tc.result.fromResult(compileResult);
                tc.isExpand = true;
                return;
            }
            tc.result.verdict = TcVerdicts.CPD;

            // Run
            await Runner.run(
                fullProblem.problem,
                tc,
                compileResult.data.srcLang,
                fullProblem.ac,
                compileResult.data,
            );
            tc.isExpand = isExpandVerdict(tc.result.verdict);
        } finally {
            fullProblem.ac = null;
            await this.dataRefresh();
        }
    }
    public static async toggleDisable(msg: msgs.ToggleDisableMsg) {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        fullProblem.problem.tcs[msg.id].isDisabled =
            !fullProblem.problem.tcs[msg.id].isDisabled;
        await this.dataRefresh();
    }
    public static async clearTcStatus(msg: msgs.ClearTcStatusMsg) {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        fullProblem.problem.tcs[msg.id].result = undefined;
        await this.dataRefresh();
    }
    public static async clearStatus(msg: msgs.ClearStatusMsg) {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        for (const tc of Object.values(fullProblem.problem.tcs)) {
            tc.result = undefined;
        }
        await this.dataRefresh();
    }

    public static async runTcs(msg: msgs.RunTcsMsg): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        fullProblem.ac && fullProblem.ac.abort();
        fullProblem.ac = new AbortController();

        try {
            const tcs = fullProblem.problem.tcs;
            const tcOrder = [...fullProblem.problem.tcOrder].filter(
                (id) => !tcs[id].isDisabled,
            );
            for (const tcId of tcOrder) {
                tcs[tcId].result = new TcResult(TcVerdicts.CP);
                tcs[tcId].isExpand = false;
            }
            await this.dataRefresh();

            // Compile
            const compileResult = await Compiler.compileAll(
                fullProblem.problem,
                msg.compile,
                fullProblem.ac,
            );
            if (compileResult instanceof KnownResult) {
                for (const tcId of tcOrder) {
                    tcs[tcId].result?.fromResult(compileResult);
                }
                return;
            }
            for (const tcId of tcOrder) {
                const result = tcs[tcId].result;
                if (result) {
                    result.verdict = TcVerdicts.CPD;
                }
            }
            await this.dataRefresh();

            // Run
            let hasExpandStatus = false;
            for (const tcId of tcOrder) {
                const tc = tcs[tcId] as TcWithResult;
                if (!tc.result) {
                    continue;
                }
                if (fullProblem.ac.signal.aborted) {
                    if (fullProblem.ac.signal.reason === 'onlyOne') {
                        fullProblem.ac = new AbortController();
                    } else {
                        tc.result.verdict = TcVerdicts.SK;
                        continue;
                    }
                }
                await Runner.run(
                    fullProblem.problem,
                    tc,
                    compileResult.data.srcLang,
                    fullProblem.ac,
                    compileResult.data,
                );
                if (!hasExpandStatus) {
                    tc.isExpand = isExpandVerdict(tc.result.verdict);
                    await this.dataRefresh();
                    hasExpandStatus = tc.isExpand;
                }
            }
        } finally {
            fullProblem.ac = null;
            await this.dataRefresh();
        }
    }

    public static async stopTcs(msg: msgs.StopTcsMsg): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        if (fullProblem.ac) {
            fullProblem.ac.abort(msg.onlyOne ? 'onlyOne' : undefined);
            if (msg.onlyOne) {
                return;
            }
            await waitUntil(() => !fullProblem.ac);
        }
        for (const tc of Object.values(fullProblem.problem.tcs)) {
            if (tc.result && isRunningVerdict(tc.result.verdict)) {
                tc.result.verdict = TcVerdicts.RJ;
            }
        }
        await this.dataRefresh();
    }
    public static async chooseTcFile(msg: msgs.ChooseTcFileMsg): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        const isInput = msg.label === 'stdin';
        const mainExt = isInput
            ? Settings.problem.inputFileExtensionList
            : Settings.problem.outputFileExtensionList;
        const fileUri = await window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            title: l10n.t('Choose {type} file', {
                type: isInput ? l10n.t('stdin') : l10n.t('answer'),
            }),
            filters: {
                [l10n.t('Text files')]: mainExt.map((ext) => ext.substring(1)),
                [l10n.t('All files')]: ['*'],
            },
        });
        if (!fileUri || !fileUri.length) {
            return;
        }
        const partialTc = await TcFactory.fromFile(fileUri[0].fsPath, isInput);
        partialTc.stdin &&
            (fullProblem.problem.tcs[msg.id].stdin = partialTc.stdin);
        partialTc.answer &&
            (fullProblem.problem.tcs[msg.id].answer = partialTc.answer);
        await this.dataRefresh();
    }
    public static async compareTc(msg: msgs.CompareTcMsg): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        const tc = fullProblem.problem.tcs[msg.id];
        if (!tc.result) {
            return;
        }
        try {
            commands.executeCommand(
                'vscode.diff',
                generateTcUri(fullProblem.problem, msg.id, 'answer'),
                generateTcUri(fullProblem.problem, msg.id, 'stdout'),
            );
        } catch (e) {
            Io.error(
                l10n.t('Failed to compare test case: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }
    public static async toggleTcFile(msg: msgs.ToggleTcFileMsg): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        const tc = fullProblem.problem.tcs[msg.id];
        const fileIo = tc[msg.label];
        if (fileIo.useFile) {
            const data = await fileIo.toString();
            if (
                data.length <= Settings.problem.maxInlineDataLength ||
                (await Io.confirm(
                    l10n.t(
                        'The file size is {size} bytes, which may be large. Are you sure you want to load it inline?',
                        { size: data.length },
                    ),
                ))
            ) {
                tc[msg.label] = new TcIo(false, data);
            }
        } else {
            const ext = {
                stdin: Settings.problem.inputFileExtensionList[0] || '.in',
                answer: Settings.problem.outputFileExtensionList[0] || '.ans',
            }[msg.label];
            let tempFilePath: string | undefined = join(
                dirname(fullProblem.problem.src.path),
                `${basename(fullProblem.problem.src.path, extname(fullProblem.problem.src.path))}-${msg.id + 1}${ext}`,
            );
            tempFilePath = await window
                .showSaveDialog({
                    defaultUri: Uri.file(tempFilePath),
                    saveLabel: l10n.t('Select location to save'),
                })
                .then((uri) => (uri ? uri.fsPath : undefined));
            if (!tempFilePath) {
                return;
            }
            await writeFile(tempFilePath, fileIo.data);
            tc[msg.label] = new TcIo(true, tempFilePath);
        }
        await this.dataRefresh();
    }
    public static async delTc(msg: msgs.DelTcMsg): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        fullProblem.problem.tcOrder = fullProblem.problem.tcOrder.filter(
            (id) => id !== msg.id,
        );
        await this.dataRefresh();
    }
    public static async reorderTc(msg: msgs.ReorderTcMsg): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        const tcOrder = fullProblem.problem.tcOrder;
        const [movedTc] = tcOrder.splice(msg.fromIdx, 1);
        tcOrder.splice(msg.toIdx, 0, movedTc);
        await this.dataRefresh();
    }

    public static async chooseSrcFile(
        msg: msgs.ChooseSrcFileMsg,
    ): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }

        const checkerFileUri = await window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            title: l10n.t('Select {fileType} File', {
                fileType: {
                    checker: l10n.t('Checker'),
                    interactor: l10n.t('Interactor'),
                    generator: l10n.t('Generator'),
                    bruteForce: l10n.t('Brute Force'),
                }[msg.fileType],
            }),
        });
        if (!checkerFileUri) {
            return;
        }
        const path = checkerFileUri[0].fsPath;
        if (msg.fileType === 'checker') {
            fullProblem.problem.checker = { path };
        } else if (msg.fileType === 'interactor') {
            fullProblem.problem.interactor = { path };
        } else if (msg.fileType === 'generator') {
            if (!fullProblem.problem.bfCompare) {
                fullProblem.problem.bfCompare = { running: false, msg: '' };
            }
            fullProblem.problem.bfCompare.generator = { path };
        } else {
            if (!fullProblem.problem.bfCompare) {
                fullProblem.problem.bfCompare = { running: false, msg: '' };
            }
            fullProblem.problem.bfCompare.bruteForce = { path };
        }
        await this.dataRefresh();
    }
    public static async removeSrcFile(
        msg: msgs.RemoveSrcFileMsg,
    ): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        if (msg.fileType === 'checker') {
            fullProblem.problem.checker = undefined;
        } else if (msg.fileType === 'interactor') {
            fullProblem.problem.interactor = undefined;
        } else if (
            msg.fileType === 'generator' &&
            fullProblem.problem.bfCompare
        ) {
            fullProblem.problem.bfCompare.generator = undefined;
        } else if (
            msg.fileType === 'bruteForce' &&
            fullProblem.problem.bfCompare
        ) {
            fullProblem.problem.bfCompare.bruteForce = undefined;
        }
        await this.dataRefresh();
    }
    public static async startBfCompare(
        msg: msgs.StartBfCompareMsg,
    ): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        const bfCompare = fullProblem.problem.bfCompare;
        if (!bfCompare || !bfCompare.generator || !bfCompare.bruteForce) {
            Io.warn(
                l10n.t(
                    'Please choose both generator and brute force files first.',
                ),
            );
            return;
        }
        if (bfCompare.running) {
            Io.warn(l10n.t('Brute Force comparison is already running.'));
            return;
        }
        fullProblem.ac && fullProblem.ac.abort();
        fullProblem.ac = new AbortController();
        const srcLang = Langs.getLang(fullProblem.problem.src.path);
        const generatorLang = Langs.getLang(bfCompare.generator.path);
        const bruteForceLang = Langs.getLang(bfCompare.bruteForce.path);
        if (!srcLang || !generatorLang || !bruteForceLang) {
            Io.warn(
                l10n.t(
                    'Failed to detect language for source, generator, or brute force.',
                ),
            );
            return;
        }

        let cnt = 0;
        try {
            bfCompare.running = true;
            bfCompare.msg = l10n.t('Compiling...');
            await this.dataRefresh();
            const compileResult = await Compiler.compileAll(
                fullProblem.problem,
                msg.compile,
                fullProblem.ac,
            );
            if (compileResult instanceof KnownResult) {
                bfCompare.msg =
                    compileResult.msg || l10n.t('Solution compilation failed');
                return;
            }

            while (true) {
                cnt++;
                if (fullProblem.ac.signal.aborted) {
                    bfCompare.msg = l10n.t(
                        'Brute Force comparison stopped by user.',
                    );
                    break;
                }

                bfCompare.msg = l10n.t('#{cnt} Running generator...', {
                    cnt,
                });
                await this.dataRefresh();
                const generatorRunResult = await Runner.doRun({
                    cmd: await generatorLang.getRunCommand(
                        compileResult.data.bfCompare!.generator.outputPath,
                    ),
                    timeLimit: Settings.bfCompare.generatorTimeLimit,
                    stdin: new TcIo(false, ''),
                    ac: fullProblem.ac,
                    enableRunner: false,
                });
                if (generatorRunResult instanceof KnownResult) {
                    generatorRunResult.verdict !== TcVerdicts.RJ &&
                        (bfCompare.msg = l10n.t('Generator run failed: {msg}', {
                            msg: generatorRunResult.msg,
                        }));
                    break;
                }
                const stdin = new TcIo(
                    true,
                    generatorRunResult.data.stdoutPath,
                );

                bfCompare.msg = l10n.t('#{cnt} Running brute force...', {
                    cnt,
                });
                await this.dataRefresh();
                const bruteForceRunResult = await Runner.doRun({
                    cmd: await bruteForceLang.getRunCommand(
                        compileResult.data.bfCompare!.bruteForce.outputPath,
                    ),
                    timeLimit: Settings.bfCompare.bruteForceTimeLimit,
                    stdin,
                    ac: fullProblem.ac,
                    enableRunner: false,
                });
                if (bruteForceRunResult instanceof KnownResult) {
                    bruteForceRunResult.verdict !== TcVerdicts.RJ &&
                        (bfCompare.msg = l10n.t(
                            'Brute force run failed: {msg}',
                            {
                                msg: bruteForceRunResult.msg,
                            },
                        ));
                    break;
                }

                bfCompare.msg = l10n.t('#{cnt} Running solution...', {
                    cnt,
                });
                await this.dataRefresh();
                const tempTc = Tc.fromI({
                    stdin,
                    answer: new TcIo(true, bruteForceRunResult.data.stdoutPath),
                    isExpand: true,
                    isDisabled: false,
                    result: new TcResult(TcVerdicts.CP),
                }) as TcWithResult;
                await Runner.run(
                    fullProblem.problem,
                    tempTc,
                    srcLang,
                    fullProblem.ac,
                    compileResult.data!,
                );
                if (tempTc.result.verdict !== TcVerdicts.AC) {
                    if (tempTc.result.verdict !== TcVerdicts.RJ) {
                        await tempTc.stdin.inlineSmall();
                        await tempTc.answer.inlineSmall();
                        fullProblem.problem.addTc(
                            new Tc(tempTc.stdin, tempTc.answer, true),
                        );
                        bfCompare.msg = l10n.t(
                            'Found a difference in #{cnt} run.',
                            { cnt },
                        );
                    }
                    break;
                }
            }
        } finally {
            bfCompare.running = false;
            if (fullProblem.ac?.signal.aborted) {
                bfCompare.msg = l10n.t(
                    'Brute Force comparison stopped by user, {cnt} runs completed.',
                    { cnt },
                );
            }
            fullProblem.ac = null;
            await this.dataRefresh();
        }
    }
    public static async stopBfCompare(
        msg: msgs.StopBfCompareMsg,
    ): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        if (
            !fullProblem.problem.bfCompare ||
            !fullProblem.problem.bfCompare.running
        ) {
            Io.warn(l10n.t('Brute Force comparison is not running.'));
            return;
        }
        fullProblem.ac && fullProblem.ac.abort();
        await this.dataRefresh();
    }
    public static async submitToCodeforces(
        msg: msgs.SubmitToCodeforcesMsg,
    ): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        Companion.submit(fullProblem.problem);
    }
    public static async openFile(msg: msgs.OpenFileMsg): Promise<void> {
        if (!msg.isVirtual) {
            await commands.executeCommand('vscode.open', Uri.file(msg.path));
            return;
        }
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        await commands.executeCommand(
            'vscode.open',
            Uri.from({
                scheme: ProblemFs.scheme,
                authority: fullProblem.problem.src.path,
                path: msg.path,
            }),
        );
    }
    public static async debugTc(msg: msgs.DebugTcMsg): Promise<void> {
        try {
            const fullProblem = await this.getFullProblem(msg.activePath);
            if (!fullProblem) {
                return;
            }
            const srcLang = Langs.getLang(fullProblem.problem.src.path);
            if (!srcLang) {
                return;
            }

            const result = await srcLang.compile(
                fullProblem.problem.src,
                new AbortController(),
                null,
                {
                    canUseWrapper: false,
                    compilationSettings:
                        fullProblem.problem.compilationSettings,
                    debug: true,
                },
            );
            if (result instanceof KnownResult) {
                Io.error(
                    l10n.t('Failed to compile the program: {msg}', {
                        msg: result.msg,
                    }),
                );
                return;
            }
            fullProblem.problem.src.hash = result.data!.hash;

            const outputPath = result.data?.outputPath;
            if (!outputPath) {
                Io.error(l10n.t('Compile data is empty.'));
                return;
            }

            const process = await ProcessExecutor.launch({
                cmd: [outputPath],
                stdin: fullProblem.problem.tcs[msg.id].stdin,
                debug: true,
            });

            try {
                if (srcLang.name === 'C' || srcLang.name === 'C++') {
                    await debug.startDebugging(undefined, {
                        type: 'cppdbg',
                        name: `CPH-NG Debug`,
                        request: 'attach',
                        processId: process.child.pid,
                        program: outputPath,
                        cwd: dirname(fullProblem.problem.src.path),
                        setupCommands: [
                            {
                                description: 'Set breakpoint at main',
                                text: '-break-insert -f main',
                                ignoreFailures: false,
                            },
                        ],
                    });
                } else {
                    Io.error(
                        l10n.t(
                            'Debugging is not supported for this language yet.',
                        ),
                    );
                    return;
                }
            } catch (err) {
                Io.error(
                    l10n.t('Failed to start debugger: {msg}', {
                        msg: (err as Error).message,
                    }),
                );
            }
        } catch (err) {
            Io.error(
                l10n.t('Failed to debug test case: {msg}', {
                    msg: (err as Error).message,
                }),
            );
        }
    }
    public static async dragDrop(msg: msgs.DragDropMsg): Promise<void> {
        const fullProblem = await this.getFullProblem(msg.activePath);
        if (!fullProblem) {
            return;
        }
        for (const item in msg.items) {
            if (msg.items[item] === 'folder') {
                fullProblem.problem.applyTcs(await TcFactory.fromFolder(item));
                break;
            }
            const ext = extname(item).toLowerCase();
            if (ext === '.zip') {
                fullProblem.problem.applyTcs(
                    await TcFactory.fromZip(fullProblem.problem.src.path, item),
                );
                break;
            }
            if (
                Settings.problem.inputFileExtensionList.includes(ext) ||
                Settings.problem.outputFileExtensionList.includes(ext)
            ) {
                const { stdin, answer } = await TcFactory.fromFile(item);
                fullProblem.problem.addTc(
                    new Tc(stdin ?? new TcIo(), answer ?? new TcIo()),
                );
            }
        }
        await this.dataRefresh();
    }
}
