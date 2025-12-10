import { access, mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { commands, l10n, Uri, window, workspace } from 'vscode';
import Io from '@/helpers/io';
import Logger from '@/helpers/logger';
import Settings from '@/helpers/settings';
import UserScriptManager from '@/helpers/userScriptManager';
import { Problem } from '@/types';
import { renderTemplate } from '@/utils/strTemplate';
import { CphProblem } from '../problems/cphProblem';
import ProblemsManager from '../problems/manager';
import { CompanionClient } from './client';
import { CompanionProblem } from './types';

export class Handler {
  private static logger: Logger = new Logger('companionHandler');
  private static claimedBatches = new Set<string>();

  public static async handleBatchAvailable(
    batchId: string,
    problems: CompanionProblem[],
  ) {
    const selection = await window.showQuickPick(
      [l10n.t('Yes'), l10n.t('No')],
      {
        placeHolder: l10n.t(
          'Received {count} problems from Companion. Import here?',
          {
            count: problems.length,
          },
        ),
        ignoreFocusOut: true,
      },
    );

    if (selection === l10n.t('Yes')) {
      if (Handler.claimedBatches.has(batchId)) {
        Io.warn(l10n.t('Problems already imported by another instance'));
        return;
      }
      CompanionClient.claimBatch(batchId);
      await Handler.processProblem(problems);
    }
  }

  public static handleBatchClaimed(batchId: string) {
    Handler.claimedBatches.add(batchId);
  }

  private static async processProblem(companionProblems: CompanionProblem[]) {
    const srcPaths = await UserScriptManager.resolvePath(
      companionProblems,
      workspace.workspaceFolders?.map((f) => ({
        index: f.index,
        name: f.name,
        path: f.uri.fsPath,
      })) || [],
    );
    if (!srcPaths) {
      return;
    }
    Handler.logger.debug('Created problem source path', srcPaths);

    const createdDocuments: Uri[] = [];
    for (let i = 0; i < companionProblems.length; i++) {
      const companionProblem = companionProblems[i];
      const srcPath = srcPaths[i];
      if (!srcPath) {
        continue;
      }

      const problem = new CphProblem({
        name: companionProblem.name,
        url: companionProblem.url,
        tests: companionProblem.tests.map((test, id) => ({
          ...test,
          id,
        })),
        interactive: companionProblem.interactive,
        memoryLimit: companionProblem.memoryLimit,
        timeLimit: companionProblem.timeLimit,
        srcPath,
        group: companionProblem.group,
        local: true,
      }).toProblem();

      try {
        await mkdir(dirname(problem.src.path), { recursive: true });
      } catch (e) {
        Handler.logger.error('Failed to create directory', e);
        Io.error(
          l10n.t('Failed to create directory for problem: {msg}', {
            msg: (e as Error).message,
          }),
        );
        continue;
      }

      try {
        await access(problem.src.path);
        Handler.logger.debug('Source file already exists', srcPath);
      } catch {
        Handler.logger.debug('Creating new source file', srcPath);
        await Handler.createSourceFile(problem);
      }

      await problem.save();
      createdDocuments.push(Uri.file(srcPath));
    }

    if (createdDocuments.length > 0) {
      await commands.executeCommand(
        'vscode.open',
        createdDocuments[0],
        Settings.companion.showPanel,
      );

      if (createdDocuments.length > 1) {
        Io.info(
          l10n.t('Created {count} problems', {
            count: createdDocuments.length,
          }),
        );
      }
    }

    await ProblemsManager.dataRefresh();
  }

  private static async createSourceFile(problem: Problem): Promise<void> {
    Handler.logger.trace('createSourceFile', {
      problem,
    });
    try {
      await writeFile(problem.src.path, '');
      if (Settings.problem.templateFile) {
        Handler.logger.debug('Using template file', {
          templateFile: Settings.problem.templateFile,
        });
        try {
          await writeFile(problem.src.path, await renderTemplate(problem));
          Handler.logger.debug('Template applied successfully', {
            srcPath: problem.src.path,
          });
        } catch (e) {
          Handler.logger.warn('Template file error', e);
          Io.warn(
            l10n.t(
              'Failed to use template file: {msg}, creating empty file instead',
              { msg: (e as Error).message },
            ),
          );
        }
      } else {
        Handler.logger.debug(
          'No template file configured, creating empty file',
        );
      }
    } catch (e) {
      Handler.logger.error('Failed to create source file', e);
      throw new Error(`Failed to create source file: ${(e as Error).message}`);
    }
  }
}
