'use client';

import { PaymentRecord } from '../lib/types';

interface TransactionLogProps {
  transactions: PaymentRecord[];
}

export default function TransactionLog({ transactions }: TransactionLogProps) {
  const sorted = [...transactions].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Transaction Log</h2>
      <div className="mt-3 space-y-2 text-sm">
        {sorted.map((item) => {
          const isSimulated = item.txHash.startsWith('fallback-') || item.txHash.startsWith('mock-');
          return (
            <article className="rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md" key={item.id}>
            <div className="flex items-center justify-between">
              <p className="text-slate-800">
                <span className="font-medium">{item.from}</span>
                <span className="mx-1 text-slate-400">→</span>
                <span className="font-medium">{item.to}</span>
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] ${item.depth > 1 ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}
                >
                  {item.depth > 1 ? `recursive d${item.depth}` : 'direct d1'}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    isSimulated ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isSimulated ? 'simulated' : 'settled'}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-700">{item.amount.toFixed(6)} USDC</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(item.timestamp).toLocaleString()}</p>
            <a className="mt-1 inline-block text-sky-700 underline decoration-sky-300" href={item.explorerUrl} rel="noreferrer" target="_blank">
              {item.txHash}
            </a>
            </article>
          );
        })}
        {sorted.length === 0 ? <p className="text-slate-400">No payments yet</p> : null}
      </div>
    </section>
  );
}
