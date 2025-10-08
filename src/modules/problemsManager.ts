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

import { unlink, writeFile } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import * as vscode from 'vscode';
import { Compiler } from '../core/compiler';
import Langs from '../core/langs/langs';
import { Runner } from '../core/runner';
import Io from '../helpers/io';
import Logger from '../helpers/logger';
import Problems from '../helpers/problems';
import { getActivePath, sidebarProvider, waitUntil } from '../utils/global';
import { exists } from '../utils/process';
import { isExpandVerdict, isRunningVerdict, Problem, TC } from '../utils/types';
import { tcIo2Path, tcIo2Str, TCVerdicts } from '../utils/types.backend';
import { chooseSrcFile, chooseTcFile, getTcs } from '../utils/ui';
import {
    AddTcMsg,
    ChooseSrcFileMsg,
    ChooseTcFileMsg,
    CompareTcMsg,
    DelProblemMsg,
    DelTcMsg,
    EditProblemDetailsMsg,
    LoadTcsMsg,
    RemoveSrcFileMsg,
    RunTcMsg,
    RunTcsMsg,
    StartBfCompareMsg,
    StopBfCompareMsg,
    StopTcsMsg,
    SubmitToCodeforcesMsg,
    ToggleTcFileMsg,
    UpdateTcMsg,
} from '../webview/msgs';
import Companion from './companion';
import CphCapable from './cphCapable';
import ExtensionManager from './extensionManager';
import Settings from './settings';

interface BgProblem {
    problem: Problem;
    ac: AbortController | null;
    startTime: number;
}

export default class ProblemsManager {
    private static logger: Logger = new Logger('problemsManager');
    private static bgProblems: BgProblem[] = [];

    public static async getBgProblem(path?: string): Promise<BgProblem | null> {
        if (!path) {
            return null;
        }
        for (const bgProblem of this.bgProblems) {
            if (Problems.isRelated(bgProblem.problem, path)) {
                return bgProblem;
            }
        }
        const problem = await Problems.loadProblem(path);
        if (!problem) {
            return null;
        }
        const bgProblem = {
            problem,
            ac: null,
            startTime: Date.now(),
        } satisfies BgProblem;
        this.bgProblems.push(bgProblem);
        return bgProblem;
    }
    public static async saveIfIdle() {
        const activePath = getActivePath();
        const idleProblems: BgProblem[] = this.bgProblems.filter(
            (bgProblem) =>
                !bgProblem.ac &&
                !Problems.isRelated(bgProblem.problem, activePath),
        );
        idleProblems.forEach(async (bgProblem) => {
            bgProblem.problem.timeElapsed += Date.now() - bgProblem.startTime;
            await Problems.saveProblem(bgProblem.problem);
            this.bgProblems = this.bgProblems.filter((p) => p !== bgProblem);
        });
    }
    public static async dataRefresh() {
        const filePath = getActivePath();
        const bgProblem = await this.getBgProblem(filePath);
        const canImport =
            !!filePath && (await exists(CphCapable.getProbBySrc(filePath)));
        sidebarProvider.event.emit('problem', {
            problem: bgProblem?.problem,
            canImport,
            startTime: bgProblem?.startTime,
        });
        ExtensionManager.event.emit('context', {
            hasProblem: !!bgProblem,
            canImport,
            isRunning: !!bgProblem?.ac,
        });
    }
    public static async closeAll() {
        for (const bgProblem of this.bgProblems) {
            bgProblem.ac?.abort();
            await waitUntil(() => !bgProblem.ac);
            bgProblem.problem.timeElapsed += Date.now() - bgProblem.startTime;
            await Problems.saveProblem(bgProblem.problem);
        }
        this.bgProblems = [];
    }

    public static async editProblemDetails(msg: EditProblemDetailsMsg) {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        bgProblem.problem.name = msg.title;
        bgProblem.problem.url = msg.url;
        bgProblem.problem.timeLimit = msg.timeLimit;
        bgProblem.problem.memoryLimit = msg.memoryLimit;
        await this.dataRefresh();
        await this.saveIfIdle();
    }
    public static async delProblem(msg: DelProblemMsg) {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        const binPath = await Problems.getBinBySrc(bgProblem.problem.src.path);
        if (!binPath) {
            return;
        }
        try {
            await unlink(binPath);
        } catch {
            Io.warn(
                vscode.l10n.t('Failed to delete problem file {file}.', {
                    file: basename(binPath),
                }),
            );
        }
        this.bgProblems = this.bgProblems.filter((p) => p !== bgProblem);
        await this.dataRefresh();
    }

    public static async addTc(msg: AddTcMsg) {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        bgProblem.problem.tcs.push({
            stdin: { useFile: false, data: '' },
            answer: { useFile: false, data: '' },
            isExpand: false,
        });
        await this.dataRefresh();
        await this.saveIfIdle();
    }
    public static async loadTcs(msg: LoadTcsMsg) {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        const tcs = await getTcs(bgProblem.problem.src.path);
        if (Settings.problem.clearBeforeLoad) {
            bgProblem.problem.tcs = tcs;
        } else {
            tcs.forEach((tc) => {
                bgProblem.problem.tcs.push(tc);
            });
        }
        await this.dataRefresh();
        await this.saveIfIdle();
    }
    public static async updateTc(msg: UpdateTcMsg) {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        bgProblem.problem.tcs[msg.idx] = msg.tc;
        await this.dataRefresh();
        await this.saveIfIdle();
    }

    public static async runTc(msg: RunTcMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        const srcLang = Langs.getLang(bgProblem.problem.src.path);
        if (!srcLang) {
            return;
        }
        bgProblem.ac && bgProblem.ac.abort();
        bgProblem.ac = new AbortController();
        const beforeReturn = async () => {
            bgProblem.ac = null;
            await this.dataRefresh();
            await this.saveIfIdle();
        };

        const tc = bgProblem.problem.tcs[msg.idx];
        tc.result = {
            verdict: TCVerdicts.CP,
            stdout: { useFile: false, data: '' },
            stderr: { useFile: false, data: '' },
            memory: undefined,
            time: 0,
            msg: '',
        };
        tc.isExpand = false;
        await this.dataRefresh();
        const result = tc.result;

        const compileResult = await Compiler.compileAll(
            bgProblem.problem,
            srcLang,
            msg.compile,
            bgProblem.ac,
        );
        if (compileResult.verdict !== TCVerdicts.UKE) {
            result.verdict = TCVerdicts.CE;
            tc.isExpand = true;
            await beforeReturn();
            return;
        }
        const compileData = compileResult.data;
        if (!compileData) {
            result.verdict = TCVerdicts.SE;
            result.msg = vscode.l10n.t('Compile data is empty.');
            await beforeReturn();
            return;
        }

        await Runner.run(
            bgProblem.problem,
            result,
            bgProblem.ac,
            srcLang,
            tc,
            compileData,
        );
        tc.isExpand = isExpandVerdict(result.verdict);
        await beforeReturn();
    }

    public static async runTcs(msg: RunTcsMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        const srcLang = Langs.getLang(bgProblem.problem.src.path);
        if (!srcLang) {
            return;
        }
        bgProblem.ac && bgProblem.ac.abort();
        bgProblem.ac = new AbortController();
        const beforeReturn = async () => {
            bgProblem.ac = null;
            await this.dataRefresh();
            await this.saveIfIdle();
        };

        for (const tc of bgProblem.problem.tcs) {
            tc.result = {
                verdict: TCVerdicts.CP,
                stdout: { useFile: false, data: '' },
                stderr: { useFile: false, data: '' },
                memory: undefined,
                time: 0,
                msg: '',
            };
            tc.isExpand = false;
        }
        await this.dataRefresh();

        const compileResult = await Compiler.compileAll(
            bgProblem.problem,
            srcLang,
            msg.compile,
            bgProblem.ac,
        );
        if (compileResult.verdict !== TCVerdicts.UKE) {
            for (const tc of bgProblem.problem.tcs) {
                tc.result!.verdict = TCVerdicts.CE;
            }
            await beforeReturn();
            return;
        }
        const compileData = compileResult.data;
        if (!compileData) {
            for (const tc of bgProblem.problem.tcs) {
                tc.result!.verdict = TCVerdicts.SE;
                tc.result!.msg = vscode.l10n.t('Compile data is empty.');
            }
            await beforeReturn();
            return;
        }
        for (const tc of bgProblem.problem.tcs) {
            tc.result!.verdict = TCVerdicts.CPD;
        }
        await this.dataRefresh();

        let hasExpandStatus = false;
        for (const tc of bgProblem.problem.tcs) {
            if (bgProblem.ac.signal.aborted) {
                if (bgProblem.ac.signal.reason === 'onlyOne') {
                    bgProblem.ac = new AbortController();
                } else {
                    tc.result!.verdict = TCVerdicts.SK;
                    continue;
                }
            }
            await Runner.run(
                bgProblem.problem,
                tc.result!,
                bgProblem.ac,
                srcLang,
                tc,
                compileData,
            );
            if (!hasExpandStatus) {
                tc.isExpand = isExpandVerdict(tc.result!.verdict);
                await this.dataRefresh();
                hasExpandStatus = tc.isExpand;
            }
        }
        await beforeReturn();
    }

    public static async stopTcs(msg: StopTcsMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        if (bgProblem.ac) {
            bgProblem.ac.abort(msg.onlyOne ? 'onlyOne' : undefined);
        } else {
            for (const tc of bgProblem.problem.tcs) {
                if (tc.result && isRunningVerdict(tc.result.verdict)) {
                    tc.result.verdict = TCVerdicts.RJ;
                }
            }
        }
        await this.dataRefresh();
        await this.saveIfIdle();
    }
    public static async chooseTcFile(msg: ChooseTcFileMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        const files = await chooseTcFile(msg.label);
        if (files.stdin) {
            bgProblem.problem.tcs[msg.idx].stdin = {
                useFile: true,
                path: files.stdin,
            };
        }
        if (files.answer) {
            bgProblem.problem.tcs[msg.idx].answer = {
                useFile: true,
                path: files.answer,
            };
        }
        await this.dataRefresh();
        await this.saveIfIdle();
    }
    public static async compareTc(msg: CompareTcMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        const tc = bgProblem.problem.tcs[msg.idx];
        if (!tc.result) {
            return;
        }
        try {
            const leftFile = await tcIo2Path(tc.answer);
            const rightFile = await tcIo2Path(tc.result.stdout);
            vscode.commands.executeCommand(
                'vscode.diff',
                vscode.Uri.file(leftFile),
                vscode.Uri.file(rightFile),
            );
        } catch (e) {
            Io.error(
                vscode.l10n.t('Failed to compare test case: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }
    public static async toggleTcFile(msg: ToggleTcFileMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        const tc = bgProblem.problem.tcs[msg.idx];
        const fileIo = tc[msg.label];
        if (fileIo.useFile) {
            const data = await tcIo2Str(fileIo);
            if (
                data.length <= Settings.problem.maxInlineDataLength ||
                (await Io.confirm(
                    vscode.l10n.t(
                        'The file size is {size} bytes, which may be large. Are you sure you want to load it inline?',
                        { size: data.length },
                    ),
                    true,
                ))
            ) {
                tc[msg.label] = { useFile: false, data };
            }
        } else {
            const ext = {
                stdin: 'in',
                answer: 'ans',
            }[msg.label];
            let tempFilePath: string | undefined = join(
                dirname(bgProblem.problem.src.path),
                `${basename(bgProblem.problem.src.path, extname(bgProblem.problem.src.path))}-${msg.idx + 1}.${ext}`,
            );
            tempFilePath = await vscode.window
                .showSaveDialog({
                    defaultUri: vscode.Uri.file(tempFilePath),
                    saveLabel: vscode.l10n.t('Select location to save'),
                })
                .then((uri) => (uri ? uri.fsPath : undefined));
            if (!tempFilePath) {
                return;
            }
            await writeFile(tempFilePath, fileIo.data);
            tc[msg.label] = { useFile: true, path: tempFilePath };
        }
        await this.dataRefresh();
        await this.saveIfIdle();
    }
    public static async delTc(msg: DelTcMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        bgProblem.problem.tcs.splice(msg.idx, 1);
        await this.dataRefresh();
        await this.saveIfIdle();
    }

    public static async chooseSrcFile(msg: ChooseSrcFileMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        const path = await chooseSrcFile(msg.fileType);
        if (!path) {
            return;
        }
        if (msg.fileType === 'checker') {
            bgProblem.problem.checker = { path };
        } else if (msg.fileType === 'interactor') {
            bgProblem.problem.interactor = { path };
        } else if (msg.fileType === 'generator') {
            if (!bgProblem.problem.bfCompare) {
                bgProblem.problem.bfCompare = { running: false, msg: '' };
            }
            bgProblem.problem.bfCompare.generator = { path };
        } else {
            if (!bgProblem.problem.bfCompare) {
                bgProblem.problem.bfCompare = { running: false, msg: '' };
            }
            bgProblem.problem.bfCompare.bruteForce = { path };
        }
        await this.dataRefresh();
        await this.saveIfIdle();
    }
    public static async removeSrcFile(msg: RemoveSrcFileMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        if (msg.fileType === 'checker') {
            bgProblem.problem.checker = undefined;
        } else if (msg.fileType === 'interactor') {
            bgProblem.problem.interactor = undefined;
        } else if (
            msg.fileType === 'generator' &&
            bgProblem.problem.bfCompare
        ) {
            bgProblem.problem.bfCompare.generator = undefined;
        } else if (
            msg.fileType === 'bruteForce' &&
            bgProblem.problem.bfCompare
        ) {
            bgProblem.problem.bfCompare.bruteForce = undefined;
        }
        await this.dataRefresh();
        await this.saveIfIdle();
    }
    public static async startBfCompare(msg: StartBfCompareMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        const srcLang = Langs.getLang(bgProblem.problem.src.path);
        if (!srcLang) {
            return;
        }
        const bfCompare = bgProblem.problem.bfCompare;
        if (!bfCompare || !bfCompare.generator || !bfCompare.bruteForce) {
            Io.warn(
                vscode.l10n.t(
                    'Please choose both generator and brute force files first.',
                ),
            );
            return;
        }
        if (bfCompare.running) {
            Io.warn(
                vscode.l10n.t('Brute Force comparison is already running.'),
            );
            return;
        }
        bgProblem.ac && bgProblem.ac.abort();
        bgProblem.ac = new AbortController();
        const beforeReturn = async () => {
            bfCompare.running = false;
            if (bgProblem.ac?.signal.aborted) {
                bfCompare.msg = vscode.l10n.t(
                    'Brute Force comparison stopped by user, {cnt} runs completed.',
                    { cnt },
                );
            }
            bgProblem.ac = null;
            await this.dataRefresh();
            await this.saveIfIdle();
        };

        bfCompare.running = true;
        bfCompare.msg = vscode.l10n.t('Compiling...');
        await this.dataRefresh();
        const compileResult = await Compiler.compileAll(
            bgProblem.problem,
            srcLang,
            msg.compile,
            bgProblem.ac,
        );
        if (compileResult.verdict !== TCVerdicts.UKE) {
            bfCompare.msg = vscode.l10n.t('Solution compilation failed.');
            await beforeReturn();
            return;
        }
        const compileData = compileResult.data;
        if (!compileData || !compileData.bfCompare) {
            bfCompare.msg = vscode.l10n.t('Compile data is empty.');
            await beforeReturn();
            return;
        }

        let cnt = 0;
        while (true) {
            cnt++;
            if (bgProblem.ac.signal.aborted) {
                bfCompare.msg = vscode.l10n.t(
                    'Brute Force comparison stopped by user.',
                );
                break;
            }

            bfCompare.msg = vscode.l10n.t('#{cnt} Running generator...', {
                cnt,
            });
            await this.dataRefresh();
            const generatorRunResult = await Runner.doRun(
                [compileData.bfCompare.generator.outputPath],
                Settings.bfCompare.generatorTimeLimit,
                { useFile: false, data: '' },
                bgProblem.ac,
                undefined,
            );
            if (generatorRunResult.verdict !== TCVerdicts.UKE) {
                if (generatorRunResult.verdict !== TCVerdicts.RJ) {
                    bfCompare.msg = vscode.l10n.t(
                        'Generator run failed: {msg}',
                        {
                            msg: generatorRunResult.msg,
                        },
                    );
                }
                break;
            }

            bfCompare.msg = vscode.l10n.t('#{cnt} Running brute force...', {
                cnt,
            });
            await this.dataRefresh();
            const bruteForceRunResult = await Runner.doRun(
                [compileData.bfCompare.bruteForce.outputPath],
                Settings.bfCompare.bruteForceTimeLimit,
                { useFile: false, data: generatorRunResult.stdout },
                bgProblem.ac,
                undefined,
            );
            if (bruteForceRunResult.verdict !== TCVerdicts.UKE) {
                if (generatorRunResult.verdict !== TCVerdicts.RJ) {
                    bfCompare.msg = vscode.l10n.t(
                        'Brute force run failed: {msg}',
                        {
                            msg: bruteForceRunResult.msg,
                        },
                    );
                }
                break;
            }

            bfCompare.msg = vscode.l10n.t('#{cnt} Running solution...', {
                cnt,
            });
            await this.dataRefresh();
            const tempTc: TC = {
                stdin: { useFile: false, data: generatorRunResult.stdout },
                answer: {
                    useFile: false,
                    data: bruteForceRunResult.stdout,
                },
                isExpand: true,
                result: {
                    verdict: TCVerdicts.CP,
                    stdout: { useFile: false, data: '' },
                    stderr: { useFile: false, data: '' },
                    memory: undefined,
                    time: 0,
                    msg: '',
                },
            } satisfies TC;
            await Runner.run(
                bgProblem.problem,
                tempTc.result!,
                bgProblem.ac,
                srcLang,
                tempTc,
                compileResult.data!,
            );
            if (tempTc.result?.verdict !== TCVerdicts.AC) {
                if (tempTc.result?.verdict !== TCVerdicts.RJ) {
                    bgProblem.problem.tcs.push(tempTc);
                    bfCompare.msg = vscode.l10n.t(
                        'Found a difference in #{cnt} run.',
                        { cnt },
                    );
                }
                break;
            }
        }
        await beforeReturn();
    }
    public static async stopBfCompare(msg: StopBfCompareMsg): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        if (
            !bgProblem.problem.bfCompare ||
            !bgProblem.problem.bfCompare.running
        ) {
            Io.warn(vscode.l10n.t('Brute Force comparison is not running.'));
            return;
        }
        bgProblem.ac && bgProblem.ac.abort();
        await this.dataRefresh();
        await this.saveIfIdle();
    }
    public static async submitToCodeforces(
        msg: SubmitToCodeforcesMsg,
    ): Promise<void> {
        const bgProblem = await this.getBgProblem(msg.activePath);
        if (!bgProblem) {
            return;
        }
        Companion.submit(bgProblem.problem);
    }
}
