/** Planner / user-facing role (one per step in a plan). */
export type PlannerAgentRole =
  | 'PriceFeed'
  | 'NewsDigest'
  | 'Summarizer'
  | 'SentimentAI'
  | 'MathSolver'
  | 'DeepResearch';

/** @deprecated Use PlannerAgentRole — kept for gradual migration */
export type AgentName = PlannerAgentRole;

export interface AgentCatalogItem {
  /** Soroban registry id / unique worker id (e.g. prc_bas). */
  id: string;
  plannerRole: PlannerAgentRole;
  /** Contract capability bucket: price | news | summarize | sentiment | math | research */
  capability: string;
  /** HTTP path segment under /agents/ */
  endpoint: string;
  price: number;
  reputation: number;
  capabilities: string[];
  recursive: boolean;
  jobsCompleted: number;
  jobsFailed: number;
}

export interface PaymentRecord {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  amount: number;
  asset: string;
  txHash: string;
  explorerUrl: string;
  sessionId?: string;
  depth: number;
}

/** Middleware-settled x402 payment (on-chain). */
export interface X402SettlementRecord {
  agent: string;
  amount: number;
  txHash: string;
  timestamp: string;
}

export interface AgentUsageMetric {
  agentName: string;
  count: number;
  totalSpent: number;
  lastUsedAt: string;
}

export interface SessionMetrics {
  sessionId: string;
  totalSpend: number;
  transactionCount: number;
  agentUsage: Record<string, AgentUsageMetric>;
}

export interface SessionStatus {
  sessionId: string;
  query: string;
  complete: boolean;
  summary: string;
  agentsHired: string[];
  totalCost: number;
  txHashes: string[];
  startedAt: string;
  updatedAt: string;
  errors: string[];
  completedSteps: number;
  totalSteps: number;
  partial: boolean;
  /** Parsed from query text, e.g. "under $0.02" */
  budgetUsd?: number;
  /** Count of failed worker attempts (each retry after failure increments). */
  failureCount?: number;
}

export interface ProtocolTraceItem {
  timestamp: string;
  step: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body?: unknown;
  };
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
