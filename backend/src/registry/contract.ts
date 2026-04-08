import type { AgentCatalogItem, PlannerAgentRole } from '../infra/types.js';
import { env } from '../infra/config.js';
import { logError, logInfo } from '../infra/logger.js';
import { fetchAgentsFromChain, submitRecordJobOnChain } from './soroban.js';

const agentState = new Map<string, AgentCatalogItem>();
const basePriceById = new Map<string, number>();

const allTransactions: Array<{
  agentId: string;
  success: boolean;
  price: number;
  reputation: number;
  timestamp: string;
}> = [];

let pollHandle: ReturnType<typeof setInterval> | null = null;

if (!env.CONTRACT_ID || !env.CONTRACT_ID.trim()) {
  throw new Error('CONTRACT_ID must be set to your deployed Soroban registry contract.');
}

export function startRegistryPoller(): void {
  if (pollHandle) return;
  pollHandle = setInterval(() => {
    void refreshRegistryFromChain().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logError('Registry poll failed — exiting', { message });
      process.exit(1);
    });
  }, 45_000);
}

export async function refreshRegistryFromChain(): Promise<void> {
  const remote = await fetchAgentsFromChain();
  agentState.clear();
  basePriceById.clear();
  for (const item of remote) {
    agentState.set(item.id, { ...item });
    basePriceById.set(item.id, item.price);
  }
  logInfo('Registry loaded from Soroban', { agents: remote.length });
}

export function getAgentCatalog(): Array<AgentCatalogItem & { explorerUrl: string }> {
  return Array.from(agentState.values()).map((item) => {
    const publicKey = getRecipientPublicKey(item);
    return {
      ...item,
      explorerUrl: `https://stellar.expert/explorer/${env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet'}/account/${publicKey}`
    };
  });
}

export function getAgentById(id: string): AgentCatalogItem | undefined {
  const found = agentState.get(id);
  return found ? { ...found } : undefined;
}

/** @deprecated use getAgentById */
export function getAgentByName(name: string): AgentCatalogItem | undefined {
  return getAgentById(name);
}

export function getAgentByEndpoint(endpoint: string): AgentCatalogItem | undefined {
  const found = Array.from(agentState.values()).find((agent) => agent.endpoint === endpoint);
  return found ? { ...found } : undefined;
}

export function listAgentsForCapability(capability: string): AgentCatalogItem[] {
  const c = capability.toLowerCase();
  return Array.from(agentState.values()).filter((a) => a.capability === c);
}

const REP_WEIGHT = 0.0001;
const COST_WEIGHT = 2;

export function scoreAgentDecision(item: AgentCatalogItem): number {
  return REP_WEIGHT * item.reputation - COST_WEIGHT * item.price;
}

export function pickBestAgentForCapability(
  capability: string,
  maxPriceUsd: number,
  excludeIds: ReadonlySet<string> = new Set()
): AgentCatalogItem | null {
  const candidates = listAgentsForCapability(capability).filter(
    (a) => a.price <= maxPriceUsd && !excludeIds.has(a.id)
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => scoreAgentDecision(b) - scoreAgentDecision(a))[0] ?? null;
}

export function plannerRoleToCapability(role: PlannerAgentRole): string {
  const map: Record<PlannerAgentRole, string> = {
    PriceFeed: 'price',
    NewsDigest: 'news',
    Summarizer: 'summarize',
    SentimentAI: 'sentiment',
    MathSolver: 'math',
    DeepResearch: 'research'
  };
  return map[role];
}

export function recordJobResult(id: string, success: boolean): AgentCatalogItem | undefined {
  const current = agentState.get(id);
  if (!current) return undefined;

  const next = { ...current };
  if (success) {
    next.jobsCompleted += 1;
    next.reputation = Math.min(10000, next.reputation + 45);
  } else {
    next.jobsFailed += 1;
    next.reputation = Math.max(0, next.reputation - 120);
  }

  const basePrice = basePriceById.get(id) ?? current.price;
  let multiplier = 1;
  if (next.reputation >= 8500) {
    multiplier = 1.1;
  } else if (next.reputation < 5000) {
    multiplier = 0.9;
  }

  const minPrice = basePrice * 0.7;
  const maxPrice = basePrice * 1.3;
  const proposedPrice = basePrice * multiplier;
  next.price = Number(Math.min(maxPrice, Math.max(minPrice, proposedPrice)).toFixed(6));

  agentState.set(id, next);
  allTransactions.push({
    agentId: id,
    success,
    price: next.price,
    reputation: next.reputation,
    timestamp: new Date().toISOString()
  });

  void submitRecordJobOnChain(id, success);

  return { ...next };
}

export function getAllTransactions(): Array<{
  agentName: string;
  success: boolean;
  price: number;
  reputation: number;
  timestamp: string;
}> {
  return allTransactions.map((item) => ({
    agentName: item.agentId,
    success: item.success,
    price: item.price,
    reputation: item.reputation,
    timestamp: item.timestamp
  }));
}

function getRecipientPublicKey(item: AgentCatalogItem): string {
  const envByRole: Record<PlannerAgentRole, string | undefined> = {
    PriceFeed: process.env.AGENT_PRICE_PUBLIC_KEY,
    NewsDigest: process.env.AGENT_NEWS_PUBLIC_KEY,
    Summarizer: process.env.AGENT_SUMMARIZER_PUBLIC_KEY,
    SentimentAI: process.env.AGENT_SENTIMENT_PUBLIC_KEY,
    MathSolver: process.env.AGENT_MATH_PUBLIC_KEY,
    DeepResearch: process.env.AGENT_RESEARCH_PUBLIC_KEY
  };

  return envByRole[item.plannerRole] || 'UNCONFIGURED';
}
