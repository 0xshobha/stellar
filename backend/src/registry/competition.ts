import { env, stellarExpertContractUrl } from '../infra/config.js';
import { chainOracleScore, engineScore } from '../core/scoring.js';
import type { AgentCatalogItem } from '../infra/types.js';
import { getAgentCatalog } from './contract.js';
import { fetchAgentsByCapabilityFromChain, fetchBestAgentFromChain } from './soroban.js';

export interface RegistryCompetitorRow {
  id: string;
  plannerRole: AgentCatalogItem['plannerRole'];
  endpoint: string;
  price: number;
  reputation: number;
  jobsCompleted: number;
  jobsFailed: number;
  chainOracleScore: number;
  engineDecisionScore: number;
  rankByChain: number;
}

export interface RegistryCompetitionSnapshot {
  capability: string;
  /** soroban = RPC field; catalog = merged in-memory catalog when RPC returned no rows */
  source: 'soroban' | 'catalog';
  contractId: string;
  contractExplorerUrl: string;
  chainFormula: string;
  managerFormula: string;
  sorobanDeclaredWinnerId: string | null;
  competitors: RegistryCompetitorRow[];
  generatedAt: string;
}

function rankCompetitors(items: AgentCatalogItem[]): RegistryCompetitorRow[] {
  const enriched = items.map((a) => ({
    agent: a,
    chainOracleScore: chainOracleScore(a),
    engineDecisionScore: engineScore(a)
  }));
  enriched.sort((x, y) => y.chainOracleScore - x.chainOracleScore);
  return enriched.map((row, idx) => ({
    id: row.agent.id,
    plannerRole: row.agent.plannerRole,
    endpoint: row.agent.endpoint,
    price: row.agent.price,
    reputation: row.agent.reputation,
    jobsCompleted: row.agent.jobsCompleted,
    jobsFailed: row.agent.jobsFailed,
    chainOracleScore: row.chainOracleScore,
    engineDecisionScore: Number(row.engineDecisionScore.toFixed(6)),
    rankByChain: idx + 1
  }));
}

function buildCatalogSnapshot(capability: string): RegistryCompetitionSnapshot {
  const cap = capability.trim().toLowerCase();
  const catalog = getAgentCatalog();
  const pool = catalog.filter((a) => a.capability.toLowerCase() === cap);
  const ranked = rankCompetitors(pool);
  const winner = ranked[0] ?? null;

  return {
    capability: cap,
    source: 'catalog',
    contractId: env.CONTRACT_ID,
    contractExplorerUrl: stellarExpertContractUrl(),
    chainFormula: 'reputation * 1000 - price_usdc_micro (same formula as Soroban get_best_agent)',
    managerFormula: 'reputation * 0.7 - price_usdc * 0.3',
    sorobanDeclaredWinnerId: winner?.id ?? null,
    competitors: ranked,
    generatedAt: new Date().toISOString()
  };
}

export async function getRegistryCompetitionSnapshot(capability: string): Promise<RegistryCompetitionSnapshot> {
  const cap = capability.trim().toLowerCase();
  if (!cap) {
    return {
      capability: '',
      source: 'catalog',
      contractId: env.CONTRACT_ID,
      contractExplorerUrl: stellarExpertContractUrl(),
      chainFormula: '',
      managerFormula: '',
      sorobanDeclaredWinnerId: null,
      competitors: [],
      generatedAt: new Date().toISOString()
    };
  }

  const fromChain = await fetchAgentsByCapabilityFromChain(cap);
  const chainWinner = await fetchBestAgentFromChain(cap);

  if (!fromChain || fromChain.length === 0) {
    const fallback = buildCatalogSnapshot(cap);
    return {
      ...fallback,
      sorobanDeclaredWinnerId: chainWinner?.id ?? fallback.sorobanDeclaredWinnerId
    };
  }

  const ranked = rankCompetitors(fromChain);
  const winnerId = chainWinner?.id ?? ranked[0]?.id ?? null;

  return {
    capability: cap,
    source: 'soroban',
    contractId: env.CONTRACT_ID,
    contractExplorerUrl: stellarExpertContractUrl(),
    chainFormula: 'On-chain: reputation * 1000 - price_usdc (micro) — get_best_agent',
    managerFormula: 'reputation * 0.7 - price_usdc * 0.3 (manager hire score)',
    sorobanDeclaredWinnerId: winnerId,
    competitors: ranked,
    generatedAt: new Date().toISOString()
  };
}
