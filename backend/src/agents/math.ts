import { Parser } from 'expr-eval';
import { Router } from 'express';
import { env } from '../infra/config.js';
import { agentPaywallMiddleware } from '../payments/x402Middleware.js';
import { buildAgentResponse } from './response.js';
import { getAgentById, pickBestAgentForCapability } from '../registry/contract.js';

const mathParser = new Parser();

const router = Router();

router.post('/', agentPaywallMiddleware('math'), async (req, res) => {
  const raw = String(req.body?.input ?? '0');
  const parsedDepth = Number(req.body?.depth);
  const depth = Number.isFinite(parsedDepth) ? parsedDepth : 0;
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
    const evaluated = mathParser.parse(sanitized).evaluate();
    const n = typeof evaluated === 'number' ? evaluated : Number(evaluated);
    result = Number.isFinite(n) ? n : null;
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
