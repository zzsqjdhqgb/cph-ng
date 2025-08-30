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

import { homedir, tmpdir } from 'os';
import * as vscode from 'vscode';
import { renderTemplate } from './strTemplate';
import { Logger } from './io';

class SettingsSection {
    private name: string;
    protected logger: Logger = new Logger('settings');
    constructor(name: string) {
        this.name = name;
        this.logger.trace(`Created SettingsSection: ${name}`);
    }
    protected get(key: string): unknown {
        this.logger.trace(`Getting setting: ${this.name}.${key}`);
        const value = vscode.workspace
            .getConfiguration('cph-ng')
            .get(`${this.name}.${key}`);
        this.logger.debug(`Setting value for ${this.name}.${key}:`, value);
        return value;
    }
    protected set(key: string, value: unknown): Thenable<void> {
        this.logger.trace(`Setting setting: ${this.name}.${key}`, value);
        return vscode.workspace
            .getConfiguration('cph-ng')
            .update(
                `${this.name}.${key}`,
                value,
                vscode.ConfigurationTarget.Global,
            );
    }
}

class BasicSection extends SettingsSection {
    constructor() {
        super('basic');
    }
    get folderOpener(): 'tree' | 'flat' {
        return this.get('folderOpener') as 'tree' | 'flat';
    }
}

class CompilationSection extends SettingsSection {
    constructor() {
        super('compilation');
    }
    get cCompiler(): string {
        return this.get('cCompiler') as string;
    }
    get cArgs(): string {
        return this.get('cArgs') as string;
    }
    get cppCompiler(): string {
        return this.get('cppCompiler') as string;
    }
    get cppArgs(): string {
        return this.get('cppArgs') as string;
    }
    get objcopy(): string {
        return this.get('objcopy') as string;
    }
    get timeout(): number {
        return this.get('timeout') as number;
    }
    get useWrapper(): boolean {
        return this.get('useWrapper') as boolean;
    }
    get useHook(): string {
        return this.get('useHook') as string;
    }
}

class CacheSection extends SettingsSection {
    constructor() {
        super('cache');
    }
    get directory(): string {
        const directory = renderTemplate(this.get('directory') as string, [
            ['tmp', tmpdir()],
            ['home', homedir()],
        ]);
        this.logger.debug('Cache directory resolved:', directory);
        return directory;
    }
    get cleanOnStartup(): boolean {
        return this.get('cleanOnStartup') as boolean;
    }
}

class CphCapableSection extends SettingsSection {
    constructor() {
        super('cphCapable');
    }
    get enabled(): boolean {
        return this.get('enabled') as boolean;
    }
}

class CompanionSection extends SettingsSection {
    constructor() {
        super('companion');
    }
    get listenPort(): number {
        return this.get('listenPort') as number;
    }
    get submitLanguage(): number {
        return this.get('submitLanguage') as number;
    }
    set submitLanguage(value: number) {
        this.set('submitLanguage', value);
    }
    get addTimestamp(): number {
        return this.get('addTimestamp') as number;
    }
    get chooseSaveFolder(): boolean {
        return this.get('chooseSaveFolder') as boolean;
    }
}

class RunnerSection extends SettingsSection {
    constructor() {
        super('runner');
    }
    get timeAddition(): number {
        return this.get('timeAddition') as number;
    }
    get stderrThreshold(): number {
        return this.get('stderrThreshold') as number;
    }
}

class ComparingSection extends SettingsSection {
    constructor() {
        super('comparing');
    }
    get oleSize(): number {
        return this.get('oleSize') as number;
    }
    get regardPEAsAC(): boolean {
        return this.get('regardPEAsAC') as boolean;
    }
    get ignoreError(): boolean {
        return this.get('ignoreError') as boolean;
    }
}

class BFCompareSection extends SettingsSection {
    constructor() {
        super('bfCompare');
    }
    get generatorTimeLimit(): number {
        return this.get('generatorTimeLimit') as number;
    }
    get bruteForceTimeLimit(): number {
        return this.get('bruteForceTimeLimit') as number;
    }
}

class ProblemSection extends SettingsSection {
    constructor() {
        super('problem');
    }
    get defaultTimeLimit(): number {
        return this.get('defaultTimeLimit') as number;
    }
    get defaultMemoryLimit(): number {
        return this.get('defaultMemoryLimit') as number;
    }
    get foundMatchTestCaseBehavior(): 'ask' | 'always' | 'never' {
        return this.get('foundMatchTestCaseBehavior') as
            | 'ask'
            | 'always'
            | 'never';
    }
    get templateFile(): string {
        return this.get('templateFile') as string;
    }
    get problemFilePath(): string {
        return renderTemplate(this.get('problemFilePath') as string, [
            ['tmp', tmpdir()],
            ['home', homedir()],
        ]);
    }
    get unzipFolder(): string {
        return renderTemplate(this.get('unzipFolder') as string, [
            ['tmp', tmpdir()],
            ['home', homedir()],
        ]);
    }
    get deleteAfterUnzip(): boolean {
        return this.get('deleteAfterUnzip') as boolean;
    }
    get clearBeforeLoad(): boolean {
        return this.get('clearBeforeLoad') as boolean;
    }
}

class SidebarSection extends SettingsSection {
    constructor() {
        super('sidebar');
    }
    get retainWhenHidden(): boolean {
        return this.get('retainWhenHidden') as boolean;
    }
    get showAcGif(): boolean {
        return this.get('showAcGif') as boolean;
    }
    get colorTheme(): string {
        return this.get('colorTheme') as string;
    }
    get hiddenStatuses(): string[] {
        return this.get('hiddenStatuses') as string[];
    }
    get showTips(): boolean {
        return this.get('showTips') as boolean;
    }
    get fontFamily(): string {
        return this.get('fontFamily') as string;
    }
}

export default class Settings {
    static basic = new BasicSection();
    static compilation = new CompilationSection();
    static cache = new CacheSection();
    static cphCapable = new CphCapableSection();
    static companion = new CompanionSection();
    static runner = new RunnerSection();
    static comparing = new ComparingSection();
    static bfCompare = new BFCompareSection();
    static problem = new ProblemSection();
    static sidebar = new SidebarSection();
}
