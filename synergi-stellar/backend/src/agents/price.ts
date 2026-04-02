import { Router } from 'express';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';

const router = Router();
const AGENT_NAME = 'PriceFeed';
const PRICE_USDC = 0.001;

router.post('/', createPaywall(PRICE_USDC, AGENT_NAME), async (req, res) => {
  const input = String(req.body?.input ?? 'XLM BTC ETH');
  const depth = Number(req.body?.depth ?? 0);
  const assets = input.toUpperCase();
  const prices: Record<string, number> = {
    XLM: 0.124,
    BTC: 67100,
    ETH: 3320,
    USDC: 1
  };

  const filtered = Object.fromEntries(Object.entries(prices).filter(([symbol]) => assets.includes(symbol)));

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    agent: AGENT_NAME,
    pricePaid: PRICE_USDC,
    data: Object.keys(filtered).length > 0 ? filtered : prices,
    txHash: fakeTxHash(AGENT_NAME),
    agentPublicKey: env.AGENT_PRICE_PUBLIC_KEY ?? 'UNCONFIGURED_AGENT_PRICE_PUBLIC_KEY',
    depth,
    timestamp: new Date().toISOString()
  });
});

export default router;

function fakeTxHash(agentName: string): string {
  return `mock-${agentName.toLowerCase()}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
