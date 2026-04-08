import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config.js';
import { fetchJson } from './fetchUtil.js';

const claude = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

export async function completeText(prompt: string, maxTokens = 900): Promise<string> {
  if (claude) {
    const completion = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });
    const textParts = completion.content.filter((item) => item.type === 'text');
    return textParts.map((item) => item.text).join('\n').trim();
  }

  if (env.GROQ_API_KEY) {
    const body = await fetchJson<{
      choices?: Array<{ message?: { content?: string } }>;
    }>('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      timeoutMs: 25_000,
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq returned empty content');
    return text.trim();
  }

  throw new Error('No LLM configured: set ANTHROPIC_API_KEY or GROQ_API_KEY');
}

export async function completeJsonArray(prompt: string): Promise<string[]> {
  const raw = await completeText(`${prompt}\nReply with JSON only: a string array, e.g. ["news","sentiment"].`, 400);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array from LLM');
  return parsed.map((x) => String(x).toLowerCase().trim()).filter(Boolean);
}
