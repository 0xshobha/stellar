'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PaymentRecord } from '../lib/types';

interface TransactionLogProps {
  transactions: PaymentRecord[];
}

/** Stellar transaction hashes are 64 hex chars; synthetic placeholders are not ledger ids. */
function isLikelyOnChainStellarTxHash(hash: string): boolean {
  if (!hash) return false;
  if (hash.startsWith('fallback-') || hash.startsWith('unsettled-')) return false;
  return /^[a-f0-9]{64}$/i.test(hash);
}

function stellarExplorerNet(): 'public' | 'testnet' {
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
}

export default function TransactionLog({ transactions }: TransactionLogProps) {
  const sorted = useMemo(() => [...transactions].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [transactions]);
  const [receiptByTxHash, setReceiptByTxHash] = useState<Record<string, TransactionReceipt | null>>({});
  const [loadingTxHashes, setLoadingTxHashes] = useState<Record<string, true>>({});
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  async function copyText(value: string, kind: 'tx' | 'address'): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      if (kind === 'tx') {
        setCopiedTxHash(value);
        setTimeout(() => setCopiedTxHash((current) => (current === value ? null : current)), 2000);
        return;
      }
      setCopiedAddress(value);
      setTimeout(() => setCopiedAddress((current) => (current === value ? null : current)), 2000);
    } catch {
      // no-op
    }
  }

  const loadReceipt = useCallback(async (txHash: string): Promise<void> => {
    setLoadingTxHashes((current) => ({ ...current, [txHash]: true }));
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(txHash)}/receipt`);
      const payload = (await response.json()) as
        | { ok: true; data: TransactionReceipt }
        | { ok: false; error?: { message?: string } };

      if (!response.ok || !payload.ok) {
        throw new Error(!payload.ok ? payload.error?.message : 'Failed to load receipt');
      }

      setReceiptByTxHash((current) => ({
        ...current,
        [txHash]: payload.data
      }));
    } catch {
      setReceiptByTxHash((current) => ({
        ...current,
        [txHash]: null
      }));
    } finally {
      setLoadingTxHashes((current) => {
        const next = { ...current };
        delete next[txHash];
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const inFlight = Object.keys(loadingTxHashes).length;
    if (inFlight >= 5) return;
    const availableSlots = 5 - inFlight;
    const candidates = sorted
      .map((item) => item.txHash)
      .filter((txHash) => isLikelyOnChainStellarTxHash(txHash))
      .filter((txHash) => receiptByTxHash[txHash] === undefined)
      .filter((txHash) => !loadingTxHashes[txHash])
      .slice(0, availableSlots);
    candidates.forEach((txHash) => {
      void loadReceipt(txHash);
    });
  }, [sorted, receiptByTxHash, loadingTxHashes, loadReceipt]);

  const shortHash = (hash: string) => {
    if (hash.length <= 20) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-10)}`;
  };

  const shortAddress = (value: string): string => {
    if (value.length <= 18) return value;
    return `${value.slice(0, 7)}...${value.slice(-7)}`;
  };

  const getExplorerUrl = (item: PaymentRecord): string => {
    if (item.explorerUrl && item.explorerUrl.includes('/tx/')) {
      return item.explorerUrl;
    }
    const net = stellarExplorerNet();
    return `https://stellar.expert/explorer/${net}/tx/${item.txHash}`;
  };

  const totals = useMemo(() => {
    let usdc = 0;
    let xlm = 0;
    transactions.forEach((item) => {
      const amount = Number(item.amount);
      if (!Number.isFinite(amount)) return;
      const asset = String(item.asset ?? '').toUpperCase();
      if (asset.includes('XLM')) {
        xlm += amount;
      } else {
        usdc += amount;
      }
    });
    return {
      count: transactions.length,
      usdc: Number(usdc.toFixed(3)),
      xlm: Number(xlm.toFixed(6))
    };
  }, [transactions]);

  const getTxType = (item: PaymentRecord): { label: 'x402-usdc' | 'xlm-native' | 'recursive'; className: string } => {
    if (item.depth > 1) {
      return { label: 'recursive', className: 'bg-amber-100 text-amber-700' };
    }
    const asset = String(item.asset ?? '').toUpperCase();
    if (asset.includes('XLM')) {
      return { label: 'xlm-native', className: 'bg-sky-100 text-sky-700' };
    }
    return { label: 'x402-usdc', className: 'bg-violet-100 text-violet-700' };
  };

  const slipText = (item: PaymentRecord, verified: TransactionReceipt | null | undefined): string => {
    const lines = [
      'Stellar Net Transaction Slip',
      '--------------------------------',
      `Transaction Hash: ${item.txHash}`,
      `Status: ${verified ? (verified.successful ? 'Success' : 'Failed') : isLikelyOnChainStellarTxHash(item.txHash) ? 'Settled' : 'Not on-chain'}`,
      `Amount: ${item.amount.toFixed(7)} ${item.asset || 'USDC'}`,
      `From: ${item.from}`,
      `To: ${item.to}`,
      `Time: ${new Date(item.timestamp).toISOString()}`,
      `Depth: ${item.depth}`,
      `Explorer: ${getExplorerUrl(item)}`
    ];

    if (verified) {
      lines.push(`Ledger: ${verified.ledger}`);
      lines.push(`Fee: ${verified.feeXlm} XLM`);
      if (verified.memo) {
        lines.push(`Memo: ${verified.memo}`);
      }
    }

    return lines.join('\n');
  };

  const downloadSlip = (item: PaymentRecord): void => {
    const verified = receiptByTxHash[item.txHash];
    const text = slipText(item, verified);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transaction-slip-${item.txHash}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Transaction Log</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="glass-chip">{totals.count} transactions</span>
        <span className="glass-chip">{totals.usdc.toFixed(3)} USDC</span>
        <span className="glass-chip">{totals.xlm.toFixed(6)} XLM</span>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        {sorted.map((item, index) => {
          const isOnChain = isLikelyOnChainStellarTxHash(item.txHash);
          const txType = getTxType(item);
          const currentSession = item.sessionId ?? null;
          const prevSession = index > 0 ? sorted[index - 1]?.sessionId ?? null : null;
          const showSessionDivider = index === 0 || currentSession !== prevSession;
          return (
            <div key={item.id}>
            {showSessionDivider && currentSession ? (
              <div className="mb-1 mt-2 border-t border-dashed border-slate-200 pt-2 text-[11px] font-medium text-slate-400">
                Session {currentSession.slice(0, 8)}
              </div>
            ) : null}
            <article className="rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <p className="text-slate-800">
                <span className="font-medium">{item.from}</span>
                <span className="mx-1 text-slate-400">→</span>
                <span className="font-medium">{item.to}</span>
              </p>
              <div className="flex items-center gap-1.5">
                <span className={`rounded px-2 py-0.5 text-[10px] ${txType.className}`}>{txType.label}</span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] ${item.depth > 1 ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}
                >
                  {item.depth > 1 ? `recursive d${item.depth}` : 'direct d1'}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    isOnChain ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {isOnChain ? 'on-chain' : 'pending / unknown'}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-700">
              {item.amount.toFixed(6)} {item.asset || 'USDC'}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{shortHash(item.txHash)}</span>
              <button
                type="button"
                onClick={() => void copyText(item.txHash, 'tx')}
                className="relative rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-700"
                aria-label="Copy transaction hash"
              >
                Copy
                {copiedTxHash === item.txHash ? (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-[10px] text-white">
                    Copied!
                  </span>
                ) : null}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">{new Date(item.timestamp).toLocaleString()}</p>

            <details
              className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"
              onToggle={(event) => {
                const details = event.currentTarget;
                if (!details.open || !isOnChain || receiptByTxHash[item.txHash] !== undefined || loadingTxHashes[item.txHash]) return;
                void loadReceipt(item.txHash);
              }}
            >
              <summary className="cursor-pointer font-medium text-slate-800">Transaction slip</summary>
              <div className="mt-2 space-y-1">
                <p>
                  <span className="font-medium">Amount:</span> {item.amount.toFixed(7)} {item.asset || 'USDC'}
                </p>
                <p>
                  <span className="font-medium">From:</span> {item.from}
                </p>
                <p>
                  <span className="font-medium">To:</span> {item.to}
                </p>
                <p>
                  <span className="font-medium">Hash:</span> {item.txHash}
                </p>
                {isOnChain ? (
                  <a
                    href={getExplorerUrl(item)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    Open this slip on Stellar Expert
                  </a>
                ) : null}
                <p>
                  <span className="font-medium">Type:</span> {isOnChain ? 'On-chain settled' : 'Hash does not look like a Stellar tx (or still pending)'}
                </p>
                {item.sessionId ? (
                  <p>
                    <span className="font-medium">Session:</span> {item.sessionId}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => downloadSlip(item)}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Download slip
                </button>
              </div>
            </details>

            {isOnChain ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadReceipt(item.txHash)}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  {loadingTxHashes[item.txHash] ? 'Loading receipt...' : 'Show receipt'}
                </button>
                <a
                  className="inline-block rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
                  href={getExplorerUrl(item)}
                  rel="noreferrer"
                  target="_blank"
                  title="Open full transaction details in Stellar Expert"
                >
                  View Full Receipt on Stellar Expert Website: {shortHash(item.txHash)}
                </a>
                <a
                  className="block w-full break-all text-[11px] text-slate-600 underline decoration-slate-300 hover:text-sky-700"
                  href={getExplorerUrl(item)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {getExplorerUrl(item)}
                </a>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                No Stellar Expert link until the hash looks like a 64-character on-chain transaction id.
              </p>
            )}

            {isOnChain && Object.prototype.hasOwnProperty.call(receiptByTxHash, item.txHash) ? (
              receiptByTxHash[item.txHash] ? (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50 p-3 text-xs text-slate-700 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-emerald-700">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[11px]">✓</span>
                    <p className="font-semibold">Settled on Stellar Testnet</p>
                  </div>
                  <p className="text-2xl font-bold leading-tight text-emerald-700">
                    {receiptByTxHash[item.txHash]?.payment
                      ? `${receiptByTxHash[item.txHash]?.payment?.amount} ${receiptByTxHash[item.txHash]?.payment?.asset}`
                      : `${item.amount.toFixed(6)} ${item.asset || 'USDC'}`}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1">
                      <span className="text-[11px] text-slate-500">From</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-700">
                          {shortAddress(receiptByTxHash[item.txHash]?.payment?.from ?? receiptByTxHash[item.txHash]?.sourceAccount ?? item.from)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(
                              receiptByTxHash[item.txHash]?.payment?.from ?? receiptByTxHash[item.txHash]?.sourceAccount ?? item.from,
                              'address'
                            )
                          }
                          className="relative rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-700"
                        >
                          Copy
                          {copiedAddress === (receiptByTxHash[item.txHash]?.payment?.from ?? receiptByTxHash[item.txHash]?.sourceAccount ?? item.from) ? (
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-[10px] text-white">
                              Copied!
                            </span>
                          ) : null}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1">
                      <span className="text-[11px] text-slate-500">To</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-700">
                          {shortAddress(receiptByTxHash[item.txHash]?.payment?.to ?? item.to)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void copyText(receiptByTxHash[item.txHash]?.payment?.to ?? item.to, 'address')}
                          className="relative rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-700"
                        >
                          Copy
                          {copiedAddress === (receiptByTxHash[item.txHash]?.payment?.to ?? item.to) ? (
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-[10px] text-white">
                              Copied!
                            </span>
                          ) : null}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Ledger {receiptByTxHash[item.txHash]?.ledger} ·{' '}
                    {new Date(receiptByTxHash[item.txHash]?.createdAt ?? '').toLocaleString()} · Fee{' '}
                    {receiptByTxHash[item.txHash]?.feeXlm} XLM
                  </div>
                  <a
                    href={receiptByTxHash[item.txHash]?.explorerUrl ?? getExplorerUrl(item)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                  >
                    View on Stellar Expert
                  </a>
                </div>
              ) : (
                <p className="mt-2 text-xs text-rose-600">Unable to load receipt for this transaction hash.</p>
              )
            ) : null}
            </article>
            </div>
          );
        })}
        {sorted.length === 0 ? <p className="text-slate-400">No payments yet</p> : null}
      </div>
    </section>
  );
}

type TransactionReceipt = {
  txHash: string;
  successful: boolean;
  createdAt: string;
  ledger: number;
  sourceAccount: string;
  feeXlm: string;
  memo: string | null;
  payment: {
    from: string;
    to: string;
    amount: string;
    asset: string;
  } | null;
  explorerUrl: string;
};
