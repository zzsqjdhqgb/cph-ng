// @ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

import { execSync } from 'child_process';
import CopyPlugin from 'copy-webpack-plugin';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import TerserPlugin from 'terser-webpack-plugin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type WebpackConfig */
const shared = {
    resolve: { extensions: ['.tsx', '.ts', '.js', '.jsx'] },
    module: {
        rules: [
            {
                test: /(\.tsx?)\b/,
                exclude: /node_modules/,
                use: [
                    { loader: 'thread-loader' },
                    { loader: 'ts-loader', options: { happyPackMode: true } },
                ],
            },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    format: {
                        comments: false,
                    },
                },
            }),
        ],
    },
    cache: {
        type: 'filesystem',
    },
};

/** @type WebpackConfig */
const extensionConfig = {
    target: 'node',
    entry: './src/extension.ts',
    output: {
        path: resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'module',
    },
    externals: 'vscode',
    plugins: [
        {
            apply: (compiler) => {
                compiler.hooks.compile.tap('Build Info Plugin', () => {
                    const jsonPath = join(__dirname, 'dist', 'generated.json');
                    mkdirSync(dirname(jsonPath), { recursive: true });
                    writeFileSync(
                        jsonPath,
                        JSON.stringify({
                            commitHash: execSync('git rev-parse HEAD')
                                .toString()
                                .trim(),
                            buildTime: new Date().toISOString(),
                            buildBy: execSync('git config user.name')
                                .toString()
                                .trim(),
                        }),
                    );
                });
            },
        },
    ],
    experiments: { outputModule: true },
    ...shared,
};

/** @type WebpackConfig */
const webviewConfig = {
    target: 'web',
    entry: './src/webview/App.tsx',
    output: {
        path: resolve(__dirname, 'dist'),
        filename: 'frontend.js',
        libraryTarget: 'window',
    },
    externals: 'vscode',
    plugins: [
        new CopyPlugin({
            patterns: [{ from: 'src/webview/styles.css', to: 'styles.css' }],
        }),
    ],
    ...shared,
};

export default [extensionConfig, webviewConfig];
