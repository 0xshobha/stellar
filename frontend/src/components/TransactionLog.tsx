'use client';

import { useState } from 'react';
import { PaymentRecord } from '../lib/types';

interface TransactionLogProps {
  transactions: PaymentRecord[];
}

export default function TransactionLog({ transactions }: TransactionLogProps) {
  const sorted = [...transactions].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const [receiptByTxHash, setReceiptByTxHash] = useState<Record<string, TransactionReceipt | null>>({});
  const [loadingTxHash, setLoadingTxHash] = useState<string | null>(null);

  async function loadReceipt(txHash: string): Promise<void> {
    setLoadingTxHash(txHash);
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
      setLoadingTxHash((current) => (current === txHash ? null : current));
    }
  }

  const shortHash = (hash: string) => {
    if (hash.length <= 20) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-10)}`;
  };

  const getExplorerUrl = (item: PaymentRecord): string => {
    if (item.explorerUrl && item.explorerUrl.includes('/tx/')) {
      return item.explorerUrl;
    }
    return `https://stellar.expert/explorer/testnet/tx/${item.txHash}`;
  };

  const slipText = (item: PaymentRecord, verified: TransactionReceipt | null | undefined): string => {
    const lines = [
      'SynergiStellar Transaction Slip',
      '--------------------------------',
      `Transaction Hash: ${item.txHash}`,
      `Status: ${verified ? (verified.successful ? 'Success' : 'Failed') : item.txHash.startsWith('fallback-') || item.txHash.startsWith('mock-') ? 'Simulated' : 'Settled'}`,
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
            <p className="mt-1 text-xs font-medium text-slate-700">
              {item.amount.toFixed(6)} {item.asset || 'USDC'}
            </p>
            <p className="mt-1 text-xs text-slate-400">{new Date(item.timestamp).toLocaleString()}</p>

            <details
              className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"
              onToggle={(event) => {
                const details = event.currentTarget;
                if (!details.open || isSimulated || receiptByTxHash[item.txHash] !== undefined || loadingTxHash === item.txHash) return;
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
                {!isSimulated ? (
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
                  <span className="font-medium">Type:</span> {isSimulated ? 'Simulated' : 'On-chain settled'}
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

            {!isSimulated ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadReceipt(item.txHash)}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  {loadingTxHash === item.txHash ? 'Loading receipt...' : 'Show receipt'}
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
              <p className="mt-2 text-xs text-slate-500">Simulated transaction (no on-chain details page)</p>
            )}

            {!isSimulated && Object.prototype.hasOwnProperty.call(receiptByTxHash, item.txHash) ? (
              receiptByTxHash[item.txHash] ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                  <p className="font-semibold">Receipt</p>
                  <p>Status: {receiptByTxHash[item.txHash]?.successful ? 'Success' : 'Failed'}</p>
                  <p>
                    Amount:{' '}
                    {receiptByTxHash[item.txHash]?.payment
                      ? `${receiptByTxHash[item.txHash]?.payment?.amount} ${receiptByTxHash[item.txHash]?.payment?.asset}`
                      : 'N/A'}
                  </p>
                  <p>From: {receiptByTxHash[item.txHash]?.payment?.from ?? receiptByTxHash[item.txHash]?.sourceAccount}</p>
                  <p>To: {receiptByTxHash[item.txHash]?.payment?.to ?? 'N/A'}</p>
                  <p>Fee: {receiptByTxHash[item.txHash]?.feeXlm} XLM</p>
                  <p>Ledger: {receiptByTxHash[item.txHash]?.ledger}</p>
                  <p>Time: {new Date(receiptByTxHash[item.txHash]?.createdAt ?? '').toLocaleString()}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-rose-600">Unable to load receipt for this transaction hash.</p>
              )
            ) : null}
            </article>
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
