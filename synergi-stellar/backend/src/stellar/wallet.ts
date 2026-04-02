import { randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { env } from '../config.js';

interface WalletBalance {
  publicKey: string;
  xlm: string;
  usdc: string;
  network: string;
  updatedAt: string;
}

interface WalletBalanceCache {
  value: WalletBalance;
  expiresAt: number;
}

export interface CreatedWallet {
  walletId: string;
  name: string;
  publicKey: string;
  secretKey: string;
  xlmFunded: string;
  network: string;
  createdAt: string;
}

const managerPublic = env.MANAGER_SECRET_KEY ? Keypair.fromSecret(env.MANAGER_SECRET_KEY).publicKey() : 'UNCONFIGURED_MANAGER';
const BALANCE_TTL_MS = 20_000;
let cachedBalance: WalletBalanceCache | null = null;

export function getManagerWalletBalance(): WalletBalance {
  const now = Date.now();
  if (cachedBalance && cachedBalance.expiresAt > now) {
    return cachedBalance.value;
  }

  const value: WalletBalance = {
    publicKey: managerPublic,
    xlm: '1000.0000000',
    usdc: '250.0000000',
    network: env.STELLAR_NETWORK,
    updatedAt: new Date(now).toISOString()
  };

  cachedBalance = {
    value,
    expiresAt: now + BALANCE_TTL_MS
  };

  return value;
}

export function createSponsoredWallet(agentName: string): CreatedWallet {
  const keypair = Keypair.random();
  return {
    walletId: randomUUID(),
    name: agentName,
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
    xlmFunded: '1.5',
    network: env.STELLAR_NETWORK,
    createdAt: new Date().toISOString()
  };
}
