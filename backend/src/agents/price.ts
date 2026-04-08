import { Router, type Response } from 'express';
import { env } from '../infra/config.js';
import { logInfo, logWarn } from '../infra/logger.js';
import { createPaywallForEndpoint } from '../payments/x402Middleware.js';
import { buildAgentResponse, getPaymentTxHashFromResponse } from './response.js';
import { fetchJson } from '../infra/fetchUtil.js';
import { getAgentById, pickBestAgentForCapability } from '../registry/contract.js';

const router = Router();

/** CoinGecko `ids` query values (documented slugs), not market prices. */
const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  XLM: 'stellar'
} as const;

const COINGECKO_SIMPLE_PRICE = 'https://api.coingecko.com/api/v3/simple/price';
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 12_000;

function buildCoingeckoUrl(): string {
  const ids = [COINGECKO_IDS.BTC, COINGECKO_IDS.ETH, COINGECKO_IDS.XLM].join(',');
  const params = new URLSearchParams({
    ids,
    vs_currencies: 'usd'
  });
  const key = process.env.COINGECKO_API_KEY?.trim();
  if (key) {
    params.set('x_cg_demo_api_key', key);
  }
  return `${COINGECKO_SIMPLE_PRICE}?${params.toString()}`;
}

type CoingeckoSimplePriceResponse = Record<string, { usd?: number } | undefined>;

function parseBtcEthXlm(raw: CoingeckoSimplePriceResponse): { BTC: number; ETH: number; XLM: number } {
  const btc = raw[COINGECKO_IDS.BTC]?.usd;
  const eth = raw[COINGECKO_IDS.ETH]?.usd;
  const xlm = raw[COINGECKO_IDS.XLM]?.usd;
  if (typeof btc !== 'number' || !Number.isFinite(btc)) {
    throw new Error('Invalid or missing BTC/usd from CoinGecko');
  }
  if (typeof eth !== 'number' || !Number.isFinite(eth)) {
    throw new Error('Invalid or missing ETH/usd from CoinGecko');
  }
  if (typeof xlm !== 'number' || !Number.isFinite(xlm)) {
    throw new Error('Invalid or missing XLM/usd from CoinGecko');
  }
  return { BTC: btc, ETH: eth, XLM: xlm };
}

async function fetchBtcEthXlmWithRetries(url: string): Promise<{ BTC: number; ETH: number; XLM: number }> {
  let lastError: Error = new Error('CoinGecko request not attempted');
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const raw = await fetchJson<CoingeckoSimplePriceResponse>(url, { timeoutMs: REQUEST_TIMEOUT_MS });
      const prices = parseBtcEthXlm(raw);
      logInfo('PriceFeed prices fetched from CoinGecko', {
        attempt: attempt + 1,
        retriesRemaining: MAX_RETRIES - attempt,
        BTC: prices.BTC,
        ETH: prices.ETH,
        XLM: prices.XLM
      });
      return prices;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logWarn('PriceFeed CoinGecko request failed', {
        attempt: attempt + 1,
        maxAttempts: MAX_RETRIES + 1,
        message: lastError.message
      });
      if (attempt === MAX_RETRIES) {
        throw lastError;
      }
    }
  }
  throw lastError;
}

function logPaymentLine(res: Response, registryId: string, amountUsdc: number): void {
  const settledTx = getPaymentTxHashFromResponse(res);
  logInfo('PriceFeed x402 payment accepted', {
    registryId,
    amountUsdc,
    txHash: settledTx ?? null,
    settled: Boolean(settledTx)
  });
}

router.post('/', createPaywallForEndpoint('price'), async (req, res) => {
  const depth = Number(req.body?.depth ?? 0);
  const regId = String(req.header('x-registry-agent') ?? '').trim();
  const meta =
    (regId ? getAgentById(regId) : null) ?? pickBestAgentForCapability('price', Number.MAX_VALUE);
  if (!meta) {
    res.status(503).json({ ok: false, error: { code: 'NO_AGENT', message: 'No price worker' } });
    return;
  }

  logPaymentLine(res, meta.id, meta.price);

  const url = buildCoingeckoUrl();

  let data: { BTC: number; ETH: number; XLM: number };
  try {
    data = await fetchBtcEthXlmWithRetries(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn('PriceFeed CoinGecko exhausted retries', { message, attempts: MAX_RETRIES + 1 });
    res.status(502).json({
      ok: false,
      error: { code: 'PRICE_FEED_FAILED', message }
    });
    return;
  }

  const envelope = buildAgentResponse({
    res,
    agentName: 'PriceFeed',
    pricePaid: meta.price,
    data,
    agentPublicKey: env.AGENT_PRICE_PUBLIC_KEY,
    depth
  });

  const txHash = envelope.txHash;
  logInfo('PriceFeed response ready', {
    source: 'coingecko',
    txHash,
    pricePaid: envelope.pricePaid
  });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    ...envelope,
    source: 'coingecko'
  });
});

export default router;
