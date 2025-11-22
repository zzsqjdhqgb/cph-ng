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
import { SHA256 } from 'crypto-js';
import { readFile, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { l10n } from 'vscode';
import Settings from '../modules/settings';
import { version } from './packageInfo';
import { KnownResult } from './result';
import {
    IBFCompare,
    ICompilationSettings,
    IFileWithHash,
    IProblem,
    ITC,
    ITCIO,
    ITCResult,
    ITCVerdict,
} from './types';

export class TCVerdict implements ITCVerdict {
    constructor(
        public name: string,
        public fullName: string,
        public color: string,
    ) {}
}

export class TCResult implements ITCResult {
    public time?: number;
    public memory?: number;
    public stdout: TCIO = new TCIO();
    public stderr: TCIO = new TCIO();
    public msg: string[] = [];

    constructor(public verdict: TCVerdict = TCVerdicts.UKE) {}
    public fromI(result: ITCResult): void {
        this.verdict = result.verdict;
        this.time = result.time;
        this.memory = result.memory;
        this.stdout.fromI(result.stdout);
        this.stderr.fromI(result.stderr);
        this.msg = result.msg || [];
    }
    public fromResult<T>(result: KnownResult<T>) {
        this.verdict = result.verdict;
        result.msg && this.msg.push(result.msg);
    }
}
export class TCIO {
    useFile: boolean;
    data: string;

    constructor(useFile?: boolean, data?: string) {
        this.useFile = useFile ||= false;
        this.data = data || '';
    }

    public fromI(tc: ITCIO) {
        this.useFile = tc.useFile;
        this.data = tc.data;
    }
    public async fromString(data: string): Promise<void> {
        if (this.useFile) {
            await writeFile(this.data, data);
        } else {
            this.data = data;
        }
    }
    public async toString(): Promise<string> {
        if (this.useFile) {
            return await readFile(this.data, 'utf-8');
        } else {
            return this.data;
        }
    }
    public async toPath(): Promise<string> {
        if (this.useFile) {
            return this.data;
        } else {
            const path = join(
                Settings.cache.directory,
                'io',
                SHA256(this.data).toString().substring(0, 8),
            );
            await writeFile(path, this.data);
            return path;
        }
    }
    public async inlineSmall(): Promise<void> {
        if (this.useFile) {
            try {
                const stats = await stat(this.data);
                if (stats.size <= Settings.problem.maxInlineDataLength) {
                    this.useFile = false;
                    this.data = await readFile(this.data, 'utf-8');
                }
            } catch {}
        }
    }
}

export class TC implements ITC {
    public stdin: TCIO = new TCIO();
    public answer: TCIO = new TCIO();
    public isExpand: boolean = false;
    public isDisabled: boolean = false;
    public result?: TCResult;

    public static fromI(tc: ITC): TC {
        const instance = new TC();
        instance.fromI(tc);
        return instance;
    }
    public fromI(tc: ITC): void {
        (this.stdin.fromI(tc.stdin), this.answer.fromI(tc.answer));
        ((this.isExpand = tc.isExpand), (this.isDisabled = tc.isDisabled));
        if (tc.result) {
            this.result = new TCResult();
            this.result.fromI(tc.result);
        }
    }
}
export type TCWithResult = TC & { result: TCResult };

export class FileWithHash implements IFileWithHash {
    constructor(
        public path: string,
        public hash?: string,
    ) {}
}

export const TCVerdicts = {
    UKE: new TCVerdict('UKE', l10n.t('Unknown Error'), '#0000ff'),
    AC: new TCVerdict('AC', l10n.t('Accepted'), '#49cd32'),
    PC: new TCVerdict('PC', l10n.t('Partially Correct'), '#ed9813'),
    PE: new TCVerdict('PE', l10n.t('Presentation Error'), '#ff778e'),
    WA: new TCVerdict('WA', l10n.t('Wrong Answer'), '#d3140d'),
    TLE: new TCVerdict('TLE', l10n.t('Time Limit Exceed'), '#0c0066'),
    MLE: new TCVerdict('MLE', l10n.t('Memory Limit Exceed'), '#5300a7'),
    OLE: new TCVerdict('OLE', l10n.t('Output Limit Exceed'), '#8300a7'),
    RE: new TCVerdict('RE', l10n.t('Runtime Error'), '#1a26c8'),
    RF: new TCVerdict('RF', l10n.t('Restricted Function'), '#008f81'),
    CE: new TCVerdict('CE', l10n.t('Compilation Error'), '#8b7400'),
    SE: new TCVerdict('SE', l10n.t('System Error'), '#000000'),
    WT: new TCVerdict('WT', l10n.t('Waiting'), '#4100d9'),
    FC: new TCVerdict('FC', l10n.t('Fetched'), '#4c00ff'),
    CP: new TCVerdict('CP', l10n.t('Compiling'), '#5e19ff'),
    CPD: new TCVerdict('CPD', l10n.t('Compiled'), '#7340ff'),
    JG: new TCVerdict('JG', l10n.t('Judging'), '#844fff'),
    JGD: new TCVerdict('JGD', l10n.t('Judged'), '#967fff'),
    CMP: new TCVerdict('CMP', l10n.t('Comparing'), '#a87dff'),
    SK: new TCVerdict('SK', l10n.t('Skipped'), '#4b4b4b'),
    RJ: new TCVerdict('RJ', l10n.t('Rejected'), '#4e0000'),
} as const;

export class Problem implements IProblem {
    public version: string = version;
    public name: string;
    public url?: string;
    public tcs: Record<UUID, TC> = {};
    public tcOrder: UUID[] = [];
    public timeLimit: number = Settings.problem.defaultTimeLimit;
    public memoryLimit: number = Settings.problem.defaultMemoryLimit;
    public src: FileWithHash;
    public checker?: FileWithHash;
    public interactor?: FileWithHash;
    public bfCompare?: IBFCompare;
    public timeElapsed: number = 0;
    public compilationSettings?: ICompilationSettings;

    constructor(name: string, src: string) {
        this.name = name;
        this.src = new FileWithHash(src);
    }

    public static fromI(problem: IProblem): Problem {
        const instance = new Problem(problem.name, problem.src.path);
        instance.fromI(problem);
        return instance;
    }
    public fromI(problem: IProblem): void {
        this.version = problem.version;
        this.name = problem.name;
        this.url = problem.url;
        this.tcs = Object.fromEntries(
            Object.entries(problem.tcs).map(([id, tc]) => [id, TC.fromI(tc)]),
        );
        this.tcOrder = [...problem.tcOrder];
        this.timeLimit = problem.timeLimit;
        this.memoryLimit = problem.memoryLimit;
        this.src = new FileWithHash(problem.src.path);
        this.src.hash = problem.src.hash;
        problem.checker &&
            (this.checker = new FileWithHash(
                problem.checker.path,
                problem.checker.hash,
            ));
        problem.interactor &&
            (this.interactor = new FileWithHash(
                problem.interactor.path,
                problem.interactor.hash,
            ));
        if (problem.bfCompare) {
            this.bfCompare = { ...problem.bfCompare };
        }
        this.timeElapsed = problem.timeElapsed;
        if (problem.compilationSettings) {
            this.compilationSettings = { ...problem.compilationSettings };
        }
    }
}
