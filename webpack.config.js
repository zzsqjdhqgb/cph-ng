// @ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

import { fileURLToPath } from 'url';
import path from 'path';
import CopyPlugin from 'copy-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type WebpackConfig */
const shared = {
  resolve: { extensions: ['.tsx', '.ts', '.js', '.jsx'], },
  module: {
    rules: [
      {
        test: /(\.tsx?)\b/,
        exclude: /node_modules/,
        use: [
          { loader: 'thread-loader', },
          { loader: 'ts-loader', options: { happyPackMode: true, }, },
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
  }
};

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
  },
  externals: { vscode: 'commonjs vscode' },
  ...shared
};

/** @type WebpackConfig */
const webviewConfig = {
  target: 'web',
  entry: './src/webview/App.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'frontend.js',
    libraryTarget: 'window',
  },
  externals: { vscode: 'vscode', },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/webview/styles.css', to: 'styles.css' },
      ],
    }),
  ],
  ...shared
};

export default [extensionConfig, webviewConfig];
