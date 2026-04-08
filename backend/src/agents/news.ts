import { Router } from 'express';
import { env } from '../infra/config.js';
import { createPaywallForEndpoint } from '../payments/x402Middleware.js';
import { buildAgentResponse } from './response.js';
import { fetchJson } from '../infra/fetchUtil.js';
import { getAgentById, pickBestAgentForCapability } from '../registry/contract.js';

const router = Router();

interface HnHit {
  title?: string;
  url?: string;
  objectID?: string;
}

router.post('/', createPaywallForEndpoint('news'), async (req, res) => {
  const topic = String(req.body?.input ?? 'technology').slice(0, 200);
  const depth = Number(req.body?.depth ?? 0);
  const regId = String(req.header('x-registry-agent') ?? '').trim();
  const meta =
    (regId ? getAgentById(regId) : null) ?? pickBestAgentForCapability('news', Number.MAX_VALUE);
  if (!meta) {
    res.status(503).json({ ok: false, error: { code: 'NO_AGENT', message: 'No news worker' } });
    return;
  }

  type Article = { title: string; url?: string; source: string };

  const articles: Article[] = [];

  try {
    if (process.env.NEWS_API_KEY) {
      const q = encodeURIComponent(topic);
      const url = `https://newsapi.org/v2/everything?q=${q}&pageSize=10&sortBy=publishedAt&language=en&apiKey=${encodeURIComponent(process.env.NEWS_API_KEY)}`;
      const body = await fetchJson<{
        articles?: Array<{ title?: string; url?: string; source?: { name?: string } }>;
      }>(url, { timeoutMs: 15_000 });
      for (const a of body.articles ?? []) {
        if (a.title) {
          articles.push({
            title: a.title,
            url: a.url,
            source: a.source?.name ?? 'newsapi'
          });
        }
      }
    }
  } catch {
    // fall through to HN
  }

  if (articles.length === 0) {
    try {
      const q = encodeURIComponent(topic);
      const url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=12&query=${q}`;
      const body = await fetchJson<{ hits?: HnHit[] }>(url, { timeoutMs: 12_000 });
      for (const h of body.hits ?? []) {
        if (h.title) {
          articles.push({
            title: h.title,
            url: h.url,
            source: 'hackernews'
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({
        ok: false,
        error: { code: 'NEWS_FETCH_FAILED', message }
      });
      return;
    }
  }

  if (articles.length === 0) {
    res.status(502).json({
      ok: false,
      error: { code: 'NEWS_EMPTY', message: 'No articles found for topic' }
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
        topic,
        articles,
        count: articles.length
      },
      agentPublicKey: env.AGENT_NEWS_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
