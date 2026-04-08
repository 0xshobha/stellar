import { randomUUID } from 'node:crypto';
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { createEd25519Signer, getUsdcAddress } from '@x402/stellar';
import { ExactStellarScheme as ExactStellarClientScheme } from '@x402/stellar/exact/client';
import { appendProtocolTrace } from '../infra/store.js';
import { env, getStellarCaip2Network } from '../infra/config.js';
import { logError, logInfo } from '../infra/logger.js';

export interface X402FetchResult<T = unknown> {
  data: T;
  paymentAttempted: boolean;
  protocolTraceStepIds: string[];
  attempts: number;
}

interface X402FetchOptions {
  retries?: number;
  timeoutMs?: number;
  agentName?: string;
}

export async function x402FetchJson<T = unknown>(
  sessionId: string,
  url: string,
  init: RequestInit,
  options: X402FetchOptions = {}
): Promise<X402FetchResult<T>> {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 8000;
  const traceIds: string[] = [];
  const normalizedHeaders = normalizeHeaders(init.headers);

  let attempt = 0;
  let lastError = 'Unknown x402 error';

  const fetchImpl = getPaidFetch();
  const stellarNetwork = getStellarCaip2Network();

  while (attempt <= retries) {
    attempt += 1;
    const reqTraceId = randomUUID();
    traceIds.push(reqTraceId);
    appendProtocolTrace(sessionId, {
      timestamp: new Date().toISOString(),
      step: `request:${reqTraceId}`,
      request: {
        method: init.method ?? 'GET',
        url,
        headers: normalizedHeaders,
        body: parseBody(init.body)
      }
    });

    try {
      const first = await fetchWithTimeout(fetchImpl, url, init, timeoutMs);

      if (!first.ok) {
        throw new Error(`Call failed with status ${first.status}`);
      }

      const data = (await first.json()) as T;
      const paymentResponseHeader = first.headers.get('PAYMENT-RESPONSE') ?? first.headers.get('X-PAYMENT-RESPONSE');
      const settlementTx = paymentResponseHeader ? extractTransactionFromHeader(paymentResponseHeader) : null;
      const enrichedData = mergeTxHash(data, settlementTx, stellarNetwork) as T;

      appendProtocolTrace(sessionId, {
        timestamp: new Date().toISOString(),
        step: `response:${reqTraceId}`,
        request: {
          method: init.method ?? 'GET',
          url,
          headers: normalizedHeaders,
          body: parseBody(init.body)
        },
        response: {
          status: first.status,
          headers: headersToObject(first.headers),
          body: enrichedData
        }
      });

      const txHash = settlementTx ?? extractField(enrichedData, 'txHash');
      const paymentAttempted = Boolean(paymentResponseHeader);
      logInfo('x402 client call succeeded', {
        agent: options.agentName ?? 'unknown',
        txHash: txHash || 'n/a',
        attempt
      });

      return {
        data: enrichedData,
        paymentAttempted,
        protocolTraceStepIds: traceIds,
        attempts: attempt
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logError('x402 client attempt failed', {
        agent: options.agentName ?? 'unknown',
        url,
        attempt,
        message: lastError
      });
      if (attempt > retries) {
        break;
      }
    }
  }

  throw new Error(`x402 call failed after retries: ${lastError}`);
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return headersToObject(headers);
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetchImpl(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function extractField<T>(payload: T, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = (payload as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : null;
}

let paidFetch: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null = null;

function getPaidFetch(): typeof fetch {
  if (!env.MANAGER_SECRET_KEY) {
    throw new Error('MANAGER_SECRET_KEY is required for x402 settlement');
  }

  const stellarNetwork = getStellarCaip2Network();

  if (!paidFetch) {
    const signer = createEd25519Signer(env.MANAGER_SECRET_KEY, stellarNetwork);
    paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [
        {
          network: stellarNetwork,
          client: new ExactStellarClientScheme(signer)
        }
      ],
      paymentRequirementsSelector: (_, accepts) => {
        const stellarOnly = accepts.filter((entry) => entry.network === stellarNetwork);
        return stellarOnly[0] ?? accepts[0];
      }
    });
  }

  return paidFetch as typeof fetch;
}

function extractTransactionFromHeader(header: string): string | null {
  try {
    const response = decodePaymentResponseHeader(header) as Record<string, unknown>;
    const transaction = response.transaction;
    return typeof transaction === 'string' ? transaction : null;
  } catch {
    return null;
  }
}

function mergeTxHash<T>(payload: T, txHash: string | null, stellarNetwork: string): T {
  if (!txHash || !payload || typeof payload !== 'object') return payload;
  const current = payload as Record<string, unknown>;
  return {
    ...current,
    agentTxHash: typeof current.txHash === 'string' ? current.txHash : null,
    txHash,
    paymentTxHash: txHash,
    paymentNetwork: stellarNetwork,
    settlementAsset:
      env.X402_USDC_ASSET_ADDRESS ||
      getUsdcAddress(stellarNetwork as 'stellar:testnet' | 'stellar:pubnet')
  } as T;
}
