import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from './config.js';
import agentsRouter from './agents/index.js';
import { startQuerySession } from './manager.js';
import { getProtocolTrace, getSessionMetrics, getSessionStatus, getSessionTransactions, listTransactions } from './lib/store.js';
import { ApiErrorPayload } from './lib/types.js';
import { sseHub } from './sse.js';
import { getAgentCatalog, getAgentByName } from './stellar/contract.js';
import { createSponsoredWallet, getManagerWalletBalance } from './stellar/wallet.js';

const app = express();

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

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(error: ApiErrorPayload) {
  return { ok: false as const, error };
}

app.use(cors());
app.use(express.json());

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

app.get('/agents/reputation/:agentName', (req, res) => {
  const agentName = req.params.agentName as Parameters<typeof getAgentByName>[0];
  const agent = getAgentByName(agentName);
  if (!agent) {
    res.status(404).json(fail({ code: 'AGENT_NOT_FOUND', message: 'Agent not found' }));
    return;
  }
  res.json(
    ok({
      name: agent.name,
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

app.get('/api/wallet/balance', (_, res) => {
  res.json(ok(getManagerWalletBalance()));
});

app.post('/api/wallet/create', (req, res) => {
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
  const wallet = createSponsoredWallet(name);
  res.json(ok(wallet));
});

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SynergiStellar backend running on port ${env.PORT}`);
});
