import { env, stellarExpertContractUrl } from '../infra/config.js';
import { chainOracleScore, engineScore } from '../core/scoring.js';
import type { AgentCatalogItem } from '../infra/types.js';
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
  source: 'soroban';
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

export async function getRegistryCompetitionSnapshot(capability: string): Promise<RegistryCompetitionSnapshot> {
  const cap = capability.trim().toLowerCase();
  const base = {
    source: 'soroban' as const,
    contractId: env.CONTRACT_ID,
    contractExplorerUrl: stellarExpertContractUrl(),
    chainFormula: 'On-chain: reputation * 1000 - price_usdc (micro) — get_best_agent',
    managerFormula: 'reputation * 0.7 - price_usdc * 0.3 (manager hire score)',
    generatedAt: new Date().toISOString()
  };

  if (!cap) {
    return {
      capability: '',
      ...base,
      sorobanDeclaredWinnerId: null,
      competitors: []
    };
  }

  const fromChain = await fetchAgentsByCapabilityFromChain(cap);
  const chainWinner = await fetchBestAgentFromChain(cap);
  const ranked = rankCompetitors(fromChain);
  const winnerId = chainWinner?.id ?? ranked[0]?.id ?? null;

  return {
    capability: cap,
    ...base,
    sorobanDeclaredWinnerId: winnerId,
    competitors: ranked
  };
}
