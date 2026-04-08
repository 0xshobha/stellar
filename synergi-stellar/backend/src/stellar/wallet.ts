import { randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { env } from '../config.js';

const HORIZON_TESTNET_ACCOUNT_URL = 'https://horizon-testnet.stellar.org/accounts';
const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

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

let cachedManagerKeypair: Keypair | null = null;
let managerKeypairInit: Promise<Keypair> | null = null;

async function ensureManagerKeypair(): Promise<Keypair> {
  if (cachedManagerKeypair) return cachedManagerKeypair;

  if (env.MANAGER_SECRET_KEY) {
    cachedManagerKeypair = Keypair.fromSecret(env.MANAGER_SECRET_KEY);
    return cachedManagerKeypair;
  }

  if (!managerKeypairInit) {
    managerKeypairInit = (async () => {
      const keypair = Keypair.random();
      try {
        await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(keypair.publicKey())}`);
      } catch {}
      cachedManagerKeypair = keypair;
      return keypair;
    })();
  }

  return managerKeypairInit;
}

export async function getManagerPublicKey(): Promise<string> {
  const kp = await ensureManagerKeypair();
  return kp.publicKey();
}
const BALANCE_TTL_MS = 20_000;
let cachedBalance: WalletBalanceCache | null = null;
let balanceRefreshInFlight: Promise<void> | null = null;

export async function getManagerWalletBalance(): Promise<WalletBalance> {
  const now = Date.now();
  if (cachedBalance && cachedBalance.expiresAt > now) {
    return cachedBalance.value;
  }

  if (!balanceRefreshInFlight) {
    balanceRefreshInFlight = refreshManagerBalance().finally(() => {
      balanceRefreshInFlight = null;
    });
  }

  const managerPublic = await getManagerPublicKey();
  return cachedBalance?.value ?? buildFallbackBalance(managerPublic, now);
}

export async function createSponsoredWallet(agentName: string): Promise<CreatedWallet> {
  const keypair = Keypair.random();
  try {
    await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(keypair.publicKey())}`);
  } catch {}

  const publicKey = keypair.publicKey();

  return {
    walletId: randomUUID(),
    name: agentName,
    publicKey,
    secretKey: keypair.secret(),
    xlmFunded: '10000',
    network: env.STELLAR_NETWORK,
    createdAt: new Date().toISOString()
  };
}

async function refreshManagerBalance(): Promise<void> {
  const now = Date.now();
  const managerPublic = await getManagerPublicKey();
  const value = await fetchWalletBalance(managerPublic, now);
  cachedBalance = {
    value,
    expiresAt: now + BALANCE_TTL_MS
  };
}

async function fetchWalletBalance(publicKey: string, now: number): Promise<WalletBalance> {
  if (!publicKey || publicKey === 'UNCONFIGURED_MANAGER') {
    return buildFallbackBalance(publicKey, now);
  }

  try {
    const response = await fetch(`${HORIZON_TESTNET_ACCOUNT_URL}/${encodeURIComponent(publicKey)}`);

    if (response.status === 404) {
      console.warn(`[wallet] Horizon account not found for ${publicKey}; returning fallback balance.`);
      return buildFallbackBalance(publicKey, now);
    }

    if (!response.ok) {
      console.warn(`[wallet] Horizon fetch failed for ${publicKey} with status ${response.status}; returning fallback balance.`);
      return buildFallbackBalance(publicKey, now);
    }

    const payload = (await response.json()) as {
      balances?: Array<{
        asset_type?: string;
        asset_code?: string;
        asset_issuer?: string;
        balance?: string;
      }>;
    };

    const balances = Array.isArray(payload.balances) ? payload.balances : [];
    const nativeXlm = balances.find((b) => b.asset_type === 'native')?.balance ?? '0';
    const usdc =
      balances.find(
        (b) => b.asset_code === 'USDC' && b.asset_issuer === TESTNET_USDC_ISSUER
      )?.balance ?? '0';

    return {
      publicKey,
      xlm: nativeXlm,
      usdc,
      network: env.STELLAR_NETWORK,
      updatedAt: new Date(now).toISOString()
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[wallet] Horizon network error for ${publicKey}: ${message}; returning fallback balance.`);
    return buildFallbackBalance(publicKey, now);
  }
}

function buildFallbackBalance(publicKey: string, now: number): WalletBalance {
  return {
    publicKey,
    xlm: '0.0000000',
    usdc: '0.0000000',
    network: env.STELLAR_NETWORK,
    updatedAt: new Date(now).toISOString()
  };
}
