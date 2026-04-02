import { Router } from 'express';
import { createPaywall } from '../x402/middleware.js';

const router = Router();

router.post('/', createPaywall(0.001, 'SentimentAI'), async (req, res) => {
  const input = String(req.body?.input ?? 'neutral');
  const lower = input.toLowerCase();
  const score = lower.includes('risk') || lower.includes('loss') ? -0.35 : lower.includes('growth') || lower.includes('gain') ? 0.42 : 0.05;
  const label = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

  res.json({
    agent: 'SentimentAI',
    pricePaid: 0.001,
    data: {
      label,
      score
    },
    txHash: fakeTxHash('sent')
  });
});

export default router;

function fakeTxHash(prefix: string): string {
  return `mock-${prefix}-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}
