import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { z } from 'zod';
import { env } from './infra/config.js';
import agentsRouter from './agents/index.js';
import { logError, logInfo, logWarn } from './infra/logger.js';
import { startQuerySession } from './core/manager.js';
import {
  getProtocolTrace,
  getSessionMetrics,
  getSessionStatus,
  getSessionTransactions,
  listTransactions,
  listX402Settlements
} from './infra/store.js';
import { ApiErrorPayload } from './infra/types.js';
import { sseHub } from './infra/sse.js';
import { getAgentCatalog, getAgentById, refreshRegistryFromChain, startRegistryPoller } from './registry/contract.js';
import { getRegistryCompetitionSnapshot } from './registry/competition.js';
import { createSponsoredWallet, getManagerWalletBalance } from './payments/wallet.js';
import { prepareXlmPayment, submitSignedTransaction } from './payments/xlm.js';
import { fetchTransactionReceipt } from './payments/receipt.js';

const app = express();
let activeServer: Server | null = null;

const querySchema = z.object({
  query: z.string().min(3)
});

const sessionParamSchema = z.object({
  sessionId: z.string().min(10)
});

const transactionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  sessionId: z.string().optional()
});

const x402LedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

const registryCompetitionQuerySchema = z.object({
  capability: z.string().min(1).max(64)
});

const walletCreateSchema = z.object({
  name: z.string().min(2).max(80).optional()
});

const paymentPrepareSchema = z.object({
  from: z.string().min(10),
  amount: z.coerce.number().positive().max(1000).default(1),
  memo: z.string().max(64).optional()
});

const paymentSubmitSchema = z.object({
  signedXdr: z.string().min(20),
  fromLabel: z.string().max(80).optional()
});

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(error: ApiErrorPayload) {
  return { ok: false as const, error };
}

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const startedAt = Date.now();
  logInfo('Incoming request', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });

  res.on('finish', () => {
    logInfo('Completed request', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
});

app.get('/health', (_, res) => {
  res.json(ok({ status: 'ok', service: 'synergi-stellar-backend' }));
});

app.use('/agents', agentsRouter);

app.get('/agents/catalog', (_, res) => {
  const catalog = getAgentCatalog();
  res.json(
    ok({
      items: catalog,
      count: catalog.length,
      generatedAt: new Date().toISOString()
    })
  );
});

app.get('/agents/reputation/:agentId', (req, res) => {
  const agentId = String(req.params.agentId ?? '');
  const agent = getAgentById(agentId);
  if (!agent) {
    res.status(404).json(fail({ code: 'AGENT_NOT_FOUND', message: 'Agent not found' }));
    return;
  }
  res.json(
    ok({
      id: agent.id,
      plannerRole: agent.plannerRole,
      reputation: agent.reputation,
      jobsCompleted: agent.jobsCompleted,
      jobsFailed: agent.jobsFailed,
      priceUsdc: agent.price
    })
  );
});

app.post('/api/query', (req, res) => {
  const parsed = querySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid query payload',
        details: parsed.error.flatten()
      })
    );
    return;
  }

  const sessionId = startQuerySession(parsed.data.query.trim());
  res.json(ok({ sessionId }));
});

app.get('/api/events/:sessionId', (req, res) => {
  const parsed = sessionParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid session id',
        details: parsed.error.flatten()
      })
    );
    return;
  }
  const sessionId = parsed.data.sessionId;
  sseHub.addClient(sessionId, res);

  req.on('close', () => {
    sseHub.removeClient(sessionId);
  });
});

app.get('/api/status/:sessionId', (req, res) => {
  const parsed = sessionParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid session id',
        details: parsed.error.flatten()
      })
    );
    return;
  }

  const sessionId = parsed.data.sessionId;
  const session = getSessionStatus(sessionId);
  if (!session) {
    res.status(404).json(fail({ code: 'SESSION_NOT_FOUND', message: 'Session not found' }));
    return;
  }
  res.json(
    ok({
      ...session,
      protocolTrace: getProtocolTrace(sessionId),
      metrics: getSessionMetrics(sessionId),
      transactions: getSessionTransactions(sessionId, 100)
    })
  );
});

app.get('/api/transactions', (req, res) => {
  const parsed = transactionQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid transactions query',
        details: parsed.error.flatten()
      })
    );
    return;
  }
  const records = listTransactions(parsed.data.limit, parsed.data.sessionId);
  res.json(
    ok({
      items: records,
      count: records.length,
      limit: parsed.data.limit,
      sessionId: parsed.data.sessionId ?? null
    })
  );
});

app.get('/api/payments/x402-settlements', (req, res) => {
  const parsed = x402LedgerQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid query',
        details: parsed.error.flatten()
      })
    );
    return;
  }
  res.json(ok({ items: listX402Settlements(parsed.data.limit), generatedAt: new Date().toISOString() }));
});

app.get('/api/transactions/:txHash/receipt', async (req, res) => {
  const txHash = String(req.params.txHash ?? '').trim();
  if (!txHash) {
    res.status(400).json(fail({ code: 'VALIDATION_ERROR', message: 'Missing transaction hash' }));
    return;
  }

  try {
    const receipt = await fetchTransactionReceipt(txHash);
    res.json(ok(receipt));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json(fail({ code: 'TX_RECEIPT_FETCH_FAILED', message }));
  }
});

app.get('/api/wallet/balance', async (_, res) => {
  try {
    const balance = await getManagerWalletBalance();
    res.json(ok(balance));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json(fail({ code: 'WALLET_BALANCE_FETCH_FAILED', message }));
  }
});

app.get('/api/registry/competition', async (req, res) => {
  const parsed = registryCompetitionQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Query parameter "capability" is required (e.g. price, news, research).',
        details: parsed.error.flatten()
      })
    );
    return;
  }

  try {
    const snapshot = await getRegistryCompetitionSnapshot(parsed.data.capability);
    res.json(ok(snapshot));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('Registry competition snapshot failed', { message });
    res.status(502).json(fail({ code: 'REGISTRY_COMPETITION_FAILED', message }));
  }
});

const chainConfigHandler = (_: express.Request, res: express.Response) => {
  res.json(
    ok({
      network: env.STELLAR_NETWORK,
      contractId: env.CONTRACT_ID,
      x402Mode: 'real' as const,
      x402Enforced: true as const,
      contractConfigured: Boolean(env.CONTRACT_ID?.trim())
    })
  );
};

app.get('/api/chain/config', chainConfigHandler);
app.get('/chain/config', chainConfigHandler);

app.post('/api/wallet/create', async (req, res) => {
  const parsed = walletCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid wallet payload',
        details: parsed.error.flatten()
      })
    );
    return;
  }
  const name = String(parsed.data.name ?? `Agent-${randomUUID().slice(0, 8)}`);
  try {
    const wallet = await createSponsoredWallet(name);
    res.json(ok(wallet));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json(fail({ code: 'WALLET_CREATE_FAILED', message }));
  }
});

app.post('/api/payments/prepare', async (req, res) => {
  const parsed = paymentPrepareSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid payment preparation payload',
        details: parsed.error.flatten()
      })
    );
    return;
  }

  try {
    const prepared = await prepareXlmPayment({
      from: parsed.data.from,
      amount: parsed.data.amount,
      memo: parsed.data.memo
    });
    res.json(ok(prepared));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json(fail({ code: 'PAYMENT_PREPARE_FAILED', message }));
  }
});

app.post('/api/payments/submit', async (req, res) => {
  const parsed = paymentSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid payment submission payload',
        details: parsed.error.flatten()
      })
    );
    return;
  }

  try {
    const submitted = await submitSignedTransaction({
      signedXdr: parsed.data.signedXdr,
      noteFrom: parsed.data.fromLabel
    });
    res.json(ok(submitted));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json(fail({ code: 'PAYMENT_SUBMIT_FAILED', message }));
  }
});

function startServer(startPort: number, attemptsLeft = 5): void {
  const server = app.listen(startPort, env.HOST, () => {
    process.env.RUNTIME_BACKEND_BASE_URL = `http://localhost:${startPort}`;
    activeServer = server;
    logInfo('SynergiStellar backend started', {
      port: startPort,
      host: env.HOST,
      env: env.NODE_ENV,
      x402Mode: 'real',
      x402Enforced: true,
      network: env.STELLAR_NETWORK,
      baseUrl: process.env.RUNTIME_BACKEND_BASE_URL
    });
    logInfo('Backend endpoints ready', {
      health: '/health',
      query: '/api/query',
      events: '/api/events/:sessionId',
      status: '/api/status/:sessionId',
      transactions: '/api/transactions',
      walletBalance: '/api/wallet/balance',
      walletCreate: '/api/wallet/create',
      paymentPrepare: '/api/payments/prepare',
      paymentSubmit: '/api/payments/submit',
      x402Settlements: '/api/payments/x402-settlements',
      registryCompetition: '/api/registry/competition?capability=price',
      catalog: '/agents/catalog',
      systemStatus: '/api/system/status'
    });
  });

  server.on('error', (error) => {
    const err = error as NodeJS.ErrnoException;
    const allowPortFallback = env.NODE_ENV !== 'production';
    if (err.code === 'EADDRINUSE' && allowPortFallback && attemptsLeft > 0) {
      const nextPort = startPort + 1;
      logWarn('Port in use, retrying with next port', {
        requestedPort: startPort,
        nextPort,
        attemptsLeft: attemptsLeft - 1
      });
      startServer(nextPort, attemptsLeft - 1);
      return;
    }

    if (err.code === 'EADDRINUSE' && !allowPortFallback) {
      logError('Configured port is already in use in production mode', {
        port: startPort,
        host: env.HOST,
        code: err.code,
        message: err.message
      });
      process.exit(1);
      return;
    }

    logError('Backend failed to start', {
      port: startPort,
      host: env.HOST,
      code: err.code,
      message: err.message
    });
    process.exit(1);
  });
}

function setupGracefulShutdown(): void {
  const shutdown = (signal: string) => {
    logInfo('Shutdown signal received', { signal });
    if (!activeServer) {
      process.exit(0);
      return;
    }

    activeServer.close((error?: Error) => {
      if (error) {
        logError('Error while closing server', { signal, message: error.message });
        process.exit(1);
        return;
      }
      logInfo('Server shutdown complete', { signal });
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logError('Unhandled promise rejection', { message, stack: reason instanceof Error ? reason.stack : undefined });
});

process.on('uncaughtException', (error) => {
  logError('Uncaught exception', { message: error.message, stack: error.stack });
});

/** Last-resort Express error handler — keeps the process alive for ordinary request failures. */
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  logError('Express error', {
    path: req.originalUrl,
    method: req.method,
    message,
    stack: err instanceof Error ? err.stack : undefined
  });
  if (res.headersSent) {
    return;
  }
  res.status(500).json(fail({ code: 'INTERNAL_ERROR', message: 'Request failed.' }));
});

setupGracefulShutdown();

function bootstrapRegistryThenListen(): void {
  const strictRegistry = env.NODE_ENV === 'production';

  void refreshRegistryFromChain()
    .then(() => {
      startRegistryPoller();
      startServer(env.PORT);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (strictRegistry) {
        logError('Registry bootstrap failed — set CONTRACT_ID and register agents on-chain', { message });
        process.exit(1);
        return;
      }
      logWarn('Registry bootstrap failed — API up for wiring checks; fix CONTRACT_ID for real runs', {
        message
      });
      startServer(env.PORT);
      void refreshRegistryFromChain()
        .then(() => {
          startRegistryPoller();
          logInfo('Registry loaded after retry');
        })
        .catch((retryErr) => {
          const m = retryErr instanceof Error ? retryErr.message : String(retryErr);
          logWarn('Registry still unavailable; poller not started', { message: m });
        });
    });
}

bootstrapRegistryThenListen();
