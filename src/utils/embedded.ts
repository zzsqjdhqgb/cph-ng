import { gunzipSync, gzipSync } from 'zlib';
import { EmbeddedProblem } from './types';

export const EMBEDDED_HEADER =
    '////////////////////// CPH-NG DATA STARTS //////////////////////';
export const EMBEDDED_FOOTER =
    '/////////////////////// CPH-NG DATA ENDS ///////////////////////';

export function extractEmbedded(cppData: string): EmbeddedProblem | undefined {
    const startIdx = cppData.indexOf(EMBEDDED_HEADER);
    const endIdx = cppData.indexOf(EMBEDDED_FOOTER);
    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
        return undefined;
    }
    const payload = cppData
        .substring(startIdx + EMBEDDED_HEADER.length, endIdx)
        .replaceAll('\r', '')
        .replaceAll('\n', '')
        .replace(/^\s*\/\*\s*/, '')
        .replace(/\s*\*\/\s*$/, '')
        .trim();
    return JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString());
}

export function buildEmbeddedBlock(problem: EmbeddedProblem): string {
    const data =
        gzipSync(Buffer.from(JSON.stringify(problem)))
            .toString('base64')
            .match(/.{1,64}/g)
            ?.join('\n') || '';
    return [
        '',
        '',
        EMBEDDED_HEADER,
        '/*',
        data,
        ' */',
        EMBEDDED_FOOTER,
        '',
    ].join('\n');
}
