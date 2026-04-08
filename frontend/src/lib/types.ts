export type PlannerAgentRole =
  | 'PriceFeed'
  | 'NewsDigest'
  | 'Summarizer'
  | 'SentimentAI'
  | 'MathSolver'
  | 'DeepResearch';

export interface AgentCatalogItem {
  id: string;
  plannerRole: PlannerAgentRole;
  capability: string;
  endpoint: string;
  price: number;
  reputation: number;
  capabilities: string[];
  recursive: boolean;
  jobsCompleted: number;
  jobsFailed: number;
  explorerUrl?: string;
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

export interface SessionMetrics {
  sessionId: string;
  totalSpend: number;
  transactionCount: number;
  agentUsage: Record<string, { agentName: string; count: number; totalSpent: number; lastUsedAt: string }>;
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
  budgetUsd?: number;
  protocolTrace: ProtocolTraceItem[];
  metrics: SessionMetrics;
  transactions: PaymentRecord[];
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: ApiError;
}

export interface StreamEvent {
  type: string;
  at?: string;
  [key: string]: unknown;
}
