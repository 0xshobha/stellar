import { Router } from 'express';
import { env } from '../config.js';
import { createPaywallForEndpoint } from '../x402/middleware.js';
import { buildAgentResponse } from './response.js';
import { fetchJson } from '../lib/fetchUtil.js';
import { getAgentById, pickBestAgentForCapability } from '../stellar/contract.js';

const router = Router();

const COINGECKO_IDS: Record<string, string> = {
  XLM: 'stellar',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDC: 'usd-coin',
  SOL: 'solana',
  DOGE: 'dogecoin'
};

function parseSymbols(input: string): string[] {
  const upper = input.toUpperCase();
  const found = Object.keys(COINGECKO_IDS).filter((sym) => upper.includes(sym));
  return found.length > 0 ? found : ['XLM', 'BTC', 'ETH'];
}

router.post('/', createPaywallForEndpoint('price'), async (req, res) => {
  const input = String(req.body?.input ?? 'XLM BTC ETH');
  const depth = Number(req.body?.depth ?? 0);
  const regId = String(req.header('x-registry-agent') ?? '').trim();
  const meta =
    (regId ? getAgentById(regId) : null) ?? pickBestAgentForCapability('price', Number.MAX_VALUE);
  if (!meta) {
    res.status(503).json({ ok: false, error: { code: 'NO_AGENT', message: 'No price worker' } });
    return;
  }

  const symbols = parseSymbols(input);
  const ids = [...new Set(symbols.map((s) => COINGECKO_IDS[s]).filter(Boolean))];
  const keyParam = process.env.COINGECKO_API_KEY
    ? `&x_cg_demo_api_key=${encodeURIComponent(process.env.COINGECKO_API_KEY)}`
    : '';

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd${keyParam}`;

  let prices: Record<string, number>;
  try {
    const raw = await fetchJson<Record<string, { usd?: number }>>(url, { timeoutMs: 12_000 });
    prices = {};
    for (const sym of symbols) {
      const id = COINGECKO_IDS[sym];
      const usd = id ? raw[id]?.usd : undefined;
      if (typeof usd === 'number' && Number.isFinite(usd)) {
        prices[sym] = usd;
      }
    }
    if (Object.keys(prices).length === 0) {
      throw new Error('CoinGecko returned no usable quotes');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({
      ok: false,
      error: { code: 'PRICE_FEED_FAILED', message }
    });
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(
    buildAgentResponse({
      res,
      agentName: meta.id,
      pricePaid: meta.price,
      data: {
        source: 'coingecko',
        symbols,
        pricesUsd: prices,
        asOf: new Date().toISOString()
      },
      agentPublicKey: env.AGENT_PRICE_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
