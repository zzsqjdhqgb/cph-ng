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

import Logger from '../helpers/logger';
import ProcessExecutor from '../helpers/processExecutor';
import {
    ProcessResult,
    ProcessResultHandler,
} from '../helpers/processResultHandler';
import { TC } from '../utils/types';
import { tcIo2Path } from '../utils/types.backend';

export class Checker {
    private static logger: Logger = new Logger('checker');

    public static async runChecker(
        path: string,
        tc: TC,
        ac: AbortController,
    ): Promise<ProcessResult> {
        this.logger.trace('runChecker', { path, tc, ac });

        const inputFile = await tcIo2Path(tc.stdin);
        const outputFile = await tcIo2Path(tc.result!.stdout);
        const answerFile = await tcIo2Path(tc.answer);

        const result = await ProcessExecutor.execute({
            cmd: [path, inputFile, outputFile, answerFile],
            ac: ac,
        });

        this.logger.debug('Checker completed', result);
        return ProcessResultHandler.parseChecker(result);
    }
}
