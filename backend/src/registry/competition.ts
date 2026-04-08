import { demoCatalogFallbackEnabled, env, stellarExpertContractUrl } from '../infra/config.js';
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
  source: 'soroban' | 'demo';
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
    contractId: env.CONTRACT_ID,
    contractExplorerUrl: stellarExpertContractUrl(),
    managerFormula: 'reputation * 0.7 - price_usdc * 0.3 (manager hire score)',
    generatedAt: new Date().toISOString()
  };

  if (!cap) {
    return {
      capability: '',
      source: 'soroban',
      chainFormula: '',
      ...base,
      sorobanDeclaredWinnerId: null,
      competitors: []
    };
  }

  try {
    const fromChain = await fetchAgentsByCapabilityFromChain(cap);
    const chainWinner = await fetchBestAgentFromChain(cap);
    const ranked = rankCompetitors(fromChain);
    const winnerId = chainWinner?.id ?? ranked[0]?.id ?? null;

    return {
      capability: cap,
      source: 'soroban',
      chainFormula: 'On-chain: reputation * 1000 - price_usdc (micro) — get_best_agent',
      ...base,
      sorobanDeclaredWinnerId: winnerId,
      competitors: ranked
    };
  } catch (err) {
    if (!demoCatalogFallbackEnabled) {
      throw err;
    }
    const pool = getAgentCatalog()
      .map((row) => {
        const { explorerUrl: _e, ...rest } = row;
        return rest;
      })
      .filter((a) => a.capability.toLowerCase() === cap);
    const ranked = rankCompetitors(pool);
    const winnerId = ranked[0]?.id ?? null;
    const reason = err instanceof Error ? err.message : String(err);
    return {
      capability: cap,
      source: 'demo',
      chainFormula: `Demo leaderboard (Soroban RPC unavailable: ${reason.slice(0, 120)})`,
      ...base,
      sorobanDeclaredWinnerId: winnerId,
      competitors: ranked
    };
  }
}
