import { Router } from 'express';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';

const router = Router();
const AGENT_NAME = 'Summarizer';
const PRICE_USDC = 0.001;

router.post('/', createPaywall(PRICE_USDC, AGENT_NAME), async (req, res) => {
  const input = String(req.body?.input ?? 'No content provided');
  const depth = Number(req.body?.depth ?? 0);
  const sentences = input
    .split(/[.!?]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    agent: AGENT_NAME,
    pricePaid: PRICE_USDC,
    data: {
      summary: sentences.join('. ') || input.slice(0, 160)
    },
    txHash: fakeTxHash(AGENT_NAME),
    agentPublicKey: env.AGENT_SUMMARIZER_PUBLIC_KEY ?? 'UNCONFIGURED_AGENT_SUMMARIZER_PUBLIC_KEY',
    depth,
    timestamp: new Date().toISOString()
  });
});

export default router;

function fakeTxHash(agentName: string): string {
  return `mock-${agentName.toLowerCase()}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
