import { Router } from 'express';
import { createPaywall } from '../x402/middleware.js';

const router = Router();

router.post('/', createPaywall(0.002, 'NewsDigest'), async (req, res) => {
  const topic = String(req.body?.input ?? 'AI market updates');
  const headlines = [
    `Market update on ${topic}: liquidity remains stable`,
    `${topic}: institutional participation increasing`,
    `${topic}: short-term volatility remains elevated`
  ];

  res.json({
    agent: 'NewsDigest',
    pricePaid: 0.002,
    data: {
      topic,
      headlines
    },
    txHash: fakeTxHash('news')
  });
});

export default router;

function fakeTxHash(prefix: string): string {
  return `mock-${prefix}-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}
