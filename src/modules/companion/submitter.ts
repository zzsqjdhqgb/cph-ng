import { readFile } from 'fs/promises';
import { l10n, ProgressLocation, window } from 'vscode';
import Io from '@/helpers/io';
import Logger from '@/helpers/logger';
import Settings from '@/helpers/settings';
import { Problem } from '@/types';
import { CompanionClient } from './client';
import { CphSubmitEmpty, CphSubmitResponse } from './types';

export class Submitter {
  private static logger: Logger = new Logger('companionSubmitter');

  public static async submit(problem?: Problem): Promise<void> {
    Submitter.logger.trace('submit', { problem });
    if (!problem) {
      return;
    }
    const languageList = {
      'GNU G++17 7.3.0': 54,
      'GNU G++20 13.2 (64 bit, winlibs)': 89,
      'GNU G++23 14.2 (64 bit, msys2)': 91,
    } as const;

    let submitLanguageId = Settings.companion.submitLanguage;
    if (!(Object.values(languageList) as number[]).includes(submitLanguageId)) {
      const choice = await window.showQuickPick(Object.keys(languageList), {
        placeHolder: l10n.t('Choose submission language'),
      });
      if (!choice) {
        Io.info(l10n.t('Submission cancelled.'));
        return;
      }
      submitLanguageId = languageList[choice as keyof typeof languageList];
      Settings.companion.submitLanguage = submitLanguageId;
    }

    const sourceCode = await readFile(problem.src.path, 'utf-8');
    Submitter.logger.debug('Read source code for submission', {
      srcPath: problem.src.path,
      sourceCode,
    });
    if (sourceCode.trim() === '') {
      Io.warn(l10n.t('Source code is empty. Submission cancelled.'));
      return;
    }
    Submitter.logger.info(
      `Submitting problem ${problem.name} using language ${submitLanguageId} and file ${problem.src.path}`,
    );
    const requestData: Exclude<CphSubmitResponse, CphSubmitEmpty> = {
      empty: false,
      problemName: problem.name,
      url: problem.url || '',
      sourceCode:
        sourceCode +
        (Settings.companion.addTimestamp
          ? `\n// Submitted via cph-ng at ${new Date().toISOString()}`
          : ''),
      languageId: submitLanguageId,
    };
    Submitter.logger.debug('Submission data', requestData);

    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: l10n.t('Waiting response from cph-submit...'),
        cancellable: true,
      },
      async (progress, token) => {
        try {
          if (token.isCancellationRequested) {
            Io.info(l10n.t('Submission cancelled by user.'));
            return;
          }

          CompanionClient.sendSubmit(requestData);

          await Promise.race([
            CompanionClient.waitForSubmissionConsumed(),
            new Promise((_, reject) => {
              const d = token.onCancellationRequested(() => {
                d.dispose();
                reject(new Error('Cancelled'));
              });
            }),
          ]);

          Io.info(l10n.t('Submission payload consumed by companion'));
        } catch (err: any) {
          if (err.message === 'Cancelled') {
            Io.info(l10n.t('Submission cancelled by user.'));
            return;
          }
          Submitter.logger.error('Submission failed', { error: err });
          window.showErrorMessage(
            l10n.t('Submission failed: {msg}', {
              msg: err?.message || String(err),
            }),
          );
        }
      },
    );
  }
}
