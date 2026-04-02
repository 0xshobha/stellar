import { Router } from 'express';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';

const router = Router();
const AGENT_NAME = 'NewsDigest';
const PRICE_USDC = 0.002;

router.post('/', createPaywall(PRICE_USDC, AGENT_NAME), async (req, res) => {
  const topic = String(req.body?.input ?? 'AI market updates');
  const depth = Number(req.body?.depth ?? 0);
  const headlines = [
    `Market update on ${topic}: liquidity remains stable`,
    `${topic}: institutional participation increasing`,
    `${topic}: short-term volatility remains elevated`
  ];

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    agent: AGENT_NAME,
    pricePaid: PRICE_USDC,
    data: {
      topic,
      headlines
    },
    txHash: fakeTxHash(AGENT_NAME),
    agentPublicKey: env.AGENT_NEWS_PUBLIC_KEY ?? 'UNCONFIGURED_AGENT_NEWS_PUBLIC_KEY',
    depth,
    timestamp: new Date().toISOString()
  });
});

export default router;

function fakeTxHash(agentName: string): string {
  return `mock-${agentName.toLowerCase()}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
