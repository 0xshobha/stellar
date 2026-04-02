import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';
import { x402FetchJson } from '../x402/client.js';

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
  const timestamp = new Date().toISOString();

  if (depth >= MAX_DEPTH) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      agent: AGENT_NAME,
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
      txHash: fakeTxHash(AGENT_NAME),
      agentPublicKey: env.AGENT_RESEARCH_PUBLIC_KEY ?? 'UNCONFIGURED_AGENT_RESEARCH_PUBLIC_KEY',
      depth,
      timestamp
    });
    return;
  }

  const plan = buildSubAgentPlan(input);
  const settled = await Promise.allSettled(
    plan.map(async (entry) => {
      const response = await x402FetchJson<{
        data?: unknown;
        pricePaid?: number;
        txHash?: string;
      }>(
        sessionId,
        `${getBackendBaseUrl()}/agents/${entry.endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
            'x-parent-agent': 'DeepResearch'
          },
          body: JSON.stringify({ input, depth: depth + 1 })
        },
        {
          retries: 2,
          timeoutMs: 8000,
          agentName: entry.agent,
          fallbackFactory: (reason) => ({
            data: {
              fallback: true,
              reason
            },
            pricePaid: 0,
            txHash: `fallback-${entry.endpoint}-${Date.now().toString(16)}`
          })
        }
      );
      const payload = response.data;
      return {
        agent: entry.agent,
        endpoint: entry.endpoint,
        data: payload.data,
        pricePaid: Number(payload.pricePaid ?? entry.price),
        txHash: String(payload.txHash ?? fakeTxHash(entry.agent)),
        fallbackUsed: response.fallbackUsed,
        attempts: response.attempts
      };
    })
  );

  const successful = settled
    .filter(
      (
        item
      ): item is PromiseFulfilledResult<{
        agent: string;
        endpoint: string;
        data: unknown;
        pricePaid: number;
        txHash: string;
        fallbackUsed: boolean;
        attempts: number;
      }> => item.status === 'fulfilled'
    )
    .map((item) => item.value);
  const failed = settled
    .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
    .map((item) => String(item.reason));

  const subAgentCost = successful.reduce((sum, item) => sum + item.pricePaid, 0);
  const aggregated = Object.fromEntries(successful.map((item) => [item.agent, item.data]));

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    agent: AGENT_NAME,
    pricePaid: PRICE_USDC,
    data: {
      topic: input,
      depth,
      maxDepth: MAX_DEPTH,
      agentsUsed: successful.map((item) => item.agent),
      subTransactions: successful.map((item) => ({
        agent: item.agent,
        txHash: item.txHash,
        pricePaid: item.pricePaid,
        from: 'DeepResearch',
        depth: depth + 1,
        fallbackUsed: item.fallbackUsed,
        attempts: item.attempts
      })),
      totalCost: Number((PRICE_USDC + subAgentCost).toFixed(6)),
      failed,
      result: aggregated
    },
    txHash: fakeTxHash(AGENT_NAME),
    agentPublicKey: env.AGENT_RESEARCH_PUBLIC_KEY ?? 'UNCONFIGURED_AGENT_RESEARCH_PUBLIC_KEY',
    depth,
    timestamp
  });
});

export default router;

function fakeTxHash(agentName: string): string {
  return `mock-${agentName.toLowerCase()}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildSubAgentPlan(input: string): Array<{ agent: string; endpoint: string; price: number }> {
  const lower = input.toLowerCase();
  const plan: Array<{ agent: string; endpoint: string; price: number }> = [
    { agent: 'Summarizer', endpoint: 'summarize', price: 0.001 },
    { agent: 'SentimentAI', endpoint: 'sentiment', price: 0.001 }
  ];

  if (lower.includes('news') || lower.includes('headline')) {
    plan.push({ agent: 'NewsDigest', endpoint: 'news', price: 0.002 });
  }

  if (lower.includes('price') || lower.includes('xlm') || lower.includes('btc') || lower.includes('eth')) {
    plan.push({ agent: 'PriceFeed', endpoint: 'price', price: 0.001 });
  }

  if (/[0-9]+\s*[+\-*/]/.test(lower)) {
    plan.push({ agent: 'MathSolver', endpoint: 'math', price: 0.002 });
  }

  return plan;
}
