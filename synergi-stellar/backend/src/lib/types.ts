export type AgentName =
  | 'PriceFeed'
  | 'NewsDigest'
  | 'Summarizer'
  | 'SentimentAI'
  | 'MathSolver'
  | 'DeepResearch';

export interface AgentCatalogItem {
  name: AgentName;
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
  txHash: string;
  explorerUrl: string;
  sessionId?: string;
  depth: number;
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

