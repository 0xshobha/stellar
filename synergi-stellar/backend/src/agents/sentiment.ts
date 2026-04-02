import { Router } from 'express';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';

const router = Router();
const AGENT_NAME = 'SentimentAI';
const PRICE_USDC = 0.001;

router.post('/', createPaywall(PRICE_USDC, AGENT_NAME), async (req, res) => {
  const input = String(req.body?.input ?? 'neutral');
  const depth = Number(req.body?.depth ?? 0);
  const lower = input.toLowerCase();
  const score = lower.includes('risk') || lower.includes('loss') ? -0.35 : lower.includes('growth') || lower.includes('gain') ? 0.42 : 0.05;
  const label = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    agent: AGENT_NAME,
    pricePaid: PRICE_USDC,
    data: {
      label,
      score
    },
    txHash: fakeTxHash(AGENT_NAME),
    agentPublicKey: env.AGENT_SENTIMENT_PUBLIC_KEY ?? 'UNCONFIGURED_AGENT_SENTIMENT_PUBLIC_KEY',
    depth,
    timestamp: new Date().toISOString()
  });
});

export default router;

function fakeTxHash(agentName: string): string {
  return `mock-${agentName.toLowerCase()}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
