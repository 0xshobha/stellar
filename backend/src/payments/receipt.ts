import { env } from '../infra/config.js';

type HorizonTransaction = {
  hash: string;
  successful: boolean;
  created_at: string;
  source_account: string;
  fee_charged: string;
  memo?: string;
  memo_type?: string;
  ledger: number;
};

type HorizonOperation = {
  type: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
};

function horizonBaseUrl(): string {
  return env.STELLAR_NETWORK === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
}

function assetLabel(operation: HorizonOperation): string {
  if (operation.asset_type === 'native') return 'XLM';
  return operation.asset_code || 'UNKNOWN';
}

export async function fetchTransactionReceipt(txHash: string): Promise<{
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
}> {
  const base = horizonBaseUrl();

  const [txResponse, operationsResponse] = await Promise.all([
    fetch(`${base}/transactions/${encodeURIComponent(txHash)}`),
    fetch(`${base}/transactions/${encodeURIComponent(txHash)}/operations?limit=20&order=asc`)
  ]);

  if (!txResponse.ok) {
    throw new Error(`Transaction not found on Horizon (status ${txResponse.status}).`);
  }

  if (!operationsResponse.ok) {
    throw new Error(`Unable to load transaction operations (status ${operationsResponse.status}).`);
  }

  const tx = (await txResponse.json()) as HorizonTransaction;
  const operationsPayload = (await operationsResponse.json()) as { _embedded?: { records?: HorizonOperation[] } };
  const operations = operationsPayload._embedded?.records ?? [];
  const paymentOp = operations.find((operation) => operation.type === 'payment');

  const feeXlm = (Number(tx.fee_charged || '0') / 10_000_000).toFixed(7);
  const network = env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';

  return {
    txHash: tx.hash,
    successful: tx.successful,
    createdAt: tx.created_at,
    ledger: tx.ledger,
    sourceAccount: tx.source_account,
    feeXlm,
    memo: tx.memo_type && tx.memo_type !== 'none' ? tx.memo ?? null : null,
    payment: paymentOp
      ? {
          from: paymentOp.from ?? tx.source_account,
          to: paymentOp.to ?? '',
          amount: paymentOp.amount ?? '0',
          asset: assetLabel(paymentOp)
        }
      : null,
    explorerUrl: `https://stellar.expert/explorer/${network}/tx/${tx.hash}`
  };
}
