import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';
import { x402FetchJson } from '../x402/client.js';
import { buildAgentResponse } from './response.js';

const router = Router();
const MAX_DEPTH = 2;
const AGENT_NAME = 'DeepResearch';
const PRICE_USDC = 0.01;

function getBackendBaseUrl(): string {
  return process.env.RUNTIME_BACKEND_BASE_URL || env.BACKEND_BASE_URL;
}

router.post('/', createPaywall(PRICE_USDC, AGENT_NAME), async (req, res) => {
  const input = String(req.body?.input ?? 'research topic');
  const depth = Number(req.body?.depth ?? 0);
  const sessionId = String(req.header('x-session-id') ?? randomUUID());

  if (depth >= MAX_DEPTH) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(buildAgentResponse({
      res,
      agentName: AGENT_NAME,
      pricePaid: PRICE_USDC,
      data: {
        topic: input,
        depth,
        maxDepth: MAX_DEPTH,
        agentsUsed: [],
        subTransactions: [],
        totalCost: PRICE_USDC,
        result: {
          summary: 'Depth limit reached for recursive research execution.'
        }
      },
      agentPublicKey: env.AGENT_RESEARCH_PUBLIC_KEY,
      depth
    }));
    return;
  }

  const subAgentCalls = [
    { agent: 'Summarizer', endpoint: 'summarize', pricePaid: 0.001 },
    { agent: 'SentimentAI', endpoint: 'sentiment', pricePaid: 0.001 }
  ] as const;

  const settled = await Promise.allSettled(
    subAgentCalls.map(async (entry) => {
      const response = await x402FetchJson<{
        data?: Record<string, unknown>;
        txHash?: string;
        pricePaid?: number;
      }>(
        sessionId,
        `${getBackendBaseUrl()}/agents/${entry.endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
            'x-parent-agent': AGENT_NAME
          },
          body: JSON.stringify({ input, depth: depth + 1 })
        },
        {
          retries: 2,
          timeoutMs: 8000,
          agentName: entry.agent,
          fallbackFactory: (reason) => ({
            data: { fallback: true, reason },
            txHash: mockTxHash(entry.agent),
            pricePaid: entry.pricePaid
          })
        }
      );

      const payload = response.data;
      return {
        agent: entry.agent,
        data: payload.data ?? { fallback: true, reason: 'No payload data' },
        txHash: typeof payload.txHash === 'string' ? payload.txHash : mockTxHash(entry.agent),
        pricePaid: Number(payload.pricePaid ?? entry.pricePaid)
      };
    })
  );

  const byAgent = new Map<string, { data: Record<string, unknown>; txHash: string; pricePaid: number }>();
  settled.forEach((item, index) => {
    const entry = subAgentCalls[index];
    if (item.status === 'fulfilled') {
      byAgent.set(entry.agent, item.value);
      return;
    }

    byAgent.set(entry.agent, {
      data: { fallback: true, reason: String(item.reason) },
      txHash: mockTxHash(entry.agent),
      pricePaid: entry.pricePaid
    });
  });

  const summaryResult = byAgent.get('Summarizer') ?? {
    data: { fallback: true, reason: 'Summarizer unavailable' },
    txHash: mockTxHash('Summarizer'),
    pricePaid: 0.001
  };

  const sentimentResult = byAgent.get('SentimentAI') ?? {
    data: { fallback: true, reason: 'SentimentAI unavailable' },
    txHash: mockTxHash('SentimentAI'),
    pricePaid: 0.001
  };

  const subTransactions = [
    { agent: 'Summarizer', txHash: summaryResult.txHash, pricePaid: 0.001, from: 'DeepResearch', depth: depth + 1 },
    { agent: 'SentimentAI', txHash: sentimentResult.txHash, pricePaid: 0.001, from: 'DeepResearch', depth: depth + 1 }
  ];

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(buildAgentResponse({
    res,
    agentName: AGENT_NAME,
    pricePaid: PRICE_USDC,
    data: {
      topic: input,
      depth,
      maxDepth: MAX_DEPTH,
      agentsUsed: ['Summarizer', 'SentimentAI'],
      subTransactions,
      totalCost: Number((PRICE_USDC + summaryResult.pricePaid + sentimentResult.pricePaid).toFixed(6)),
      result: {
        Summarizer: summaryResult.data,
        SentimentAI: sentimentResult.data
      }
    },
    agentPublicKey: env.AGENT_RESEARCH_PUBLIC_KEY,
    depth
  }));
});

export default router;

function mockTxHash(agentName: string): string {
  return `mock-${agentName.toLowerCase()}-${Date.now().toString(16)}-${randomUUID().slice(0, 8)}`;
}
