import {
  Asset,
  Horizon,
  Memo,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder
} from '@stellar/stellar-sdk';
import { env } from '../config.js';
import { addTransaction } from '../lib/store.js';
import { getManagerPublicKey } from './wallet.js';

function horizonServer(): Horizon.Server {
  const url = env.STELLAR_NETWORK === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
  return new Horizon.Server(url);
}

function networkPassphrase(): string {
  return env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

function explorerTxUrl(txHash: string): string {
  const network = env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network}/tx/${txHash}`;
}

export async function prepareXlmPayment(params: {
  from: string;
  amount: number;
  memo?: string;
}): Promise<{ xdr: string; networkPassphrase: string; destination: string; amount: number }> {
  const server = horizonServer();
  const destination = await getManagerPublicKey();

  const account = await server.loadAccount(params.from);
  const fee = String(await server.fetchBaseFee());
  const memoText = (params.memo ?? 'SynergiStellar').slice(0, 28);

  const tx = new TransactionBuilder(account, {
    fee,
    networkPassphrase: networkPassphrase()
  })
    .addMemo(Memo.text(memoText))
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount: params.amount.toFixed(7)
      })
    )
    .setTimeout(60)
    .build();

  return {
    xdr: tx.toXDR(),
    networkPassphrase: networkPassphrase(),
    destination,
    amount: params.amount
  };
}

export async function submitSignedTransaction(params: {
  signedXdr: string;
  noteFrom?: string;
}): Promise<{ txHash: string; explorerUrl: string }> {
  const server = horizonServer();
  const tx = new Transaction(params.signedXdr, networkPassphrase());

  const paymentOp = tx.operations.find((op) => {
    const anyOp = op as unknown as { type?: string };
    return anyOp.type === 'payment';
  }) as unknown as { destination?: string; amount?: string } | undefined;

  const destination = paymentOp?.destination ?? 'ManagerAgent';
  const amount = paymentOp?.amount ? Number(paymentOp.amount) : 0;

  const result = await server.submitTransaction(tx);

  addTransaction({
    from: params.noteFrom ?? 'UserWallet',
    to: destination,
    amount,
    asset: 'XLM',
    txHash: result.hash,
    depth: 1
  });

  return {
    txHash: result.hash,
    explorerUrl: explorerTxUrl(result.hash)
  };
}