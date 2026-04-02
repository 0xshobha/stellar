import { Router } from 'express';
import { env } from '../config.js';
import { createPaywall } from '../x402/middleware.js';
import { buildAgentResponse } from './response.js';

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
  res.json(
    buildAgentResponse({
      res,
      agentName: AGENT_NAME,
      pricePaid: PRICE_USDC,
      data: {
        summary: sentences.join('. ') || input.slice(0, 160)
      },
      agentPublicKey: env.AGENT_SUMMARIZER_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
