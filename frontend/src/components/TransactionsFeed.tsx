'use client';

import { useEffect, useState } from 'react';
import TransactionLog from './TransactionLog';
import { ApiEnvelope, PaymentRecord } from '../lib/types';

type TransactionsResponse = {
  items: PaymentRecord[];
  count: number;
  limit: number;
  sessionId: string | null;
};

export default function TransactionsFeed({ limit = 50 }: { limit?: number }) {
  const [transactions, setTransactions] = useState<PaymentRecord[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/transactions?limit=${encodeURIComponent(String(limit))}`);
        const payload = (await res.json()) as ApiEnvelope<TransactionsResponse>;
        if (!active) return;
        if (payload.ok && payload.data) {
          setTransactions(payload.data.items);
          setError('');
          return;
        }
        setError(payload.error?.message ?? 'Failed to load transactions');
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load transactions');
      }
    };

    const handle = window.setInterval(() => void poll(), 2000);
    void poll();

    return () => {
      active = false;
      window.clearInterval(handle);
    };
  }, [limit]);

  return (
    <div>
      {error ? <p className="mb-3 text-xs text-rose-600">{error}</p> : null}
      <TransactionLog transactions={transactions} />
    </div>
  );
}
