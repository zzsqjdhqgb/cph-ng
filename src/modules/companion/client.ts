import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
import { l10n, ProgressLocation, window } from 'vscode';
import WebSocket from 'ws';
import Io from '@/helpers/io';
import Logger from '@/helpers/logger';
import Settings from '@/helpers/settings';
import { Handler } from './handler';
import { CompanionMsg, CphSubmitData } from './types';

export class CompanionClient {
  private static logger = new Logger('companionClient');
  private static ws: WebSocket | null = null;
  private static isConnecting = false;
  private static clientId = randomUUID();
  private static eventEmitter = new EventEmitter();

  private static getPorts() {
    const httpPort = Settings.companion.listenPort;
    return {
      httpPort,
      wsPort: httpPort + 1,
    };
  }

  private static getWsUrl() {
    const { wsPort } = this.getPorts();
    return `ws://localhost:${wsPort}`;
  }

  public static init() {
    this.connect();
  }

  private static async connect() {
    if (
      this.isConnecting ||
      (this.ws && this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    this.isConnecting = true;

    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: l10n.t('Connecting to Companion Router...'),
        cancellable: false,
      },
      async (progress) => {
        const SPAWN_WAIT_MS = 3000;

        // 1. First attempt
        if (await this.attemptConnection()) {
          this.isConnecting = false;
          return;
        }

        // 2. Spawn router
        progress.report({
          message: l10n.t('Connection failed. Spawning Router...'),
          increment: 33,
        });
        await this.spawnRouter();
        await new Promise((resolve) => setTimeout(resolve, SPAWN_WAIT_MS));

        // 3. Second attempt
        progress.report({
          message: l10n.t('Retrying connection...'),
          increment: 33,
        });
        if (await this.attemptConnection()) {
          this.isConnecting = false;
          return;
        }

        this.isConnecting = false;
        Io.error(
          l10n.t('Failed to connect to Companion Router after spawning.'),
        );
      },
    );
  }

  private static attemptConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(this.getWsUrl());

      const onOpen = () => {
        cleanup(false);
        this.ws = ws;
        this.setupListeners(ws);
        resolve(true);
      };

      const onError = (err: Error) => {
        this.logger.warn('WebSocket connection error', err);
        cleanup(true);
        resolve(false);
      };

      const onClose = () => {
        cleanup(true);
        resolve(false);
      };

      const timeout = setTimeout(() => {
        this.logger.warn('WebSocket connection timeout');
        cleanup(true);
        resolve(false);
      }, 5000);

      const cleanup = (terminate: boolean) => {
        clearTimeout(timeout);
        ws.removeListener('open', onOpen);
        ws.removeListener('error', onError);
        ws.removeListener('close', onClose);
        if (terminate) {
          try {
            ws.terminate();
          } catch {
            // Ignore errors during closure
          }
        }
      };

      ws.on('open', onOpen);
      ws.on('error', onError);
      ws.on('close', onClose);
    });
  }

  private static setupListeners(ws: WebSocket) {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        this.logger.error('Failed to parse message', e);
      }
    });

    ws.on('error', (err) => {
      this.logger.warn('WebSocket error', err);
    });

    ws.on('close', () => {
      this.logger.info('Disconnected from Companion Router');
      this.ws = null;
      this.isConnecting = false;
    });
  }

  private static async spawnRouter() {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: l10n.t('Spawning Companion Router...'),
        cancellable: false,
      },
      async () => {
        this.logger.info('Spawning Companion Router process...');
        const routerScript = join(__dirname, 'router.js');

        if (!existsSync(routerScript)) {
          const errorMsg = `Companion Router script not found at ${routerScript}. Please ensure the extension is correctly built.`;
          this.logger.error(errorMsg);
          window.showErrorMessage(errorMsg);
          return;
        }

        const logFile = join(Settings.cache.directory, 'router.log');
        const { httpPort, wsPort } = this.getPorts();

        try {
          const child = spawn(process.execPath, [routerScript], {
            detached: true,
            stdio: 'ignore',
            env: {
              ...process.env,
              CPH_NG_LOG_FILE: logFile,
              CPH_NG_HTTP_PORT: String(httpPort),
              CPH_NG_WS_PORT: String(wsPort),
              CPH_NG_SHUTDOWN_DELAY: '30000',
              CPH_NG_BATCH_TIMEOUT: '60000',
            },
          });
          child.unref();
          this.logger.info(
            `Router process spawned on ports http=${httpPort}, ws=${wsPort}`,
          );
          // Give it a moment to start
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (e) {
          this.logger.error('Failed to spawn router', e);
        }
      },
    );
  }

  private static handleMessage(msg: CompanionMsg) {
    switch (msg.type) {
      case 'batch-available':
        Handler.handleBatchAvailable(msg.batchId, msg.problems);
        break;
      case 'batch-claimed':
        Handler.handleBatchClaimed(msg.batchId);
        break;
      case 'submission-consumed':
        if (msg.clientId === this.clientId) {
          this.eventEmitter.emit('submission-consumed', msg.submissionId);
        }
        break;
    }
  }

  public static sendSubmit(data: CphSubmitData): string | null {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const submissionId = randomUUID();
      this.ws.send(
        JSON.stringify({
          type: 'submit',
          data: {
            ...data,
            clientId: this.clientId,
            submissionId,
          },
        }),
      );
      Io.info(l10n.t('Submission sent to queue'));
      return submissionId;
    }
    Io.error(l10n.t('Companion Router not connected'));
    return null;
  }

  public static waitForSubmissionConsumed(submissionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout;
      const listener = (id: string) => {
        if (id === submissionId) {
          clearTimeout(timeout);
          this.eventEmitter.removeListener('submission-consumed', listener);
          resolve();
        }
      };
      timeout = setTimeout(() => {
        this.eventEmitter.removeListener('submission-consumed', listener);
        reject(new Error(l10n.t('Submission timeout')));
      }, 30000);
      this.eventEmitter.on('submission-consumed', listener);
    });
  }

  public static claimBatch(batchId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'claim-batch',
          batchId,
          clientId: this.clientId,
        }),
      );
    }
  }

  public static sendCancelSubmit(submissionId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'cancel-submit',
          submissionId,
          clientId: this.clientId,
        }),
      );
    }
  }
}
