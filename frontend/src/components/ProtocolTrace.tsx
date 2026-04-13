'use client';

import { ProtocolTraceItem } from '../lib/types';

interface ProtocolTraceProps {
  traces: ProtocolTraceItem[];
}

export default function ProtocolTrace({ traces }: ProtocolTraceProps) {
  const ordered = [...traces].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Protocol Trace</h2>
      <div className="mt-3 max-h-[28rem] space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
        {ordered.map((trace) => (
          <article className="rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-sm" key={`${trace.step}-${trace.timestamp}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-medium text-slate-800">{trace.step}</p>
              {trace.response ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    trace.response.status === 402
                      ? 'bg-amber-100 text-amber-700'
                      : trace.response.status >= 400
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {trace.response.status}
                </span>
              ) : (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">request</span>
              )}
            </div>

            <p className="text-slate-600">
              {trace.request.method} {trace.request.url}
            </p>
            <p className="mt-1 text-slate-500">{new Date(trace.timestamp).toLocaleTimeString()}</p>

            <p className="mt-2 text-slate-500">req headers: {Object.keys(trace.request.headers).join(', ') || 'none'}</p>
            {trace.request.body ? (
              <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
                {JSON.stringify(trace.request.body, null, 2)}
              </pre>
            ) : null}

            {trace.response ? (
              <p className="mt-2 text-slate-500">
                res headers: {Object.keys(trace.response.headers).join(', ') || 'none'}
              </p>
            ) : null}

            {trace.response?.body ? (
              <div className="mt-2">
                <p className="mb-1 text-slate-500 font-medium">response body:</p>
                <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600 leading-relaxed">
                  {JSON.stringify(trace.response.body, null, 2)}
                </pre>
              </div>
            ) : null}
          </article>
        ))}
        {ordered.length === 0 ? <p className="text-slate-500">No protocol trace yet</p> : null}
      </div>
    </section>
  );
}
