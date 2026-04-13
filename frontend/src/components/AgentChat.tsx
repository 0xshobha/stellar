'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import * as freighter from '@stellar/freighter-api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StreamEvent } from '../lib/types';

function envRequiresManagerXlm(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_MANAGER_XLM === '1';
}

function envWantsSkipManagerXlm(): boolean {
  const v = process.env.NEXT_PUBLIC_SKIP_MANAGER_XLM?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'yes';
}

function computeSkipManagerXlm(): boolean {
  if (envRequiresManagerXlm()) return false;
  if (envWantsSkipManagerXlm()) return true;
  return false;
}

function isNetworkFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return m === 'failed to fetch' || m.includes('networkerror') || err.name === 'TypeError';
}

async function postAppJson<T>(
  path: string,
  body: unknown,
  step: string
): Promise<{ ok: boolean; data?: T; error?: { message?: string; hint?: string } }> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
  } catch (err) {
    if (isNetworkFetchError(err)) {
      throw new Error(
        `${step}: could not reach the app (network error). If you use the hosted site, set NEXT_PUBLIC_BACKEND_URL in Vercel to your live API and redeploy. Locally run \`npm run dev\` from the repo root so port 4000 is up.`
      );
    }
    throw err instanceof Error ? new Error(`${step}: ${err.message}`) : err;
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new Error(
      `${step}: bad response (${res.status}). Is the Next.js API route proxy working? Check the Network tab for ${path}.`
    );
  }

  return parsed as { ok: boolean; data?: T; error?: { message?: string; hint?: string } };
}

interface AgentChatProps {
  onSessionStart: (sessionId: string) => void;
  events: StreamEvent[];
  summary: string;
  isRunning: boolean;
  walletAddress: string | null;
}

const PRESET_QUERIES = [
  'AI payment trends + sentiment + summary',
  'Research crypto market, get prices, summarize',
  'Analyze XLM ecosystem news + sentiment',
  'Deep research: DeFi agent economies'
] as const;

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function AgentChat({ onSessionStart, events, summary, isRunning, walletAddress }: AgentChatProps) {
  const [query, setQuery] = useState('Research AI market trends, run sentiment check, and provide XLM price.');
  const [paymentAmount, setPaymentAmount] = useState<string>('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialPayment, setInitialPayment] = useState<{ txHash: string; explorerUrl: string } | null>(null);
  const [xlmSkipped, setXlmSkipped] = useState(computeSkipManagerXlm);

  useEffect(() => {
    setXlmSkipped(computeSkipManagerXlm());
  }, []);

  const runSubmit = useCallback(async (queryToRun: string) => {
    setLoading(true);
    setError(null);
    setInitialPayment(null);

    try {
      if (!xlmSkipped && !walletAddress) {
        throw new Error('Please connect your Freighter wallet first!');
      }

      if (!xlmSkipped) {
        const amountValue = Number(paymentAmount);
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          throw new Error('Enter a valid XLM amount greater than 0.');
        }

        const prepared = await postAppJson<{ xdr: string; networkPassphrase: string }>(
          '/api/payments/prepare',
          {
            from: walletAddress,
            amount: amountValue,
            memo: 'Stellar Net'
          },
          'Prepare XLM payment'
        );

        if (!prepared.ok || !prepared.data) {
          const hint = prepared.error?.hint ? ` ${prepared.error.hint}` : '';
          throw new Error(
            (prepared.error?.message ?? 'Failed to prepare payment transaction') + hint
          );
        }

        let signResult: unknown;
        try {
          signResult = await freighter.signTransaction(prepared.data.xdr, {
            networkPassphrase: prepared.data.networkPassphrase
          });
        } catch (fe) {
          const raw = fe instanceof Error ? fe.message : String(fe);
          throw new Error(
            `Freighter signing failed (${raw}). Unlock Freighter, select Stellar testnet, and approve the signing request.`
          );
        }

        const signedXdr =
          typeof signResult === 'string'
            ? signResult
            : (signResult as { signedTxXdr?: string; error?: { message?: string } }).signedTxXdr;

        if (!signedXdr || signedXdr.length < 20) {
          const signError =
            typeof signResult === 'object' && signResult && 'error' in signResult
              ? (signResult as { error?: { message?: string } }).error?.message
              : undefined;
          throw new Error(signError ?? 'Freighter did not return a valid signed transaction.');
        }

        const submitted = await postAppJson<{ txHash: string; explorerUrl?: string }>(
          '/api/payments/submit',
          {
            signedXdr,
            fromLabel: walletAddress
          },
          'Submit XLM payment'
        );

        if (!submitted.ok || !submitted.data) {
          const hint = submitted.error?.hint ? ` ${submitted.error.hint}` : '';
          throw new Error((submitted.error?.message ?? 'Failed to submit payment transaction') + hint);
        }

        const explorerUrl =
          submitted.data.explorerUrl && submitted.data.explorerUrl.includes('/tx/')
            ? submitted.data.explorerUrl
            : `https://stellar.expert/explorer/testnet/tx/${submitted.data.txHash}`;

        setInitialPayment({
          txHash: submitted.data.txHash,
          explorerUrl
        });
      }

      const payload = await postAppJson<{ sessionId: string }>(
        '/api/query',
        { query: queryToRun },
        'Start manager session'
      );

      if (!payload.ok || !payload.data) {
        const hint = payload.error?.hint ? ` ${payload.error.hint}` : '';
        throw new Error((payload.error?.message ?? 'Failed to start session') + hint);
      }
      onSessionStart(payload.data.sessionId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [onSessionStart, paymentAmount, walletAddress, xlmSkipped]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await runSubmit(query);
  };

  const progress = useMemo(() => {
    let completed = 0;
    let total = 0;
    for (const event of events) {
      if (event.type === 'plan' && Array.isArray(event.steps)) {
        total = event.steps.length;
      }
      const completedFromEvent = readNumber(event.completedSteps) ?? readNumber(event.step);
      const totalFromEvent = readNumber(event.totalSteps);
      if (completedFromEvent !== null) completed = Math.max(completed, completedFromEvent);
      if (totalFromEvent !== null) total = Math.max(total, totalFromEvent);
    }
    return {
      completed,
      total,
      ratio: total > 0 ? Math.min(100, (completed / total) * 100) : 0
    };
  }, [events]);

  const eventLines = events
    .filter((event) =>
      [
        'status',
        'hiring',
        'step-start',
        'step-complete',
        'step-failed',
        'recursive-paid',
        'paid',
        'error',
        'complete',
        'engine-decision',
        'plan'
      ].includes(event.type)
    )
    .slice(-20)
    .map((event, index) => {
      const amount = readNumber(event.amount) ?? readNumber(event.pricePaid) ?? 0;
      const txHash = readString(event.txHash);
      const agent = readString(event.agent);
      const source = readString(event.source);
      const message = readString(event.message);
      const chosenAgentId = readString(event.chosenAgentId);
      const engineScore = readNumber(event.engineScore);
      const candidates = readNumber(event.candidatesConsidered);
      const totalSpend = readNumber(event.totalSpend);
      const agentsUsed = Array.isArray(event.agentsUsed) ? event.agentsUsed.filter((item): item is string => typeof item === 'string') : [];

      const prefix =
        event.type === 'error'
          ? '✕'
          : event.type === 'complete'
            ? '✓'
            : event.type === 'paid' || event.type === 'recursive-paid'
              ? '$'
              : '•';

      let line = message ?? event.type;
      if (event.type === 'engine-decision') {
        line = `Hired ${chosenAgentId ?? 'unknown'} (score: ${
          engineScore !== null ? engineScore.toFixed(3) : 'n/a'
        }, ${candidates ?? 0} candidates)`;
      } else if (event.type === 'paid') {
        const tx = txHash ? `${txHash.slice(0, 8)}...` : 'pending...';
        line = `Paid ${agent ?? 'agent'} - ${amount.toFixed(3)} USDC [${tx}]`;
      } else if (event.type === 'recursive-paid') {
        line = `${source ?? 'worker'} -> ${agent ?? 'agent'} (recursive) - ${amount.toFixed(3)} USDC`;
      } else if (event.type === 'plan') {
        const steps = Array.isArray(event.steps)
          ? event.steps
              .map((step) => (step && typeof step === 'object' ? readString((step as { agentName?: unknown }).agentName) : null))
              .filter((name): name is string => Boolean(name))
          : [];
        line = `Plan: ${steps.length} steps - ${steps.join(' -> ')}`;
      } else if (event.type === 'complete') {
        line = `Done - ${(totalSpend ?? 0).toFixed(3)} USDC across ${agentsUsed.length} agents`;
      } else if (event.type === 'step-complete') {
        const resSnippet = event.result ? (typeof event.result === 'string' ? event.result : JSON.stringify(event.result)) : '';
        const preview = resSnippet.length > 110 ? resSnippet.slice(0, 110) + '...' : resSnippet;
        line = `Step complete: ${agent ?? 'agent'} has processed the request. ${preview ? `Result: ${preview}` : ''}`;
      }

      return (
        <li key={`${event.type}-${index}-${event.at ?? ''}`} className="event-line-enter flex items-start gap-2 text-xs text-slate-600">
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
          <span>{line}</span>
        </li>
      );
    });

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Manager Agent Query</h2>
      {xlmSkipped ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Wallet signing is bypassed because <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_SKIP_MANAGER_XLM=1</code>{' '}
          is enabled.
        </p>
      ) : (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <strong>Wallet signed flow:</strong> connect Freighter on <strong>Stellar testnet</strong>, enter the amount
          below, and run the manager. You will approve the initial payment signature before execution starts.
        </p>
      )}
      <form className="mt-3 flex flex-col gap-3" onSubmit={submit}>
        <textarea
          className="soft-ring min-h-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner transition focus:border-sky-300"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {PRESET_QUERIES.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setQuery(preset)}
              className="soft-ring rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-sky-200 hover:text-sky-700"
            >
              {preset}
            </button>
          ))}
        </div>
        {!xlmSkipped ? (
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Payment Amount (XLM)
            <input
              type="number"
              min="0.0000001"
              step="0.0000001"
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
              className="soft-ring w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </label>
        ) : null}
        <button
          className="soft-ring w-fit rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:-translate-y-0.5 hover:bg-sky-700 disabled:opacity-60"
          disabled={loading || isRunning}
          type="submit"
        >
          {loading ? 'Submitting...' : isRunning ? 'Running...' : 'Run Manager'}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

      {initialPayment ? (
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm font-semibold text-indigo-900">Initial Payment Captured &amp; Sent</p>
          <a
            className="mt-2 inline-block rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            href={initialPayment.explorerUrl}
            target="_blank"
            rel="noreferrer"
          >
            View Full Receipt on Stellar Expert
          </a>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        {isRunning && progress.total > 0 ? (
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>Progress</span>
              <span>
                {progress.completed}/{progress.total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress.ratio}%` }}
              />
            </div>
          </div>
        ) : null}
        <p className="text-xs font-semibold text-slate-700">Live Execution</p>
        <ul className="mt-2 space-y-1">{eventLines.length ? eventLines : <li className="text-xs text-slate-500">Waiting for session events</li>}</ul>
      </div>

      {summary ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
        </div>
      ) : null}
    </section>
  );
}
