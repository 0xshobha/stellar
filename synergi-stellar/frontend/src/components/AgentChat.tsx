'use client';

import { FormEvent, useState } from 'react';
import { StreamEvent } from '../lib/types';

interface AgentChatProps {
  onSessionStart: (sessionId: string) => void;
  events: StreamEvent[];
  summary: string;
  isRunning: boolean;
  walletAddress: string | null;
}

export default function AgentChat({ onSessionStart, events, summary, isRunning, walletAddress }: AgentChatProps) {
  const [query, setQuery] = useState('Research AI market trends, run sentiment check, and provide XLM price.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!walletAddress) {
        throw new Error('Please connect your Freighter wallet first!');
      }

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as { ok: boolean; data?: { sessionId: string }; error?: { message: string } };
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? 'Failed to start session');
      }
      onSessionStart(payload.data.sessionId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const eventLines = events
    .filter((event) => ['status', 'hiring', 'step-start', 'step-complete', 'step-failed', 'recursive-paid', 'paid', 'error', 'complete'].includes(event.type))
    .slice(-12)
    .map((event, index) => {
      const prefix =
        event.type === 'error'
          ? '✕'
          : event.type === 'complete'
            ? '✓'
            : event.type === 'paid' || event.type === 'recursive-paid'
              ? '$'
              : '•';
      const message =
        typeof event.message === 'string'
          ? event.message
          : event.type === 'recursive-paid' && typeof event.source === 'string' && typeof event.agent === 'string'
            ? `${event.source} paid ${event.agent}`
          : typeof event.agent === 'string'
            ? `${event.type} · ${event.agent}`
            : event.type;
      return (
        <li key={`${event.type}-${index}`} className="flex items-start gap-2 text-xs text-slate-600">
          <span
            className={`mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full text-[10px] ${
              event.type === 'error'
                ? 'bg-rose-100 text-rose-700'
                : event.type === 'complete'
                  ? 'bg-emerald-100 text-emerald-700'
                  : event.type === 'paid' || event.type === 'recursive-paid'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-100 text-slate-600'
            }`}
          >
            {prefix}
          </span>
          <span>{message}</span>
        </li>
      );
    });

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Manager Agent Query</h2>
      <form className="mt-3 flex flex-col gap-3" onSubmit={submit}>
        <textarea
          className="soft-ring min-h-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner transition focus:border-sky-300"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="soft-ring w-fit rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:-translate-y-0.5 hover:bg-sky-700 disabled:opacity-60"
          disabled={loading || isRunning}
          type="submit"
        >
          {loading ? 'Submitting...' : isRunning ? 'Running...' : 'Run Manager'}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-700">Live Execution</p>
        <ul className="mt-2 space-y-1">{eventLines.length ? eventLines : <li className="text-xs text-slate-500">Waiting for session events</li>}</ul>
      </div>

      {summary ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          {summary}
        </div>
      ) : null}
    </section>
  );
}
