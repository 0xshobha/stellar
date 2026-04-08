import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { env } from '../infra/config.js';
import { createPaywallForEndpoint } from '../payments/x402Middleware.js';
import { x402FetchJson } from '../payments/x402Client.js';
import { buildAgentResponse } from './response.js';
import { getAgentById, pickBestAgentForCapability } from '../registry/contract.js';
import { completeJsonArray } from '../infra/llm.js';

const router = Router();
const MAX_DEPTH = 3;

function getBackendBaseUrl(): string {
  return process.env.RUNTIME_BACKEND_BASE_URL || env.BACKEND_BASE_URL;
}

const ALLOWED_CAPS = new Set(['news', 'sentiment', 'price', 'summarize', 'math']);

function heuristicCaps(topic: string): string[] {
  const t = topic.toLowerCase();
  const out: string[] = [];
  if (/news|headline|breaking|market|stock|crypto|fed|rate/i.test(t)) out.push('news');
  if (/sentiment|tone|risk|bull|bear|fear|greed/i.test(t)) out.push('sentiment');
  if (/price|\$|btc|eth|xlm|sol/i.test(t)) out.push('price');
  if (/math|calculate|%|\d+\s*[\+\-\*\/]/i.test(t)) out.push('math');
  out.push('summarize');
  return [...new Set(out)];
}

async function planCaps(topic: string): Promise<string[]> {
  try {
    const llmCaps = await completeJsonArray(
      `Given the research topic, pick 1-4 capability names from: news, sentiment, price, summarize, math.\nTopic: ${topic.slice(0, 500)}`
    );
    const filtered = llmCaps.filter((c) => ALLOWED_CAPS.has(c));
    if (filtered.length > 0) return [...new Set(filtered)];
  } catch {
    // heuristic
  }
  return heuristicCaps(topic);
}

router.post('/', createPaywallForEndpoint('research'), async (req, res) => {
  const input = String(req.body?.input ?? 'research topic');
  const depth = Number(req.body?.depth ?? 0);
  const sessionId = String(req.header('x-session-id') ?? randomUUID());
  const regId = String(req.header('x-registry-agent') ?? '').trim();
  const meta =
    (regId ? getAgentById(regId) : null) ?? pickBestAgentForCapability('research', Number.MAX_VALUE);
  if (!meta) {
    res.status(503).json({ ok: false, error: { code: 'NO_AGENT', message: 'No research worker' } });
    return;
  }

  if (depth >= MAX_DEPTH) {
    res.status(400).json({
      ok: false,
      error: { code: 'DEPTH_LIMIT', message: `Max research depth ${MAX_DEPTH}` }
    });
    return;
  }

  const caps = await planCaps(input);
  const subResults: Record<string, unknown> = {};
  const subTransactions: Array<{
    agent: string;
    txHash: string;
    pricePaid: number;
    from?: string;
    depth?: number;
  }> = [];

  await Promise.all(
    caps.map(async (cap) => {
      const worker = pickBestAgentForCapability(cap, Number.MAX_VALUE);
      if (!worker) return;
      const endpoint = worker.endpoint;
      const url = `${getBackendBaseUrl()}/agents/${endpoint}`;
      try {
        const response = await x402FetchJson<{
          data?: Record<string, unknown>;
          txHash?: string;
          pricePaid?: number;
          agent?: string;
        }>(
          sessionId,
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-session-id': sessionId,
              'x-parent-agent': meta.id,
              'x-registry-agent': worker.id
            },
            body: JSON.stringify({ input, depth: depth + 1 })
          },
          {
            retries: 2,
            timeoutMs: 5_000,
            agentName: worker.id
          }
        );

        const payload = response.data;
        subResults[worker.id] = payload.data ?? payload;
        subTransactions.push({
          agent: worker.id,
          txHash: typeof payload.txHash === 'string' ? payload.txHash : `unsettled-${randomUUID().slice(0, 8)}`,
          pricePaid: Number(payload.pricePaid ?? worker.price),
          from: meta.id,
          depth: depth + 1
        });
      } catch (error) {
        subResults[worker.id] = {
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );

  let totalSub = 0;
  for (const st of subTransactions) {
    totalSub += st.pricePaid;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(
    buildAgentResponse({
      res,
      agentName: meta.id,
      pricePaid: meta.price,
      data: {
        topic: input,
        depth,
        maxDepth: MAX_DEPTH,
        capabilitiesInvoked: caps,
        agentsUsed: subTransactions.map((s) => s.agent),
        subTransactions,
        totalCost: Number((meta.price + totalSub).toFixed(6)),
        result: subResults
      },
      agentPublicKey: env.AGENT_RESEARCH_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
