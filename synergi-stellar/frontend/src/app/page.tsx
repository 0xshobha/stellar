'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AgentCatalog from '../components/AgentCatalog';
import AgentChat from '../components/AgentChat';
import ProtocolTrace from '../components/ProtocolTrace';
import TopologyGraph from '../components/TopologyGraph';
import TransactionLog from '../components/TransactionLog';
import { AgentCatalogItem, ApiEnvelope, SessionStatus, StreamEvent } from '../lib/types';

type LatestDoc = {
  slug: string;
  title: string;
  updatedAt: string;
};

function formatUpdatedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [catalog, setCatalog] = useState<AgentCatalogItem[]>([]);
  const [latestDocs, setLatestDocs] = useState<LatestDoc[]>([]);
  const [statusSnapshot, setStatusSnapshot] = useState<SessionStatus | null>(null);

  useEffect(() => {
    void fetch('/api/agents/catalog')
      .then((res) => res.json())
      .then((payload: ApiEnvelope<{ items: AgentCatalogItem[] }>) => {
        if (payload.ok && payload.data) {
          setCatalog(payload.data.items);
          return;
        }
        setCatalog([]);
      })
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    void fetch('/api/docs/latest')
      .then((res) => res.json())
      .then((payload: ApiEnvelope<{ items: LatestDoc[] }>) => {
        if (payload.ok && payload.data) {
          setLatestDocs(payload.data.items);
          return;
        }
        setLatestDocs([]);
      })
      .catch(() => setLatestDocs([]));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setEvents([]);
    setStatusSnapshot(null);

    const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';
    const source = new EventSource(`${backend}/api/events/${sessionId}`);

    source.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data) as Record<string, unknown>;
        const parsed: StreamEvent = {
          type: typeof raw.type === 'string' ? raw.type : 'unknown',
          ...raw
        };
        setEvents((current) => [...current, parsed]);
      } catch {
        setEvents((current) => [...current, { type: 'parse-error', raw: event.data }]);
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    let active = true;
    const poll = async () => {
      const response = await fetch(`/api/status/${sessionId}`);
      const payload = (await response.json()) as ApiEnvelope<SessionStatus>;
      if (!active) return;
      if (payload.ok && payload.data) {
        setStatusSnapshot(payload.data);
      }
    };

    const handle = setInterval(() => {
      void poll();
    }, 1200);
    void poll();

    return () => {
      active = false;
      clearInterval(handle);
    };
  }, [sessionId]);

  const totalPaid = useMemo(() => {
    return Number(statusSnapshot?.metrics.totalSpend ?? 0).toFixed(6);
  }, [statusSnapshot]);

  const isRunning = Boolean(sessionId && !statusSnapshot?.complete);

  return (
    <main className="mx-auto max-w-7xl pb-8">
      <header className="playful-border subtle-grid mb-6 rounded-2xl border border-sky-100 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">SynergiStellar Dashboard</h1>
            <p className="text-sm text-slate-600">x402 autonomous agent economy on Stellar</p>
          </div>
          <span className="glass-chip w-fit">Live Demo Mode</span>
        </div>
        <p className="mt-2 text-sm text-slate-700">Payment volume: {totalPaid} USDC</p>
        <p className="text-xs text-slate-500">
          {statusSnapshot
            ? `Steps ${statusSnapshot.completedSteps}/${statusSnapshot.totalSteps} · Transactions ${statusSnapshot.metrics.transactionCount}`
            : 'No active session'}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgentChat
          onSessionStart={setSessionId}
          events={events}
          summary={statusSnapshot?.summary ?? ''}
          isRunning={isRunning}
        />
        <AgentCatalog catalog={catalog} />
        <TopologyGraph events={events} />
        <TransactionLog transactions={statusSnapshot?.transactions ?? []} />
      </div>

      <section className="panel mt-4 p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Latest Docs</h2>
          <Link
            href="/docs"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700"
          >
            View all docs
          </Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {latestDocs.map((doc) => (
            <Link
              key={doc.slug}
              href={`/docs/${doc.slug}`}
              className="group rounded-xl border border-slate-200 bg-white p-3 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
            >
              <div className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                Updated recently · {formatUpdatedDate(doc.updatedAt)}
              </div>
              <p className="font-medium text-slate-900">{doc.title}</p>
              <p className="mt-1 text-xs text-indigo-600 transition-transform duration-200 group-hover:translate-x-0.5">
                Open doc →
              </p>
            </Link>
          ))}
          {!latestDocs.length && <p className="text-sm text-slate-500">No docs found.</p>}
        </div>
      </section>

      <div className="mt-4">
        <ProtocolTrace traces={statusSnapshot?.protocolTrace ?? []} />
      </div>
    </main>
  );
}
