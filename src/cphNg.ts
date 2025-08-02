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

import AdmZip from 'adm-zip';
import { SHA256 } from 'crypto-js';
import {
    access,
    constants,
    mkdir,
    readdir,
    readFile,
    unlink,
    writeFile,
} from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import * as vscode from 'vscode';
import { gunzipSync, gzipSync } from 'zlib';
import { Checker } from './checker';
import { Compiler } from './compiler';
import { io, Logger, setCompilationMessage } from './io';
import { Runner } from './runner';
import Settings from './settings';
import { tcIo2Path, tcIo2Str, TCVerdicts, write2TcIo } from './types.backend';
import {
    isExpandVerdict,
    isRunningVerdict,
    Problem,
    TC,
    TCIO,
    TCVerdict,
} from './types';
import Result, { assignResult } from './result';
import { renderTemplate } from './strTemplate';
import { homedir, tmpdir } from 'os';

type ProblemChangeCallback = (problem: Problem | undefined) => void;

type DoCompileResult = Result<{
    outputPath: string;
    hash: string;
}>;
type CompileResult = Result<{
    outputPath: string;
    hash: string;
    checkerOutputPath?: string;
    checkerHash?: string;
}>;

export class CphNg {
    private logger: Logger = new Logger('cphNg');
    private _problem?: Problem;
    private compiler: Compiler;
    private runner: Runner;
    private checker: Checker;
    private onProblemChange: ProblemChangeCallback[];
    private runAbortController?: AbortController;

    constructor() {
        this.logger.trace('constructor');
        this.compiler = new Compiler();
        this.runner = new Runner();
        this.checker = new Checker();
        this.onProblemChange = [];
    }

    get problem(): Problem | undefined {
        return this._problem;
    }
    set problem(problem: Problem | undefined) {
        this.runAbortController && this.runAbortController.abort();
        this._problem = problem;
        this.emitProblemChange();
    }

    public addProblemChangeListener(callback: ProblemChangeCallback) {
        this.onProblemChange.push(callback);
    }
    private emitProblemChange() {
        for (const callback of this.onProblemChange) {
            callback(this._problem);
        }
    }

    public async getBinByCpp(cppFile: string): Promise<string> {
        const dir = renderTemplate(Settings.problem.problemFilePath, [
            ['tmp', tmpdir()],
            ['home', homedir()],
            [
                'workspace',
                vscode.workspace.workspaceFolders
                    ? vscode.workspace.workspaceFolders[0].uri.fsPath
                    : '',
            ],
            ['dirname', dirname(cppFile)],
            ['basename', basename(cppFile)],
            ['extname', extname(cppFile)],
        ]);
        try {
            await access(dirname(dir), constants.F_OK);
        } catch {
            await mkdir(dirname(dir), { recursive: true });
        }
        return join(dir);
    }

    private checkProblem() {
        this.logger.trace('checkProblem');
        if (!this._problem) {
            this.logger.warn('No problem found');
            io.warn(
                vscode.l10n.t(
                    'No problem found. Please create a problem first.',
                ),
            );
            return false;
        }
        this.logger.debug('Problem exists', { problem: this._problem });
        return true;
    }
    private checkIdx(idx: number) {
        this.logger.trace('checkIdx', { idx });
        const problem = this._problem!;
        const max = problem.tcs.length - 1;
        if (idx < 0 || idx > max) {
            this.logger.warn('Test case idx out of range', { idx, max });
            io.warn(
                vscode.l10n.t('Test case index {idx} out of range 1~{max}.', {
                    idx,
                    max,
                }),
            );
            return false;
        }
        this.logger.warn('Test case idx is valid', { idx });
        return true;
    }

    private getTCHash(tc: TC) {
        const problem = this._problem!;
        return SHA256(
            `${problem.srcPath}-${
                tc.stdin.useFile ? tc.stdin.path : tc.stdin.data
            }`,
        )
            .toString()
            .substring(64 - 6);
    }

    private async doCompile(
        srcPath: string,
        srcHash?: string,
    ): Promise<DoCompileResult> {
        this.logger.trace('doCompile', { srcPath, srcHash });
        const hash = SHA256((await readFile(srcPath)).toString()).toString();
        const outputPath = await this.compiler.getExecutablePath(srcPath);
        const hasOutputFile = async () =>
            await access(outputPath, constants.X_OK)
                .then(() => true)
                .catch(() => false);

        if (srcHash !== hash || !(await hasOutputFile())) {
            this.logger.info('Source hash mismatch or output file missing', {
                srcHash,
                hash,
                outputPath,
            });
            const compileResult = await this.compiler.compile(
                srcPath,
                outputPath,
                this.runAbortController!,
            );
            if (!(await hasOutputFile())) {
                this.logger.error('Compilation failed, output file not found', {
                    srcPath,
                    outputPath,
                });
                return {
                    verdict: TCVerdicts.CE,
                    msg: compileResult,
                };
            }
        }
        this.logger.debug('Compilation successful', { srcPath, outputPath });
        return {
            verdict: TCVerdicts.UKE,
            msg: '',
            data: {
                outputPath,
                hash,
            },
        };
    }

    private async compile(): Promise<CompileResult> {
        try {
            const problem = this._problem!;
            const editor = vscode.window.visibleTextEditors.find(
                (editor) => editor.document.fileName === problem.srcPath,
            );
            if (editor) {
                await editor.document.save();
            }
            const compileResult = await this.doCompile(
                problem.srcPath,
                problem.srcHash,
            );
            if (compileResult.verdict !== TCVerdicts.UKE) {
                return compileResult;
            } else if (!problem.isSpecialJudge) {
                problem.srcHash = compileResult.data!.hash;
                return compileResult;
            }

            try {
                await access(problem.checkerPath!, constants.X_OK);
                return {
                    verdict: TCVerdicts.UKE,
                    msg: '',
                    data: {
                        outputPath: compileResult.data!.outputPath,
                        hash: compileResult.data!.hash,
                        checkerOutputPath: problem.checkerPath,
                    },
                };
            } catch {}

            const checkerCompileResult = await this.doCompile(
                problem.checkerPath!,
                problem.checkerHash,
            );
            if (checkerCompileResult.verdict !== TCVerdicts.UKE) {
                return checkerCompileResult;
            }
            problem.checkerHash = checkerCompileResult.data!.hash;
            return {
                verdict: TCVerdicts.UKE,
                msg: '',
                data: {
                    outputPath: compileResult.data!.outputPath,
                    hash: compileResult.data!.hash,
                    checkerOutputPath: checkerCompileResult.data!.outputPath,
                    checkerHash: checkerCompileResult.data!.hash,
                },
            };
        } catch (e) {
            return {
                verdict: TCVerdicts.SE,
                msg: (e as Error).message,
            };
        }
    }
    private async run(outputPath: string, tc: TC, checkerOutputPath?: string) {
        const problem = this._problem!;
        const result = tc.result!;
        const abortController = this.runAbortController!;
        try {
            result.verdict = TCVerdicts.JG;
            this.emitProblemChange();

            const runResult = await this.runner.runExecutable(
                outputPath,
                problem.timeLimit,
                tc,
                abortController,
            );
            const runData = runResult.data!;
            result.time = runData.time;
            result.verdict = TCVerdicts.JGD;
            if (tc.answer.useFile) {
                result.stdout = {
                    useFile: true,
                    path: join(
                        Settings.cache.directory,
                        'out',
                        `${this.getTCHash(tc)}.out`,
                    ),
                };
            } else {
                result.stdout.useFile = false;
            }
            result.stdout = await write2TcIo(result.stdout, runData.stdout);

            result.stderr = { useFile: false, data: runData.stderr };
            this.emitProblemChange();

            if (assignResult(result, runResult)) {
            } else if (result.time && result.time > problem.timeLimit) {
                result.verdict = TCVerdicts.TLE;
            } else {
                result.verdict = TCVerdicts.CMP;
                this.emitProblemChange();
                assignResult(
                    result,
                    checkerOutputPath
                        ? await this.checker.runChecker(
                              checkerOutputPath!,
                              tc,
                              abortController,
                          )
                        : await this.compareOutputs(
                              runData.stdout,
                              await tcIo2Str(tc.answer),
                              runData.stderr,
                          ),
                );
            }
            this.emitProblemChange();
        } catch (e) {
            assignResult(result, {
                verdict: TCVerdicts.SE,
                msg: (e as Error).message,
            });
            this.emitProblemChange();
        }
    }
    private async compareOutputs(
        stdout: string,
        answer: string,
        stderr: string,
    ): Promise<Result<{}>> {
        this.logger.trace('compareOutputs', { stdout, answer, stderr });
        if (!Settings.comparing.ignoreError && stderr) {
            return { verdict: TCVerdicts.RE, msg: '' };
        }
        if (
            Settings.comparing.oleSize &&
            stdout.length >= answer.length * Settings.comparing.oleSize
        ) {
            return { verdict: TCVerdicts.OLE, msg: '' };
        }
        const compressOutput = stdout.replace(/\r|\n|\t|\s/g, '');
        const compressAnswer = answer.replace(/\r|\n|\t|\s/g, '');
        this.logger.trace('Compressed data', {
            compressOutput,
            compressAnswer,
        });
        if (compressOutput !== compressAnswer) {
            return { verdict: TCVerdicts.WA, msg: '' };
        }
        const fixedOutput = stdout
            .trimEnd()
            .split('\n')
            .map((line) => line.trimEnd())
            .join('\n');
        const fixedAnswer = answer
            .trimEnd()
            .split('\n')
            .map((line) => line.trimEnd())
            .join('\n');
        if (fixedOutput !== fixedAnswer && !Settings.comparing.regardPEAsAC) {
            return { verdict: TCVerdicts.PE, msg: '' };
        }
        return { verdict: TCVerdicts.AC, msg: '' };
    }

    public async createProblem(): Promise<void> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                io.warn(
                    vscode.l10n.t(
                        'No active editor found. Please open a file to create a problem.',
                    ),
                );
                return;
            }
            const filePath = activeEditor.document.fileName;
            if (this._problem && this._problem.srcPath === filePath) {
                io.warn(
                    vscode.l10n.t(
                        'Problem already exists for this file: {file}.',
                        { file: basename(filePath) },
                    ),
                );
                return;
            }
            this.problem = {
                name: basename(filePath, extname(filePath)),
                srcPath: filePath,
                tcs: [],
                timeLimit: Settings.problem.defaultTimeLimit,
            };
            this.saveProblem();
        } catch (e) {
            io.error(
                vscode.l10n.t('Failed to create problem: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }
    public async getProblem() {
        this.emitProblemChange();
    }
    public async loadProblem(binFile: string): Promise<void> {
        this.logger.trace('loadProblem', { binFile });
        try {
            const data = await readFile(binFile);
            this.problem = JSON.parse(
                gunzipSync(data).toString('utf8'),
            ) as Problem;
            this.logger.info(
                'Problem loaded',
                { problem: this._problem },
                'from',
                binFile,
            );
        } catch (e) {
            io.warn(
                vscode.l10n.t('Parse problem file {file} failed: {msg}.', {
                    file: basename(binFile),
                    msg: (e as Error).message,
                }),
            );
            this.problem = undefined;
        }
    }
    public async editProblemDetails(
        title: string,
        url: string,
        timeLimit: number,
        isSpecialJudge?: boolean,
    ): Promise<void> {
        if (!this.checkProblem()) {
            return;
        }
        const problem = this._problem!;
        problem.name = title;
        problem.url = url;
        problem.timeLimit = timeLimit;
        problem.isSpecialJudge = isSpecialJudge;
        this.saveProblem();
    }
    public async saveProblem(): Promise<void> {
        this.logger.trace('saveProblem');
        try {
            if (!this.checkProblem()) {
                return;
            }
            const problem = this._problem!;
            const binPath = await this.getBinByCpp(problem.srcPath);
            this.logger.info('Saving problem', { problem }, 'to', binPath);
            this.emitProblemChange();
            return writeFile(
                binPath,
                gzipSync(Buffer.from(JSON.stringify(problem))),
            );
        } catch (e) {
            io.error(
                vscode.l10n.t('Failed to save problem: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }
    public async delProblem(): Promise<void> {
        this.logger.trace('delProblem');
        if (!this.checkProblem()) {
            return;
        }
        const problem = this._problem!;
        const binPath = await this.getBinByCpp(problem.srcPath);

        try {
            await access(binPath, constants.F_OK);
            await unlink(binPath);
        } catch {
            io.warn(
                vscode.l10n.t('Problem file {file} not found.', {
                    file: basename(binPath),
                }),
            );
        } finally {
            this.problem = undefined;
        }
    }
    public async addTc(): Promise<void> {
        this.logger.trace('addTestCase');
        if (!this._problem) {
            return;
        }
        this._problem.tcs.push({
            stdin: { useFile: false, data: '' },
            answer: { useFile: false, data: '' },
            isExpand: false,
        });
        this.saveProblem();
    }
    public async loadTcs(): Promise<void> {
        this.logger.trace('loadTestCases');
        try {
            if (!this.checkProblem()) {
                return;
            }
            const problem = this._problem!;

            this.logger.debug('Showing test case loading options');
            const option = (
                await vscode.window.showQuickPick(
                    [
                        {
                            label: vscode.l10n.t('Load from a zip file'),
                            value: 'zip',
                        },
                        {
                            label: vscode.l10n.t('Load from a folder'),
                            value: 'folder',
                        },
                    ],
                    { canPickMany: false },
                )
            )?.value;
            if (!option) {
                this.logger.debug('User cancelled test case loading');
                return;
            }
            this.logger.info('User selected loading option:', option);

            let folderPath = '';
            if (option === 'zip') {
                this.logger.debug('Loading test cases from zip file');
                const zipPath = await vscode.window.showOpenDialog({
                    title: vscode.l10n.t(
                        'Choose a zip file containing test cases',
                    ),
                    filters: { 'Zip files': ['zip'], 'All files': ['*'] },
                });
                if (!zipPath) {
                    this.logger.debug('User cancelled zip file selection');
                    return;
                }
                this.logger.info('Processing zip file:', zipPath[0].fsPath);
                const zipFile = new AdmZip(zipPath[0].fsPath);
                const entries = zipFile.getEntries();
                if (!entries.length) {
                    this.logger.warn('Empty zip file');
                    io.warn(
                        vscode.l10n.t('No test cases found in the zip file.'),
                    );
                    return;
                }
                folderPath = zipPath[0].fsPath.replace(/\.zip$/, '');
                this.logger.debug('Extracting zip to:', folderPath);
                await mkdir(folderPath, { recursive: true });
                zipFile.extractAllTo(folderPath, true);
            } else if (option === 'folder') {
                this.logger.debug('Loading test cases from folder');
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: vscode.l10n.t(
                        'Choose a folder containing test cases',
                    ),
                });
                if (!folderUri) {
                    this.logger.debug('User cancelled folder selection');
                    return;
                }
                folderPath = folderUri[0].fsPath;
                this.logger.info('Using folder:', folderPath);
            } else {
                const errorMsg = vscode.l10n.t('Unknown option: {option}.', {
                    option,
                });
                this.logger.error(errorMsg);
                throw new Error(errorMsg);
            }

            async function getAllFiles(dirPath: string): Promise<string[]> {
                const entries = await readdir(dirPath, { withFileTypes: true });
                const files = await Promise.all(
                    entries.map((entry) => {
                        const fullPath = join(dirPath, entry.name);
                        return entry.isDirectory()
                            ? getAllFiles(fullPath)
                            : fullPath;
                    }),
                );
                return files.flat();
            }

            const allFiles = await getAllFiles(folderPath);
            this.logger.info(`Found ${allFiles.length} files in total`);
            const tcs: TC[] = [];
            for (const filePath of allFiles) {
                const fileName = basename(filePath);
                const ext = extname(fileName).toLowerCase();
                if (ext === '.in') {
                    this.logger.debug('Found input file:', fileName);
                    tcs.push({
                        stdin: { useFile: true, path: filePath },
                        answer: { useFile: false, data: '' },
                        isExpand: false,
                    });
                }
            }
            for (const filePath of allFiles) {
                const fileName = basename(filePath);
                const ext = extname(fileName).toLowerCase();
                if (ext === '.ans' || ext === '.out') {
                    this.logger.debug('Found answer file:', fileName);
                    const inputFile = join(
                        dirname(filePath),
                        fileName.replace(ext, '.in'),
                    );
                    const existingTestCase = tcs.find(
                        (tc) => tc.stdin.useFile && tc.stdin.path === inputFile,
                    );
                    if (existingTestCase) {
                        existingTestCase.answer = {
                            useFile: true,
                            path: filePath,
                        };
                        this.logger.debug('Matched answer with input:', {
                            input: inputFile,
                            answer: filePath,
                        });
                    } else {
                        this.logger.warn(
                            'Answer file without matching input:',
                            fileName,
                        );
                        tcs.push({
                            stdin: { useFile: false, data: '' },
                            answer: { useFile: true, path: filePath },
                            isExpand: false,
                        });
                    }
                }
            }
            this.logger.info(`Created ${tcs.length} test cases`);
            const chosenIdx = await vscode.window.showQuickPick(
                tcs.map((tc, idx) => ({
                    label: `${basename(
                        tc.stdin.useFile
                            ? tc.stdin.path
                            : tc.answer.useFile
                              ? tc.answer.path
                              : 'unknown',
                    )}`,
                    description: vscode.l10n.t(
                        'Input {input}, Answer {answer}',
                        {
                            input: tc.stdin.useFile
                                ? tc.stdin.path.replace(folderPath + '/', '')
                                : vscode.l10n.t('not found'),
                            answer: tc.answer.useFile
                                ? tc.answer.path.replace(folderPath + '/', '')
                                : vscode.l10n.t('not found'),
                        },
                    ),
                    value: idx,
                    picked: true,
                })),
                {
                    canPickMany: true,
                    title: vscode.l10n.t('Select test cases to add'),
                },
            );
            if (!chosenIdx) {
                this.logger.debug('User cancelled test case selection');
                return;
            }
            const selectedTCs = chosenIdx.map((idx) => tcs[idx.value]);
            this.logger.info(`User selected ${selectedTCs.length} test cases`);
            selectedTCs.forEach((tc) => {
                problem.tcs.push(tc);
            });
            this.saveProblem();
        } catch (e) {
            io.error(
                vscode.l10n.t('Failed to load test cases: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }
    public async updateTc(idx: number, tc: TC): Promise<void> {
        this.logger.trace('updateTestCase', { idx, tc });
        if (!this.checkProblem() || !this.checkIdx(idx)) {
            return;
        }
        const problem = this._problem!;
        problem.tcs[idx] = tc;
        this.saveProblem();
    }
    public async runTc(idx: number): Promise<void> {
        this.logger.trace('runTestCase', { idx });
        if (!this.checkProblem() || !this.checkIdx(idx)) {
            return;
        }
        const problem = this._problem!;
        this.runAbortController = new AbortController();

        const tc = problem.tcs[idx];
        tc.result = {
            verdict: TCVerdicts.CP,
            stdout: { useFile: false, data: '' },
            stderr: { useFile: false, data: '' },
            time: 0,
            msg: '',
        };
        tc.isExpand = false;
        this.emitProblemChange();
        const result = tc.result;

        const compileResult = await this.compile();
        if (compileResult.verdict !== TCVerdicts.UKE) {
            setCompilationMessage(
                compileResult.msg || vscode.l10n.t('Compilation failed'),
            );
            result.verdict = TCVerdicts.CE;
            tc.isExpand = true;
            this.saveProblem();
            this.runAbortController = undefined;
            return;
        }
        const compileData = compileResult.data!;
        problem.srcHash = compileData.hash;
        problem.checkerHash = compileData.checkerHash;

        await this.run(
            compileData.outputPath,
            tc,
            compileData.checkerOutputPath,
        );
        tc.isExpand = isExpandVerdict(result.verdict);
        this.saveProblem();
        this.runAbortController = undefined;
    }
    public async runTcs(): Promise<void> {
        if (!this.checkProblem()) {
            return;
        }
        const problem = this._problem!;
        if (!problem.tcs.length) {
            return;
        }
        if (this.runAbortController) {
            io.warn(
                vscode.l10n.t(
                    'Test cases already running. Please stop them first.',
                ),
            );
            return;
        }
        this.runAbortController = new AbortController();

        for (const tc of problem.tcs) {
            tc.result = {
                verdict: TCVerdicts.CP,
                stdout: { useFile: false, data: '' },
                stderr: { useFile: false, data: '' },
                time: 0,
                msg: '',
            };
            tc.isExpand = false;
        }
        this.emitProblemChange();

        const compileResult = await this.compile();
        if (compileResult.verdict !== TCVerdicts.UKE) {
            setCompilationMessage(
                compileResult.msg || vscode.l10n.t('Compilation failed'),
            );
            for (const tc of problem.tcs) {
                tc.result!.verdict = TCVerdicts.CE;
            }
            this.saveProblem();
            this.runAbortController = undefined;
            return;
        }
        const compileData = compileResult.data!;
        problem.srcHash = compileData.hash;
        problem.checkerHash = compileData.checkerHash;
        for (const tc of problem.tcs) {
            tc.result!.verdict = TCVerdicts.CPD;
        }
        this.emitProblemChange();

        let hasExpandStatus = false;
        for (const tc of problem.tcs) {
            if (this.runAbortController.signal.aborted) {
                tc.result!.verdict = TCVerdicts.SK;
            } else {
                await this.run(
                    compileData.outputPath,
                    tc,
                    compileData.checkerOutputPath,
                );
                if (!hasExpandStatus) {
                    tc.isExpand = isExpandVerdict(tc.result!.verdict);
                    this.emitProblemChange();
                    hasExpandStatus = tc.isExpand;
                }
            }
        }
        this.saveProblem();
        this.runAbortController = undefined;
    }
    public async stopTcs(): Promise<void> {
        if (!this.checkProblem()) {
            return;
        }
        const problem = this._problem!;
        if (this.runAbortController) {
            this.runAbortController.abort();
        } else {
            for (const tc of problem.tcs) {
                if (isRunningVerdict(tc.result!.verdict)) {
                    tc.result!.verdict = TCVerdicts.RJ;
                }
            }
            this.saveProblem();
        }
    }
    public async chooseTcFile(
        idx: number,
        option: 'stdin' | 'answer',
    ): Promise<void> {
        try {
            if (!this.checkProblem() || !this.checkIdx(idx)) {
                return;
            }
            const problem = this._problem!;
            const tc = problem.tcs[idx];
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                title: vscode.l10n.t('Choose {type} file', {
                    type:
                        option === 'stdin'
                            ? vscode.l10n.t('stdin')
                            : vscode.l10n.t('answer'),
                }),
                filters: {
                    [vscode.l10n.t('Text files')]: ['in', 'ans', 'out'],
                    [vscode.l10n.t('All files')]: ['*'],
                },
            });
            if (fileUri && fileUri[0]) {
                const path = fileUri[0].fsPath;
                if (
                    (option === 'stdin' || option === 'answer') &&
                    Settings.problem.foundMatchTestCaseBehavior !== 'never'
                ) {
                    const isInput = option === 'stdin';
                    const mainExt = extname(path);
                    const pairExt = isInput ? ['.ans', '.out'] : ['.in'];
                    tc[isInput ? 'stdin' : 'answer'] = {
                        useFile: true,
                        path,
                    };
                    for (const ext of pairExt) {
                        const pairPath = path.replace(mainExt, ext);
                        if (
                            await access(pairPath, constants.F_OK)
                                .then(() => true)
                                .catch(() => false)
                        ) {
                            if (
                                Settings.problem.foundMatchTestCaseBehavior ===
                                    'always' ||
                                (await io.confirm(
                                    vscode.l10n.t(
                                        'Found matching {found} file: {file}. Do you want to use it?',
                                        {
                                            found: vscode.l10n.t(
                                                isInput ? 'answer' : 'stdin',
                                            ),
                                            file: basename(pairPath),
                                        },
                                    ),
                                    true,
                                ))
                            ) {
                                tc[isInput ? 'answer' : 'stdin'] = {
                                    useFile: true,
                                    path: pairPath,
                                };
                                break;
                            }
                        }
                    }
                } else {
                    throw new Error(
                        vscode.l10n.t('Unknown option: {option}.', { option }),
                    );
                }
                this.saveProblem();
            }
        } catch (e) {
            io.error(
                vscode.l10n.t('Failed to choose test case file: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }
    public async compareTc(idx: number): Promise<void> {
        try {
            if (!this.checkProblem() || !this.checkIdx(idx)) {
                return;
            }
            const problem = this._problem!;
            const tc = problem.tcs[idx];
            const leftFile = await tcIo2Path(tc.answer);
            const rightFile = await tcIo2Path(tc.result!.stdout);
            vscode.commands.executeCommand(
                'vscode.diff',
                vscode.Uri.file(leftFile),
                vscode.Uri.file(rightFile),
            );
        } catch (e) {
            io.error(
                vscode.l10n.t('Failed to compare test case: {msg}', {
                    msg: (e as Error).message,
                }),
            );
        }
    }
    public async delTc(idx: number): Promise<void> {
        if (!this.checkProblem() || !this.checkIdx(idx)) {
            return;
        }
        const problem = this._problem!;
        problem.tcs.splice(idx, 1);
        this.saveProblem();
    }
    public async chooseCheckerFile(): Promise<void> {
        if (!this.checkProblem()) {
            return;
        }
        const problem = this._problem!;
        const checkerFileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                [vscode.l10n.t('Available files')]: ['exe', '', 'c', 'cpp'],
                [vscode.l10n.t('All files')]: ['*'],
            },
            openLabel: vscode.l10n.t('Select Checker File'),
        });
        if (!checkerFileUri) {
            return;
        }
        problem.checkerPath = checkerFileUri[0].fsPath;
    }
}
