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

import { ProcessResultHandler } from './processResultHandler';
import { TCVerdict } from './types';

/**
 * Testlib 工具类
 *
 * @deprecated 请使用 ProcessResultHandler.getTestlibVerdict() 替代
 * 保留此类是为了向后兼容性
 */
export class Testlib {
    /**
     * @deprecated 请使用 ProcessResultHandler 中的对应方法
     */
    static getVerdict(code: number | null): {
        verdict: TCVerdict;
        msg?: string;
    } {
        if (code === null) {
            return ProcessResultHandler['getTestlibVerdict'](0);
        }
        return ProcessResultHandler['getTestlibVerdict'](code);
    }
}
