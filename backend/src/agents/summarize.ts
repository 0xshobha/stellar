import { Router } from 'express';
import { env } from '../infra/config.js';
import { createPaywallForEndpoint } from '../payments/x402Middleware.js';
import { buildAgentResponse } from './response.js';
import { getAgentById, pickBestAgentForCapability } from '../registry/contract.js';
import { completeText } from '../infra/llm.js';

const router = Router();

router.post('/', createPaywallForEndpoint('summarize'), async (req, res) => {
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
  try {
    summary = await completeText(
      `Summarize the following for an executive reader. Use bullet points if helpful. Stay factual.\n\n---\n${input}\n---`,
      meta.id === 'sum_pro' ? 1200 : 700
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({
      ok: false,
      error: { code: 'LLM_UNAVAILABLE', message }
    });
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(
    buildAgentResponse({
      res,
      agentName: meta.id,
      pricePaid: meta.price,
      data: {
        summary,
        modelTier: meta.id === 'sum_pro' ? 'pro' : 'fast'
      },
      agentPublicKey: env.AGENT_SUMMARIZER_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
