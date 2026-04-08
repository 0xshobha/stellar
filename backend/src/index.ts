import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { z } from 'zod';
import { env } from './config.js';
import agentsRouter from './agents/index.js';
import { logError, logInfo, logWarn } from './lib/logger.js';
import { startQuerySession } from './manager.js';
import { getProtocolTrace, getSessionMetrics, getSessionStatus, getSessionTransactions, listTransactions } from './lib/store.js';
import { ApiErrorPayload } from './lib/types.js';
import { sseHub } from './sse.js';
import { getAgentCatalog, getAgentById, startRegistryPoller } from './stellar/contract.js';
import { createSponsoredWallet, getManagerWalletBalance } from './stellar/wallet.js';
import { prepareXlmPayment, submitSignedTransaction } from './stellar/payments.js';
import { fetchTransactionReceipt } from './stellar/receipt.js';

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

const chainConfigHandler = (_: express.Request, res: express.Response) => {
  res.json(
    ok({
      network: env.STELLAR_NETWORK,
      contractId: env.CONTRACT_ID,
      x402Mode: env.X402_MODE,
      x402Enforced: env.X402_ENFORCE === 'true',
      contractConfigured: env.CONTRACT_ID !== 'LOCAL_MOCK_CONTRACT'
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
      x402Mode: env.X402_MODE,
      x402Enforce: env.X402_ENFORCE,
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

setupGracefulShutdown();
startRegistryPoller();
startServer(env.PORT);
