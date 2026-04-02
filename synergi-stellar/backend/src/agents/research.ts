import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';
import { x402FetchJson } from '../x402/client.js';

const router = Router();
const MAX_DEPTH = 2;

router.post('/', createPaywall(0.01, 'DeepResearch'), async (req, res) => {
  const input = String(req.body?.input ?? 'research topic');
  const depth = Number(req.body?.depth ?? 0);
  const sessionId = String(req.header('x-session-id') ?? randomUUID());
  if (depth >= MAX_DEPTH) {
    res.json({
      agent: 'DeepResearch',
      pricePaid: 0.01,
      data: {
        topic: input,
        depth,
        maxDepth: MAX_DEPTH,
        agentsUsed: [],
        totalCost: 0.01,
        result: {
          summary: 'Depth limit reached for recursive research execution.'
        }
      },
      txHash: fakeTxHash('res')
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
        `${env.BACKEND_BASE_URL}/agents/${entry.endpoint}`,
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
        txHash: String(payload.txHash ?? fakeTxHash(entry.endpoint)),
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

  res.json({
    agent: 'DeepResearch',
    pricePaid: 0.01,
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
      totalCost: Number((0.01 + subAgentCost).toFixed(6)),
      failed,
      result: aggregated
    },
    txHash: fakeTxHash('res')
  });
});

export default router;

function fakeTxHash(prefix: string): string {
  return `mock-${prefix}-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

function buildSubAgentPlan(input: string): Array<{ agent: string; endpoint: string; price: number }> {
  const lower = input.toLowerCase();
  const plan: Array<{ agent: string; endpoint: string; price: number }> = [
    { agent: 'Summarizer', endpoint: 'summarize', price: 0.001 }
  ];

  if (lower.includes('sentiment') || lower.includes('risk') || lower.includes('opinion')) {
    plan.push({ agent: 'SentimentAI', endpoint: 'sentiment', price: 0.001 });
  }

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
