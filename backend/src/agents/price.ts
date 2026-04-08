import { Router } from 'express';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';
import { buildAgentResponse } from './response.js';

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
  res.json(
    buildAgentResponse({
      res,
      agentName: AGENT_NAME,
      pricePaid: PRICE_USDC,
      data: Object.keys(filtered).length > 0 ? filtered : prices,
      agentPublicKey: env.AGENT_PRICE_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
