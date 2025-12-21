import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { dirname } from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CompanionClientMsg,
  CompanionMsg,
  CompanionProblem,
  CphSubmitMsgData,
  CphSubmitResponse,
} from '../modules/companion/types';

const httpPortEnv = Number(process.env.CPH_NG_HTTP_PORT);
const wsPortEnv = Number(process.env.CPH_NG_WS_PORT);

const HTTP_PORT =
  Number.isFinite(httpPortEnv) && httpPortEnv > 0 ? httpPortEnv : 27121;
const WS_PORT =
  Number.isFinite(wsPortEnv) && wsPortEnv > 0 ? wsPortEnv : HTTP_PORT + 1;
const SHUTDOWN_DELAY = 30000;
const LOG_FILE = process.env.CPH_NG_LOG_FILE;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  if (LOG_FILE) {
    try {
      const dir = dirname(LOG_FILE);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      if (!existsSync(LOG_FILE)) {
        writeFileSync(LOG_FILE, '');
      }
      appendFileSync(LOG_FILE, `${line}\n`);
    } catch (e) {}
  }
  // Always emit to stderr so errors are visible even without log file
  // eslint-disable-next-line no-console
  console.error(line);
}

// State
const clients = new Set<WebSocket>();
let shutdownTimer: NodeJS.Timeout | null = null;
const submissionQueue: CphSubmitMsgData[] = [];
const batches = new Map<string, CompanionProblem[]>();

// --- Helper Functions ---

function gracefulShutdown(reason: string, error?: any) {
  log(`Shutting down: ${reason}`);
  if (error) {
    const detail = error.stack || error.message || String(error);
    log(`Error details: ${detail}`);
  }

  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }

  // Close all WebSocket connections
  for (const client of clients) {
    try {
      client.terminate();
    } catch (e) {}
  }
  clients.clear();

  // Close WebSocket server
  wss.close(() => {
    log('WebSocket server closed');
  });

  // Close HTTP server
  httpServer.close(() => {
    log('HTTP server closed');
    process.exit(error ? 1 : 0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    log('Force exiting...');
    process.exit(error ? 1 : 0);
  }, 1000);
}

function resetShutdownTimer() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
  if (clients.size === 0) {
    shutdownTimer = setTimeout(() => {
      gracefulShutdown('No clients connected for timeout period');
    }, SHUTDOWN_DELAY);
  }
}

function broadcast(message: CompanionMsg, exclude?: WebSocket) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// --- HTTP Server ---

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.url === '/' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data: CompanionProblem = JSON.parse(body);
        const batchId = data.batch.id;
        const batchSize = data.batch.size;

        let currentBatch = batches.get(batchId);
        if (!currentBatch) {
          currentBatch = [];
          batches.set(batchId, currentBatch);
        }
        currentBatch.push(data);

        if (currentBatch.length >= batchSize) {
          batches.delete(batchId);
          broadcast({
            type: 'batch-available',
            batchId,
            problems: currentBatch,
          });
        }

        res.writeHead(200, headers);
        res.end();
      } catch (e) {
        res.writeHead(400, headers);
        res.end('Invalid JSON');
      }
    });
  } else if (req.url === '/getSubmit' && req.method === 'GET') {
    const submission = submissionQueue.shift();
    const response: CphSubmitResponse = submission || { empty: true };
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));

    if (submission && submission.clientId) {
      log(`Submission consumed for client ${submission.clientId}`);
      broadcast({
        type: 'submission-consumed',
        clientId: submission.clientId,
      });
    }
  } else {
    res.writeHead(404, headers);
    res.end();
  }
});

httpServer.listen(HTTP_PORT, () => {
  // console.log(`HTTP Server listening on ${HTTP_PORT}`);
});

httpServer.on('error', (err) => {
  gracefulShutdown('HTTP Server Error', err);
});

// --- WebSocket Server ---

const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws: WebSocket) => {
  clients.add(ws);
  resetShutdownTimer();

  ws.on('message', (message: string) => {
    try {
      const msg: CompanionClientMsg = JSON.parse(message.toString());

      if (msg.type === 'submit') {
        submissionQueue.push(msg.data);
      } else if (msg.type === 'claim-batch') {
        // Broadcast to others that this batch is claimed
        broadcast(
          {
            type: 'batch-claimed',
            batchId: msg.batchId,
            claimedBy: msg.clientId, // Optional
          },
          ws,
        ); // Exclude the sender
      }
    } catch (e) {
      // Ignore invalid messages
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    resetShutdownTimer();
  });
});

wss.on('error', (err) => {
  gracefulShutdown('WebSocket Server Error', err);
});

// Initial timer
resetShutdownTimer();

process.on('SIGINT', () => {
  gracefulShutdown('Received SIGINT');
});

process.on('SIGTERM', () => {
  gracefulShutdown('Received SIGTERM');
});

process.on('uncaughtException', (err) => {
  gracefulShutdown('Uncaught Exception', err);
});
