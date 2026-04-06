'use client';

import { useEffect, useState } from 'react';
import * as freighter from '@stellar/freighter-api';

const REQUIRED_FREIGHTER_ADDRESS = process.env.NEXT_PUBLIC_REQUIRED_FREIGHTER_ADDRESS?.trim() ?? '';
const REQUIRED_STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK?.trim().toLowerCase() ?? '';

type FreighterApi = {
  requestAccess?: () => Promise<unknown>;
  getAddress?: () => Promise<{ address?: string; publicKey?: string } | string>;
  getPublicKey?: () => Promise<string>;
  getNetwork?: () => Promise<string>;
  getNetworkDetails?: () => Promise<{ network?: string; networkPassphrase?: string }>;
};

function getFreighterApi(): FreighterApi | null {
  if (typeof window === 'undefined') return null;
  return freighter as unknown as FreighterApi;
}

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function normalizeNetwork(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('testnet') || normalized.includes('test sdf network')) return 'testnet';
  if (normalized.includes('mainnet') || normalized.includes('public global stellar network')) return 'mainnet';
  return normalized;
}

async function readWalletAddress(api: FreighterApi): Promise<string> {
  if (api.getAddress) {
    const value = await api.getAddress();
    if (typeof value === 'string') return value;
    if (value.address) return value.address;
    if (value.publicKey) return value.publicKey;
  }
  if (api.getPublicKey) {
    return api.getPublicKey();
  }
  throw new Error('Freighter wallet address API is unavailable');
}

async function readWalletNetwork(api: FreighterApi): Promise<string> {
  if (api.getNetworkDetails) {
    const details = await api.getNetworkDetails();
    return details.network ?? details.networkPassphrase ?? 'unknown';
  }
  if (api.getNetwork) {
    return api.getNetwork();
  }
  return 'unknown';
}

export default function WalletConnectCard() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletNetwork, setWalletNetwork] = useState<string>('');
  const [walletError, setWalletError] = useState<string>('');
  const [walletBusy, setWalletBusy] = useState<boolean>(false);

  useEffect(() => {
    setWalletError('');
  }, []);

  const disconnect = () => {
    setWalletAddress(null);
    setWalletNetwork('');
    setWalletError('');
  };

  const connect = async () => {
    setWalletError('');
    setWalletBusy(true);

    try {
      const api = getFreighterApi();
      if (!api) {
        throw new Error('Freighter extension not found. Install Freighter and refresh the page.');
      }

      if (api.requestAccess) {
        await api.requestAccess();
      }

      const [address, network] = await Promise.all([readWalletAddress(api), readWalletNetwork(api)]);
      const normalizedNetwork = normalizeNetwork(network);

      if (REQUIRED_FREIGHTER_ADDRESS && address !== REQUIRED_FREIGHTER_ADDRESS) {
        throw new Error(`Wrong wallet selected. Please switch Freighter account to ${REQUIRED_FREIGHTER_ADDRESS}.`);
      }

      if (REQUIRED_STELLAR_NETWORK && normalizedNetwork !== REQUIRED_STELLAR_NETWORK) {
        throw new Error(`Wrong network selected. Please switch Freighter to ${REQUIRED_STELLAR_NETWORK}.`);
      }

      setWalletAddress(address);
      setWalletNetwork(normalizedNetwork);
    } catch (error) {
      disconnect();
      setWalletError(error instanceof Error ? error.message : 'Unable to connect Freighter wallet');
    } finally {
      setWalletBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Wallet</h2>
      <p className="mt-1 text-sm text-slate-600">Connect Freighter to run paid sessions.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {walletAddress ? (
          <>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              Connected {shortAddress(walletAddress)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              {walletNetwork || 'network unknown'}
            </span>
            <button
              type="button"
              onClick={disconnect}
              className="soft-ring rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={walletBusy}
            className="soft-ring rounded-lg border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {walletBusy ? 'Connecting…' : 'Connect Freighter Wallet'}
          </button>
        )}
      </div>

      {walletError ? <p className="mt-2 text-xs text-rose-600">{walletError}</p> : null}
      {!walletAddress && REQUIRED_FREIGHTER_ADDRESS ? (
        <p className="mt-2 text-[11px] text-slate-500">Required wallet: {shortAddress(REQUIRED_FREIGHTER_ADDRESS)}</p>
      ) : null}
    </section>
  );
}
