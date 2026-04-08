import { randomUUID } from 'node:crypto';
import {
  AgentCatalogItem,
  AgentUsageMetric,
  PaymentRecord,
  ProtocolTraceItem,
  SessionMetrics,
  SessionStatus,
  X402SettlementRecord
} from './types.js';
import { env } from './config.js';

const transactions: PaymentRecord[] = [];
const x402Settlements: X402SettlementRecord[] = [];
const sessionStatuses = new Map<string, SessionStatus>();
const protocolTraces = new Map<string, ProtocolTraceItem[]>();
const sessionTransactions = new Map<string, PaymentRecord[]>();
const sessionMetrics = new Map<string, SessionMetrics>();

function nowIso(): string {
  return new Date().toISOString();
}

function buildExplorerUrl(txHash: string): string {
  const network = env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network}/tx/${txHash}`;
}

export function addTransaction(
  item: Omit<PaymentRecord, 'id' | 'timestamp' | 'explorerUrl' | 'asset'> & { asset?: string }
): PaymentRecord {
  const record: PaymentRecord = {
    id: randomUUID(),
    timestamp: nowIso(),
    explorerUrl: buildExplorerUrl(item.txHash),
    asset: item.asset ?? 'USDC',
    ...item
  };
  transactions.unshift(record);

  if (record.sessionId) {
    const bySession = sessionTransactions.get(record.sessionId) ?? [];
    bySession.unshift(record);
    sessionTransactions.set(record.sessionId, bySession);

    const existingMetrics = sessionMetrics.get(record.sessionId) ?? {
      sessionId: record.sessionId,
      totalSpend: 0,
      transactionCount: 0,
      agentUsage: {}
    };

    const existingUsage = existingMetrics.agentUsage[record.to] ?? {
      agentName: record.to,
      count: 0,
      totalSpent: 0,
      lastUsedAt: record.timestamp
    };

    const updatedUsage: AgentUsageMetric = {
      ...existingUsage,
      count: existingUsage.count + 1,
      totalSpent: Number((existingUsage.totalSpent + record.amount).toFixed(6)),
      lastUsedAt: record.timestamp
    };

    sessionMetrics.set(record.sessionId, {
      ...existingMetrics,
      totalSpend: Number((existingMetrics.totalSpend + record.amount).toFixed(6)),
      transactionCount: existingMetrics.transactionCount + 1,
      agentUsage: {
        ...existingMetrics.agentUsage,
        [record.to]: updatedUsage
      }
    });
  }

  return record;
}

export function listTransactions(limit = 10, sessionId?: string): PaymentRecord[] {
  const source = sessionId ? (sessionTransactions.get(sessionId) ?? []) : transactions;
  return source.slice(0, Math.max(1, limit));
}

export function recordX402Settlement(rec: Omit<X402SettlementRecord, 'timestamp'> & { timestamp?: string }): X402SettlementRecord {
  const row: X402SettlementRecord = {
    agent: rec.agent,
    amount: rec.amount,
    txHash: rec.txHash,
    timestamp: rec.timestamp ?? nowIso()
  };
  x402Settlements.unshift(row);
  return row;
}

export function listX402Settlements(limit = 100): X402SettlementRecord[] {
  return x402Settlements.slice(0, Math.max(1, limit));
}

export function createSessionStatus(sessionId: string, query: string, budgetUsd?: number): SessionStatus {
  const now = nowIso();
  const session: SessionStatus = {
    sessionId,
    query,
    complete: false,
    summary: '',
    agentsHired: [],
    totalCost: 0,
    txHashes: [],
    startedAt: now,
    updatedAt: now,
    errors: [],
    completedSteps: 0,
    totalSteps: 0,
    partial: false,
    budgetUsd,
    failureCount: 0
  };
  sessionStatuses.set(sessionId, session);
  protocolTraces.set(sessionId, []);
  sessionTransactions.set(sessionId, []);
  sessionMetrics.set(sessionId, {
    sessionId,
    totalSpend: 0,
    transactionCount: 0,
    agentUsage: {}
  });
  return session;
}

export function updateSessionStatus(sessionId: string, patch: Partial<SessionStatus>): SessionStatus | undefined {
  const current = sessionStatuses.get(sessionId);
  if (!current) return undefined;
  const next: SessionStatus = {
    ...current,
    ...patch,
    updatedAt: nowIso()
  };
  sessionStatuses.set(sessionId, next);
  return next;
}

export function getSessionStatus(sessionId: string): SessionStatus | undefined {
  return sessionStatuses.get(sessionId);
}

export function appendProtocolTrace(sessionId: string, trace: ProtocolTraceItem): void {
  const list = protocolTraces.get(sessionId) ?? [];
  list.push(trace);
  protocolTraces.set(sessionId, list);
}

export function getProtocolTrace(sessionId: string): ProtocolTraceItem[] {
  return protocolTraces.get(sessionId) ?? [];
}

export function getSessionMetrics(sessionId: string): SessionMetrics {
  return (
    sessionMetrics.get(sessionId) ?? {
      sessionId,
      totalSpend: 0,
      transactionCount: 0,
      agentUsage: {}
    }
  );
}

export function getSessionTransactions(sessionId: string, limit = 50): PaymentRecord[] {
  return (sessionTransactions.get(sessionId) ?? []).slice(0, Math.max(1, limit));
}

export function registerPaymentToSession(sessionId: string, txHash: string, amount: number, agentName: string): void {
  const current = sessionStatuses.get(sessionId);
  if (!current) return;
  const hired = current.agentsHired.includes(agentName) ? current.agentsHired : [...current.agentsHired, agentName];
  updateSessionStatus(sessionId, {
    agentsHired: hired,
    totalCost: Number((current.totalCost + amount).toFixed(6)),
    txHashes: [...current.txHashes, txHash]
  });
}

export function registerSessionError(sessionId: string, message: string): void {
  const current = sessionStatuses.get(sessionId);
  if (!current) return;
  updateSessionStatus(sessionId, {
    errors: [...current.errors, message]
  });
}

export function completeSession(sessionId: string, summary: string): void {
  const status = sessionStatuses.get(sessionId);
  updateSessionStatus(sessionId, {
    complete: true,
    summary,
    partial: status ? status.errors.length > 0 : false
  });
}

/** Initial registry: two tiers per crowded capability for on-chain-style competition. */
export const staticCatalog: AgentCatalogItem[] = [
  {
    id: 'prc_bas',
    plannerRole: 'PriceFeed',
    capability: 'price',
    endpoint: 'price',
    price: 0.0005,
    reputation: 7200,
    capabilities: ['price-check', 'asset-quote'],
    recursive: false,
    jobsCompleted: 120,
    jobsFailed: 8
  },
  {
    id: 'prc_pro',
    plannerRole: 'PriceFeed',
    capability: 'price',
    endpoint: 'price',
    price: 0.002,
    reputation: 9100,
    capabilities: ['price-check', 'asset-quote', 'spread'],
    recursive: false,
    jobsCompleted: 340,
    jobsFailed: 4
  },
  {
    id: 'new_std',
    plannerRole: 'NewsDigest',
    capability: 'news',
    endpoint: 'news',
    price: 0.0015,
    reputation: 7800,
    capabilities: ['headline-summary', 'topic-digest'],
    recursive: false,
    jobsCompleted: 90,
    jobsFailed: 10
  },
  {
    id: 'new_api',
    plannerRole: 'NewsDigest',
    capability: 'news',
    endpoint: 'news',
    price: 0.004,
    reputation: 9200,
    capabilities: ['headline-summary', 'topic-digest', 'source-links'],
    recursive: false,
    jobsCompleted: 210,
    jobsFailed: 5
  },
  {
    id: 'sum_fst',
    plannerRole: 'Summarizer',
    capability: 'summarize',
    endpoint: 'summarize',
    price: 0.0008,
    reputation: 8200,
    capabilities: ['text-summary', 'key-points'],
    recursive: false,
    jobsCompleted: 400,
    jobsFailed: 6
  },
  {
    id: 'sum_pro',
    plannerRole: 'Summarizer',
    capability: 'summarize',
    endpoint: 'summarize',
    price: 0.003,
    reputation: 9500,
    capabilities: ['text-summary', 'key-points', 'long-context'],
    recursive: false,
    jobsCompleted: 280,
    jobsFailed: 2
  },
  {
    id: 'sen_lex',
    plannerRole: 'SentimentAI',
    capability: 'sentiment',
    endpoint: 'sentiment',
    price: 0.0008,
    reputation: 7600,
    capabilities: ['sentiment', 'risk-tone'],
    recursive: false,
    jobsCompleted: 150,
    jobsFailed: 12
  },
  {
    id: 'sen_nlp',
    plannerRole: 'SentimentAI',
    capability: 'sentiment',
    endpoint: 'sentiment',
    price: 0.0025,
    reputation: 9050,
    capabilities: ['sentiment', 'risk-tone', 'fine-grained'],
    recursive: false,
    jobsCompleted: 310,
    jobsFailed: 4
  },
  {
    id: 'mat_sol',
    plannerRole: 'MathSolver',
    capability: 'math',
    endpoint: 'math',
    price: 0.002,
    reputation: 9000,
    capabilities: ['arithmetic', 'equation-solving'],
    recursive: false,
    jobsCompleted: 500,
    jobsFailed: 3
  },
  {
    id: 'res_std',
    plannerRole: 'DeepResearch',
    capability: 'research',
    endpoint: 'research',
    price: 0.006,
    reputation: 7400,
    capabilities: ['recursive-research'],
    recursive: true,
    jobsCompleted: 45,
    jobsFailed: 9
  },
  {
    id: 'res_drp',
    plannerRole: 'DeepResearch',
    capability: 'research',
    endpoint: 'research',
    price: 0.012,
    reputation: 8200,
    capabilities: ['recursive-research', 'multi-source-analysis'],
    recursive: true,
    jobsCompleted: 88,
    jobsFailed: 7
  }
];
