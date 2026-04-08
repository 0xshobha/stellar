import { Router } from 'express';
import { env } from '../config.js';
import { createPaywallForEndpoint } from '../x402/middleware.js';
import { buildAgentResponse } from './response.js';
import { getAgentById, pickBestAgentForCapability } from '../stellar/contract.js';

const router = Router();

router.post('/', createPaywallForEndpoint('math'), async (req, res) => {
  const raw = String(req.body?.input ?? '0');
  const depth = Number(req.body?.depth ?? 0);
  const regId = String(req.header('x-registry-agent') ?? '').trim();
  const meta =
    (regId ? getAgentById(regId) : null) ?? pickBestAgentForCapability('math', Number.MAX_VALUE);
  if (!meta) {
    res.status(503).json({ ok: false, error: { code: 'NO_AGENT', message: 'No math worker' } });
    return;
  }

  const sanitized = raw.replace(/[^\d+\-*/().\s]/g, '');
  let result: number | null = null;
  let error: string | null = null;

  try {
    const fn = new Function(`return (${sanitized});`);
    const evaluated = Number(fn());
    result = Number.isFinite(evaluated) ? evaluated : null;
    if (result === null) error = 'Expression did not evaluate to a finite number';
  } catch {
    error = 'Invalid expression';
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(
    buildAgentResponse({
      res,
      agentName: meta.id,
      pricePaid: meta.price,
      data: {
        expression: raw,
        result,
        error
      },
      agentPublicKey: env.AGENT_MATH_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
