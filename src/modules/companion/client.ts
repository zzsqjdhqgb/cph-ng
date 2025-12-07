import { spawn } from 'child_process';
import { join } from 'path';
import { env, l10n, window } from 'vscode';
import WebSocket from 'ws';
import Io from '@/helpers/io';
import Logger from '@/helpers/logger';
import { Handler } from './handler';
import { CompanionProblem, CphSubmitData } from './types';

const WS_URL = 'ws://localhost:27122';

export class CompanionClient {
  private static logger = new Logger('companionClient');
  private static ws: WebSocket | null = null;
  private static reconnectAttempts = 0;
  private static isConnecting = false;
  private static clientId = Math.random().toString(36).substring(7);

  public static init() {
    this.connect();
  }

  private static connect() {
    if (
      this.isConnecting ||
      (this.ws && this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    this.isConnecting = true;

    this.logger.info('Connecting to Companion Router...');
    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      this.logger.info('Connected to Companion Router');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        this.logger.error('Failed to parse message', e);
      }
    });

    this.ws.on('error', (err) => {
      this.logger.warn('WebSocket error', err);
    });

    this.ws.on('close', () => {
      this.logger.info('Disconnected from Companion Router');
      this.ws = null;
      this.isConnecting = false;

      // If we haven't tried too many times, try to spawn the router
      if (this.reconnectAttempts < 3) {
        this.reconnectAttempts++;
        this.spawnRouter().then(() => {
          setTimeout(() => this.connect(), 1000);
        });
      } else {
        // Retry slowly if it keeps failing
        setTimeout(() => this.connect(), 5000);
      }
    });
  }

  private static async spawnRouter() {
    this.logger.info('Spawning Companion Router process...');
    const routerPath = join(__dirname, '../../dist/router.js'); // Adjust path based on where this file ends up in dist
    // Actually, in dist, everything is flat usually or structured.
    // webpack output: dist/extension.js and dist/router.js
    // __dirname when running extension.js is .../dist
    // So join(__dirname, 'router.js') should be correct if they are in the same folder.

    // However, let's be safe.
    // If this file is bundled into extension.js, __dirname is the directory of extension.js.

    const routerScript = join(__dirname, 'router.js');

    try {
      const child = spawn(process.execPath, [routerScript], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
        },
      });
      child.unref();
      this.logger.info('Router process spawned');
    } catch (e) {
      this.logger.error('Failed to spawn router', e);
    }
  }

  private static handleMessage(msg: any) {
    switch (msg.type) {
      case 'batch-available':
        Handler.handleBatchAvailable(msg.batchId, msg.problems);
        break;
      case 'batch-claimed':
        Handler.handleBatchClaimed(msg.batchId);
        break;
    }
  }

  public static sendSubmit(data: CphSubmitData) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'submit',
          data: {
            ...data,
            clientId: this.clientId,
          },
        }),
      );
      Io.info(l10n.t('Submission sent to queue'));
    } else {
      Io.error(l10n.t('Companion Router not connected'));
    }
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
}
