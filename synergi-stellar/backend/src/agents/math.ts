import { Router } from 'express';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';

const router = Router();
const AGENT_NAME = 'MathSolver';
const PRICE_USDC = 0.002;

router.post('/', createPaywall(PRICE_USDC, AGENT_NAME), async (req, res) => {
  const raw = String(req.body?.input ?? '0');
  const depth = Number(req.body?.depth ?? 0);
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
  res.json({
    agent: AGENT_NAME,
    pricePaid: PRICE_USDC,
    data: {
      expression: raw,
      result,
      error
    },
    txHash: fakeTxHash(AGENT_NAME),
    agentPublicKey: env.AGENT_MATH_PUBLIC_KEY ?? 'UNCONFIGURED_AGENT_MATH_PUBLIC_KEY',
    depth,
    timestamp: new Date().toISOString()
  });
});

export default router;

function fakeTxHash(agentName: string): string {
  return `mock-${agentName.toLowerCase()}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
