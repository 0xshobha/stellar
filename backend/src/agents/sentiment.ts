import { Router } from 'express';
import { env } from '../config.js';
import { createPaywallForEndpoint } from '../x402/middleware.js';
import { buildAgentResponse } from './response.js';
import { getAgentById, pickBestAgentForCapability } from '../stellar/contract.js';
import { fetchJson } from '../lib/fetchUtil.js';

const router = Router();

const POS = new Set(
  'great excellent good strong growth gain profit win success bullish upside opportunity resilient solid beat rally surge'.split(
    /\s+/
  )
);
const NEG = new Set(
  'bad terrible loss risk crash bearish decline weak fail lawsuit fraud hack exploit downside concern fear crisis cut layoff'.split(
    /\s+/
  )
);

function lexiconScore(text: string): { score: number; label: string; method: string } {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let pos = 0;
  let neg = 0;
  for (const t of tokens) {
    if (POS.has(t)) pos += 1;
    if (NEG.has(t)) neg += 1;
  }
  const raw = tokens.length > 0 ? (pos - neg) / Math.sqrt(tokens.length + 4) : 0;
  const score = Math.max(-1, Math.min(1, raw));
  const label = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';
  return { score, label, method: 'lexicon' };
}

router.post('/', createPaywallForEndpoint('sentiment'), async (req, res) => {
  const input = String(req.body?.input ?? '').slice(0, 8000);
  const depth = Number(req.body?.depth ?? 0);
  const regId = String(req.header('x-registry-agent') ?? '').trim();
  const meta =
    (regId ? getAgentById(regId) : null) ?? pickBestAgentForCapability('sentiment', Number.MAX_VALUE);
  if (!meta) {
    res.status(503).json({ ok: false, error: { code: 'NO_AGENT', message: 'No sentiment worker' } });
    return;
  }

  let result = lexiconScore(input);

  if (meta.id === 'sen_nlp' && process.env.HUGGINGFACE_API_TOKEN) {
    try {
      const hf = await fetchJson<Array<{ label?: string; score?: number }>>(
        'https://api-inference.huggingface.co/models/cardiffnlp/twitter-roberta-base-sentiment-latest',
        {
          method: 'POST',
          timeoutMs: 20_000,
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ inputs: input.slice(0, 2000) })
        }
      );
      const top = Array.isArray(hf) ? hf[0] : undefined;
      if (top?.label && typeof top.score === 'number') {
        const labelMap: Record<string, string> = {
          LABEL_0: 'negative',
          LABEL_1: 'neutral',
          LABEL_2: 'positive',
          negative: 'negative',
          neutral: 'neutral',
          positive: 'positive'
        };
        const label = labelMap[top.label] ?? top.label.toLowerCase();
        const score =
          label === 'positive' ? top.score : label === 'negative' ? -top.score : top.score - 0.5;
        result = { score: Math.max(-1, Math.min(1, score)), label, method: 'huggingface' };
      }
    } catch {
      // keep lexicon
    }
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(
    buildAgentResponse({
      res,
      agentName: meta.id,
      pricePaid: meta.price,
      data: {
        ...result,
        tokensSampled: Math.min(input.length, 8000)
      },
      agentPublicKey: env.AGENT_SENTIMENT_PUBLIC_KEY,
      depth
    })
  );
});

export default router;
