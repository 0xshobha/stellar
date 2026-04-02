import { Router } from 'express';
import { createPaywall } from '../x402/middleware.js';

const router = Router();

router.post('/', createPaywall(0.002, 'MathSolver'), async (req, res) => {
  const raw = String(req.body?.input ?? '0');
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

  res.json({
    agent: 'MathSolver',
    pricePaid: 0.002,
    data: {
      expression: raw,
      result,
      error
    },
    txHash: fakeTxHash('math')
  });
});

export default router;

function fakeTxHash(prefix: string): string {
  return `mock-${prefix}-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}
