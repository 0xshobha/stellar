import { Router } from 'express';
import { createPaywall } from '../x402/middleware.js';

const router = Router();

router.post('/', createPaywall(0.001, 'Summarizer'), async (req, res) => {
  const input = String(req.body?.input ?? 'No content provided');
  const sentences = input
    .split(/[.!?]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  res.json({
    agent: 'Summarizer',
    pricePaid: 0.001,
    data: {
      summary: sentences.join('. ') || input.slice(0, 160)
    },
    txHash: fakeTxHash('sum')
  });
});

export default router;

function fakeTxHash(prefix: string): string {
  return `mock-${prefix}-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}
