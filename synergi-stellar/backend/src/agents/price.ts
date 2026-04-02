import { Router } from 'express';
import { createPaywall } from '../x402/middleware.js';

const router = Router();

router.post('/', createPaywall(0.001, 'PriceFeed'), async (req, res) => {
  const input = String(req.body?.input ?? 'XLM BTC ETH');
  const assets = input.toUpperCase();
  const prices: Record<string, number> = {
    XLM: 0.124,
    BTC: 67100,
    ETH: 3320,
    USDC: 1
  };

  const filtered = Object.fromEntries(Object.entries(prices).filter(([symbol]) => assets.includes(symbol)));

  res.json({
    agent: 'PriceFeed',
    pricePaid: 0.001,
    data: Object.keys(filtered).length > 0 ? filtered : prices,
    txHash: fakeTxHash('price')
  });
});

export default router;

function fakeTxHash(prefix: string): string {
  return `mock-${prefix}-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}
