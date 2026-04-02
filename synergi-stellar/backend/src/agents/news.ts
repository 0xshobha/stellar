import { Router } from 'express';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';
import { buildAgentResponse } from './response.js';

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
  res.json(
    buildAgentResponse({
      res,
      agentName: AGENT_NAME,
      pricePaid: PRICE_USDC,
      data: {
        topic,
        headlines
      },
      agentPublicKey: env.AGENT_NEWS_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
