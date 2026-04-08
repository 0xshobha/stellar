import { Router } from 'express';
import { env } from '../infra/config.js';
import { agentPaywallMiddleware } from '../payments/x402Middleware.js';
import { buildAgentResponse } from './response.js';
import { getAgentById, pickBestAgentForCapability } from '../registry/contract.js';
import { completeText } from '../infra/llm.js';

const router = Router();

/** Deterministic summary when no LLM key is set or the provider errors (keeps demos runnable). */
function extractiveFallback(input: string): string {
  const t = input.trim().replace(/\s+/g, ' ');
  if (!t.length) return 'Nothing to summarize.';
  const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => s.length > 2);
  const bullets = sentences.slice(0, 6).map((s) => `• ${s.trim()}`);
  const body =
    bullets.length > 0
      ? bullets.join('\n')
      : `• ${t.length > 600 ? `${t.slice(0, 600)}…` : t}`;
  return `Executive summary (offline — add ANTHROPIC_API_KEY or GROQ_API_KEY for LLM quality):\n${body}`;
}

router.post('/', agentPaywallMiddleware('summarize'), async (req, res) => {
  const input = String(req.body?.input ?? '').slice(0, 120_000);
  const depth = Number(req.body?.depth ?? 0);
  const regId = String(req.header('x-registry-agent') ?? '').trim();
  const meta =
    (regId ? getAgentById(regId) : null) ?? pickBestAgentForCapability('summarize', Number.MAX_VALUE);
  if (!meta) {
    res.status(503).json({ ok: false, error: { code: 'NO_AGENT', message: 'No summarizer' } });
    return;
  }

  let summary: string;
  let modelTier: 'pro' | 'fast' | 'offline' = meta.id === 'sum_pro' ? 'pro' : 'fast';
  try {
    summary = await completeText(
      `Summarize the following for an executive reader. Use bullet points if helpful. Stay factual.\n\n---\n${input}\n---`,
      meta.id === 'sum_pro' ? 1200 : 700
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary = `${extractiveFallback(input)}\n\n(LLM error: ${message})`;
    modelTier = 'offline';
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(
    buildAgentResponse({
      res,
      agentName: meta.id,
      pricePaid: meta.price,
      data: {
        summary,
        modelTier
      },
      agentPublicKey: env.AGENT_SUMMARIZER_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
