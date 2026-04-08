'use client';

import { AgentCatalogItem } from '../lib/types';

interface AgentCatalogProps {
  catalog: AgentCatalogItem[];
}

export default function AgentCatalog({ catalog }: AgentCatalogProps) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Agent Catalog</h2>
      <div className="mt-3 space-y-2">
        {catalog.map((item) => (
          <article className="rounded-xl border border-slate-200 bg-white p-3 text-sm transition hover:-translate-y-0.5 hover:shadow-md" key={item.id}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-slate-900">
                <span className="font-mono text-xs text-slate-500">{item.id}</span>
                <span className="ml-2 text-slate-900">{item.plannerRole}</span>
              </p>
              <div className="flex items-center gap-2">
                <p>{item.price.toFixed(6)} USDC</p>
                {item.recursive ? <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">recursive</span> : null}
              </div>
            </div>
            <p className="text-slate-700">Reputation: {(item.reputation / 100).toFixed(1)}%</p>
            <p className="text-slate-500">
              Capability: {item.capability} · /agents/{item.endpoint}
            </p>
            <p className="text-slate-600">{item.capabilities.join(', ')}</p>
            <p className="text-slate-500">
              Jobs: {item.jobsCompleted} success / {item.jobsFailed} failed
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
