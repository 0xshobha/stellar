'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentCatalogItem, ApiEnvelope, RegistryCompetitionSnapshot } from '../lib/types';

interface CompetitionPanelProps {
  catalog: AgentCatalogItem[];
  contractConfigured: boolean;
}

export default function CompetitionPanel({ catalog, contractConfigured }: CompetitionPanelProps) {
  const capabilities = useMemo(() => {
    const set = new Set<string>();
    for (const a of catalog) {
      if (a.capability) set.add(a.capability.toLowerCase());
    }
    return [...set].sort();
  }, [catalog]);

  const [capability, setCapability] = useState<string>('');
  const [snapshot, setSnapshot] = useState<RegistryCompetitionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (capabilities.length === 0) {
      setCapability('');
      return;
    }
    setCapability((current) => (current && capabilities.includes(current) ? current : capabilities[0]!));
  }, [capabilities]);

  useEffect(() => {
    if (!capability) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    void fetch(`/api/registry/competition?capability=${encodeURIComponent(capability)}`)
      .then((res) => res.json() as Promise<ApiEnvelope<RegistryCompetitionSnapshot>>)
      .then((payload) => {
        if (cancelled) return;
        if (payload.ok && payload.data) {
          setSnapshot(payload.data);
          return;
        }
        setSnapshot(null);
        setError(payload.error?.message ?? 'Failed to load competition');
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshot(null);
        setError('Network error loading competition');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [capability]);

  if (capabilities.length === 0) {
    return (
      <section className="panel">
        <h2 className="text-lg font-semibold text-slate-900">Agent competition (Soroban)</h2>
        <p className="mt-2 text-sm text-slate-500">Load the catalog to see capability leaderboards.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Agent competition</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            On-chain registry ranks workers; the manager uses a separate hire score. When they agree, you are watching
            decentralized market discovery line up with autonomous execution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-600" htmlFor="cap-select">
            Capability
          </label>
          <select
            id="cap-select"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
          >
            {capabilities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {snapshot ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                snapshot.source === 'demo' ? 'bg-amber-100 text-amber-900' : 'bg-violet-100 text-violet-800'
              }`}
            >
              {snapshot.source === 'demo' ? 'Demo leaderboard' : 'Soroban RPC'}
            </span>
          ) : null}
        </div>
      </div>

      {!contractConfigured ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Configure a valid <code className="rounded bg-white/80 px-1">CONTRACT_ID</code> in the backend for on-chain
          registry reads.
        </p>
      ) : null}

      {snapshot?.contractExplorerUrl ? (
        <p className="mt-2 text-xs">
          <a
            href={snapshot.contractExplorerUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sky-700 underline decoration-sky-200 hover:text-sky-900"
          >
            Open registry contract on Stellar Expert
          </a>
          <span className="ml-1 text-slate-400">({shortId(snapshot.contractId)})</span>
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      {loading ? <p className="mt-3 text-sm text-slate-500">Loading leaderboard…</p> : null}

      {!loading && snapshot && snapshot.competitors.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No agents registered for this capability yet.</p>
      ) : null}

      {!loading && snapshot && snapshot.competitors.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Rep</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Chain score</th>
                <th className="px-3 py-2">Hire score</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.competitors.map((row) => {
                const isOracle = row.id === snapshot.sorobanDeclaredWinnerId;
                return (
                  <tr
                    key={row.id}
                    className={isOracle ? 'bg-violet-50/80' : 'border-t border-slate-100 bg-white'}
                  >
                    <td className="px-3 py-2 font-mono">{row.rankByChain}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-900">{row.id}</span>
                      <span className="ml-1 text-slate-400">/{row.endpoint}</span>
                      {isOracle ? (
                        <span className="ml-2 rounded bg-violet-200 px-1.5 py-0.5 text-[10px] font-bold text-violet-900">
                          Soroban #1
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{row.reputation}</td>
                    <td className="px-3 py-2">{row.price.toFixed(6)}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{row.chainOracleScore}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{row.engineDecisionScore}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {snapshot?.chainFormula ? (
        <details className="mt-3 text-[11px] text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-600">Scoring formulas</summary>
          <p className="mt-1 pl-1">{snapshot.chainFormula}</p>
          <p className="mt-1 pl-1">{snapshot.managerFormula}</p>
        </details>
      ) : null}
    </section>
  );
}

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
