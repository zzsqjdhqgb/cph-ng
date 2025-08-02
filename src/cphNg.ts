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
import { TestCaseStatuses } from './testCaseStatuses';
import {
    isExpandStatus,
    isRunningStatus,
    Problem,
    TestCase,
    TestCaseStatus,
} from './types';
import Result from './result';
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
    private checkIndex(index: number) {
        this.logger.trace('checkIndex', { index });
        const problem = this._problem!;
        const max = problem.testCases.length - 1;
        if (index < 0 || index > max) {
            this.logger.warn('Test case index out of range', { index, max });
            io.warn(
                vscode.l10n.t('Test case index {index} out of range 1~{max}.', {
                    index,
                    max,
                }),
            );
            return false;
        }
        this.logger.warn('Test case index is valid', { index });
        return true;
    }

    private getTestCaseHash(testCase: TestCase) {
        const problem = this._problem!;
        return SHA256(`${problem.srcPath}-${testCase.input}`)
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
                    status: TestCaseStatuses.CE,
                    message: compileResult,
                };
            }
        }
        this.logger.debug('Compilation successful', { srcPath, outputPath });
        return {
            status: TestCaseStatuses.UKE,
            message: '',
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
            if (compileResult.status !== TestCaseStatuses.UKE) {
                return compileResult;
            } else if (!problem.isSpecialJudge) {
                problem.srcHash = compileResult.data!.hash;
                return compileResult;
            }

            try {
                await access(problem.checkerPath!, constants.X_OK);
                return {
                    status: TestCaseStatuses.UKE,
                    message: '',
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
            if (checkerCompileResult.status !== TestCaseStatuses.UKE) {
                return checkerCompileResult;
            }
            problem.checkerHash = checkerCompileResult.data!.hash;
            return {
                status: TestCaseStatuses.UKE,
                message: '',
                data: {
                    outputPath: compileResult.data!.outputPath,
                    hash: compileResult.data!.hash,
                    checkerOutputPath: checkerCompileResult.data!.outputPath,
                    checkerHash: checkerCompileResult.data!.hash,
                },
            };
        } catch (error: unknown) {
            const err = error as Error;
            io.error(
                vscode.l10n.t('Compilation process failed: {error}', {
                    error: err.message,
                }),
            );
            return {
                status: TestCaseStatuses.SE,
                message: err.message,
            };
        }
    }
    private async run(
        outputPath: string,
        testCase: TestCase,
        checkerOutputPath?: string,
    ) {
        try {
            const problem = this._problem!;
            const abortController = this.runAbortController!;

            testCase.status = TestCaseStatuses.JG;
            this.emitProblemChange();

            const runResult = await this.runner.runExecutable(
                outputPath,
                problem.timeLimit,
                testCase,
                abortController,
            );
            const runData = runResult.data!;
            testCase.time = runData.time;
            testCase.status = TestCaseStatuses.JGD;
            testCase.outputFile = testCase.answerFile;
            if (testCase.outputFile) {
                testCase.output = join(
                    Settings.cache.directory,
                    'out',
                    `${this.getTestCaseHash(testCase)}.out`,
                );
                await writeFile(testCase.output, runData.output);
            } else {
                testCase.output = runData.output;
            }
            testCase.error = runData.error;
            this.emitProblemChange();

            if (runResult.status !== TestCaseStatuses.UKE) {
                testCase.status = runResult.status;
                testCase.message = runResult.message;
            } else if (testCase.time && testCase.time > problem.timeLimit) {
                testCase.status = TestCaseStatuses.TLE;
            } else if (checkerOutputPath) {
                testCase.status = TestCaseStatuses.CMP;
                this.emitProblemChange();
                const checkerResult = await this.checker.runChecker(
                    checkerOutputPath!,
                    testCase,
                    abortController,
                );
                testCase.status = checkerResult.status;
                testCase.message = checkerResult.message;
            } else {
                testCase.status = TestCaseStatuses.CMP;
                this.emitProblemChange();
                const compareResult = await this.compareOutputs(
                    runData.output,
                    testCase.answerFile
                        ? await readFile(testCase.answer, 'utf8')
                        : testCase.answer,
                    runData.error,
                );
                testCase.status = compareResult.status;
                testCase.message = compareResult.message;
            }
            this.emitProblemChange();
        } catch (error: unknown) {
            const err = error as Error;
            io.error(
                vscode.l10n.t('Test case execution failed: {error}', {
                    error: err.message,
                }),
            );
            testCase.status = TestCaseStatuses.SE;
            testCase.error = err.message;
            this.emitProblemChange();
        }
    }
    private async compareOutputs(
        output: string,
        answer: string,
        error: string,
    ): Promise<Result<{}>> {
        if (!Settings.comparing.ignoreError && error) {
            return { status: TestCaseStatuses.RE };
        }
        if (
            Settings.comparing.oleSize &&
            output.length >= answer.length * Settings.comparing.oleSize
        ) {
            return { status: TestCaseStatuses.OLE };
        }
        const compressOutput = output.replace(/\r|\n|\t|\s/g, '');
        const compressAnswer = answer.replace(/\r|\n|\t|\s/g, '');
        if (compressOutput !== compressAnswer) {
            return { status: TestCaseStatuses.WA };
        }
        const fixedOutput = output
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
            return { status: TestCaseStatuses.PE };
        }
        return { status: TestCaseStatuses.AC };
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
            this._problem = {
                name: basename(filePath, extname(filePath)),
                srcPath: filePath,
                testCases: [],
                timeLimit: Settings.problem.defaultTimeLimit,
            };
            this.saveProblem();
        } catch (error: unknown) {
            const err = error as Error;
            io.error(
                vscode.l10n.t('Failed to create problem: {error}', {
                    error: err.message,
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
            this._problem = JSON.parse(
                gunzipSync(data).toString('utf8'),
            ) as Problem;
            this.logger.info(
                'Problem loaded',
                { problem: this._problem },
                'from',
                binFile,
            );
            this.emitProblemChange();
        } catch (e: unknown) {
            const error = e as Error;
            io.warn(
                vscode.l10n.t('Parse problem file {file} failed: {error}.', {
                    file: basename(binFile),
                    error: error.message,
                }),
            );
            this._problem = undefined;
            this.emitProblemChange();
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
        } catch (error: unknown) {
            const err = error as Error;
            io.error(
                vscode.l10n.t('Failed to save problem: {error}', {
                    error: err.message,
                }),
            );
        }
    }
    public async deleteProblem(): Promise<void> {
        this.logger.trace('deleteProblem');
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
            this._problem = undefined;
            this.emitProblemChange();
        }
    }
    public async addTestCase(): Promise<void> {
        this.logger.trace('addTestCase');
        if (!this._problem) {
            return;
        }
        this._problem.testCases.push({
            inputFile: false,
            input: '',
            answerFile: false,
            answer: '',
            isExpand: false,
        });
        this.saveProblem();
    }
    public async loadTestCases(): Promise<void> {
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
            const testCases: TestCase[] = [];
            for (const filePath of allFiles) {
                const fileName = basename(filePath);
                const ext = extname(fileName).toLowerCase();
                if (ext === '.in') {
                    this.logger.debug('Found input file:', fileName);
                    testCases.push({
                        inputFile: true,
                        input: filePath,
                        answerFile: false,
                        answer: '',
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
                    const existingTestCase = testCases.find(
                        (tc) => tc.input === inputFile,
                    );
                    if (existingTestCase) {
                        existingTestCase.answerFile = true;
                        existingTestCase.answer = filePath;
                        this.logger.debug('Matched answer with input:', {
                            input: inputFile,
                            answer: filePath,
                        });
                    } else {
                        this.logger.warn(
                            'Answer file without matching input:',
                            fileName,
                        );
                        testCases.push({
                            inputFile: false,
                            input: '',
                            answerFile: true,
                            answer: filePath,
                            isExpand: false,
                        });
                    }
                }
            }
            this.logger.info(`Created ${testCases.length} test cases`);
            const chosenIndexes = await vscode.window.showQuickPick(
                testCases.map((tc, index) => ({
                    label: `${basename(tc.input || tc.answer)}`,
                    description: vscode.l10n.t(
                        'Input {input}, Answer {answer}',
                        {
                            input: tc.inputFile
                                ? tc.input.replace(folderPath + '/', '')
                                : vscode.l10n.t('not found'),
                            answer: tc.answerFile
                                ? tc.answer.replace(folderPath + '/', '')
                                : vscode.l10n.t('not found'),
                        },
                    ),
                    value: index,
                    picked: true,
                })),
                {
                    canPickMany: true,
                    title: vscode.l10n.t('Select test cases to add'),
                },
            );
            if (!chosenIndexes) {
                this.logger.debug('User cancelled test case selection');
                return;
            }
            const selectedTestCases = chosenIndexes.map(
                (index) => testCases[index.value],
            );
            this.logger.info(
                `User selected ${selectedTestCases.length} test cases`,
            );
            selectedTestCases.forEach((testCase) => {
                problem.testCases.push(testCase);
            });
            this.saveProblem();
        } catch (error: unknown) {
            const err = error as Error;
            io.error(
                vscode.l10n.t('Failed to load test cases: {error}', {
                    error: err.message,
                }),
            );
        }
    }
    public async updateTestCase(
        index: number,
        testCase: TestCase,
    ): Promise<void> {
        this.logger.trace('updateTestCase', { index, testCase });
        if (!this.checkProblem() || !this.checkIndex(index)) {
            return;
        }
        const problem = this._problem!;
        problem.testCases[index] = testCase;
        this.saveProblem();
    }
    public async runTestCase(index: number): Promise<void> {
        this.logger.trace('runTestCase', { index });
        if (!this.checkProblem() || !this.checkIndex(index)) {
            return;
        }
        const problem = this._problem!;
        this.runAbortController = new AbortController();

        const testCase = problem.testCases[index];
        testCase.status = TestCaseStatuses.CP;
        testCase.output = testCase.error = undefined;
        testCase.time = undefined;
        testCase.outputFile = testCase.isExpand = false;
        this.emitProblemChange();

        const compileResult = await this.compile();
        if (compileResult.status !== TestCaseStatuses.UKE) {
            setCompilationMessage(
                compileResult.message || vscode.l10n.t('Compilation failed'),
            );
            testCase.status = TestCaseStatuses.CE;
            testCase.isExpand = true;
            this.saveProblem();
            this.runAbortController = undefined;
            return;
        }
        const compileData = compileResult.data!;
        problem.srcHash = compileData.hash;
        problem.checkerHash = compileData.checkerHash;

        await this.run(
            compileData.outputPath,
            testCase,
            compileData.checkerOutputPath,
        );
        testCase.isExpand = isExpandStatus(testCase.status);
        this.saveProblem();
        this.runAbortController = undefined;
    }
    public async runTestCases(): Promise<void> {
        if (!this.checkProblem()) {
            return;
        }
        const problem = this._problem!;
        if (!problem.testCases.length) {
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

        for (const testCase of problem.testCases) {
            testCase.status = TestCaseStatuses.CP;
            testCase.output = testCase.error = undefined;
            testCase.time = undefined;
            testCase.outputFile = testCase.isExpand = false;
        }
        this.emitProblemChange();

        const compileResult = await this.compile();
        if (compileResult.status !== TestCaseStatuses.UKE) {
            setCompilationMessage(
                compileResult.message || vscode.l10n.t('Compilation failed'),
            );
            for (const testCaseIndex in problem.testCases) {
                const testCase = problem.testCases[testCaseIndex];
                testCase.status = TestCaseStatuses.CE;
            }
            this.saveProblem();
            this.runAbortController = undefined;
            return;
        }
        const compileData = compileResult.data!;
        problem.srcHash = compileData.hash;
        problem.checkerHash = compileData.checkerHash;
        for (const testCase of problem.testCases) {
            testCase.status = TestCaseStatuses.CPD;
        }
        this.emitProblemChange();

        let hasExpandStatus = false;
        for (const testCase of problem.testCases) {
            if (this.runAbortController.signal.aborted) {
                testCase.status = TestCaseStatuses.SK;
            } else {
                await this.run(
                    compileData.outputPath,
                    testCase,
                    compileData.checkerOutputPath,
                );
                if (!hasExpandStatus) {
                    testCase.isExpand = isExpandStatus(testCase.status);
                    this.emitProblemChange();
                    hasExpandStatus = testCase.isExpand;
                }
            }
        }
        this.saveProblem();
        this.runAbortController = undefined;
    }
    public async stopTestCases(): Promise<void> {
        if (!this.checkProblem()) {
            return;
        }
        const problem = this._problem!;
        if (this.runAbortController) {
            this.runAbortController.abort();
        } else {
            for (const testCase of problem.testCases) {
                if (isRunningStatus(testCase.status)) {
                    testCase.status = TestCaseStatuses.RJ;
                }
            }
            this.saveProblem();
        }
    }
    public async chooseTestCaseFile(
        index: number,
        option: 'input' | 'answer',
    ): Promise<void> {
        try {
            if (!this.checkProblem() || !this.checkIndex(index)) {
                return;
            }
            const problem = this._problem!;
            const testCase = problem.testCases[index];
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                title: vscode.l10n.t('Choose {type} file', {
                    type:
                        option === 'input'
                            ? vscode.l10n.t('input')
                            : vscode.l10n.t('answer'),
                }),
                filters: {
                    [vscode.l10n.t('Text files')]: ['in', 'ans', 'out'],
                    [vscode.l10n.t('All files')]: ['*'],
                },
            });
            if (fileUri && fileUri[0]) {
                const filePath = fileUri[0].fsPath;
                if (
                    (option === 'input' || option === 'answer') &&
                    Settings.problem.foundMatchTestCaseBehavior !== 'never'
                ) {
                    const isInput = option === 'input';
                    const mainExt = extname(filePath);
                    const pairExt = isInput ? ['.ans', '.out'] : ['.in'];
                    testCase[isInput ? 'input' : 'answer'] = filePath;
                    testCase[isInput ? 'inputFile' : 'answerFile'] = true;
                    for (const ext of pairExt) {
                        const pairFile = filePath.replace(mainExt, ext);
                        if (
                            await access(pairFile, constants.F_OK)
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
                                                `cphNg.${
                                                    isInput ? 'answer' : 'input'
                                                }`,
                                            ),
                                            file: basename(pairFile),
                                        },
                                    ),
                                    true,
                                ))
                            ) {
                                testCase[isInput ? 'answer' : 'input'] =
                                    pairFile;
                                testCase[isInput ? 'answerFile' : 'inputFile'] =
                                    true;
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
        } catch (error: unknown) {
            const err = error as Error;
            io.error(
                vscode.l10n.t('Failed to choose test case file: {error}', {
                    error: err.message,
                }),
            );
        }
    }
    public async compareTestCase(index: number): Promise<void> {
        try {
            if (!this.checkProblem() || !this.checkIndex(index)) {
                return;
            }
            const problem = this._problem!;
            const testCase = problem.testCases[index];
            if (testCase.output === undefined) {
                return;
            }
            const leftFile = testCase.answerFile
                ? testCase.answer
                : join(
                      Settings.cache.directory,
                      'diff',
                      `${this.getTestCaseHash(testCase)}.ans`,
                  );
            const rightFile = testCase.outputFile
                ? testCase.output
                : join(
                      Settings.cache.directory,
                      'diff',
                      `${this.getTestCaseHash(testCase)}.out`,
                  );
            if (!testCase.answerFile) {
                await writeFile(leftFile, testCase.answer);
            }
            if (!testCase.outputFile) {
                await writeFile(rightFile, testCase.output);
            }
            vscode.commands.executeCommand(
                'vscode.diff',
                vscode.Uri.file(leftFile),
                vscode.Uri.file(rightFile),
            );
        } catch (error: unknown) {
            const err = error as Error;
            io.error(
                vscode.l10n.t('Failed to compare test case: {error}', {
                    error: err.message,
                }),
            );
        }
    }
    public async deleteTestCase(index: number): Promise<void> {
        if (!this.checkProblem() || !this.checkIndex(index)) {
            return;
        }
        const problem = this._problem!;
        problem.testCases.splice(index, 1);
        this.saveProblem();
    }
    public async chooseCheckerFile(): Promise<void> {
        if (!this.checkProblem()) {
            return;
        }
        const problem = this._problem!;
        if (!problem.isSpecialJudge) {
            io.warn(
                vscode.l10n.t(
                    'This problem is not a special judge problem. No checker file needed.',
                ),
            );
            return;
        }
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
