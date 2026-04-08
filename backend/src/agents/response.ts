import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { decodePaymentResponseHeader } from '@x402/core/http';

const STELLAR_TESTNET_NETWORK = 'stellar:testnet' as const;

export interface AgentResponseEnvelope<T extends object> {
  agent: string;
  pricePaid: number;
  data: T;
  txHash: string;
  agentPublicKey: string;
  depth: number;
  timestamp: string;
  network: typeof STELLAR_TESTNET_NETWORK;
}

export function buildAgentResponse<T extends object>(params: {
  res: Response;
  agentName: string;
  pricePaid: number;
  data: T;
  agentPublicKey: string | undefined;
  depth: number;
}): AgentResponseEnvelope<T> {
  return {
    agent: params.agentName,
    pricePaid: params.pricePaid,
    data: params.data,
    txHash: resolveTxHash(params.res, params.agentName),
    agentPublicKey: params.agentPublicKey ?? 'UNCONFIGURED',
    depth: params.depth,
    timestamp: new Date().toISOString(),
    network: STELLAR_TESTNET_NETWORK
  };
}

function resolveTxHash(res: Response, agentName: string): string {
  const raw = res.getHeader('PAYMENT-RESPONSE');
  if (typeof raw === 'string') {
    try {
      const decoded = decodePaymentResponseHeader(raw) as Record<string, unknown>;
      const tx = decoded.transaction;
      if (typeof tx === 'string' && tx.trim().length > 0) {
        return tx;
      }
    } catch {
      // Ignore malformed header and fallback to mock hash.
    }
  }

  return `mock-${agentName.toLowerCase()}-${Date.now().toString(16)}-${randomUUID().slice(0, 8)}`;
}
