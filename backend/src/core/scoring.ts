import type { AgentCatalogItem } from '../infra/types.js';

/** Manager hire score: higher wins (reputation-weighted, price-penalized). */
export function engineScore(item: AgentCatalogItem): number {
  return item.reputation * 0.7 - item.price * 0.3;
}

/**
 * Soroban contract `get_best_agent` uses: reputation * 1000 - price_usdc (micro).
 * We mirror that using USD price from the catalog.
 */
export function chainOracleScore(item: AgentCatalogItem): number {
  const micro = Math.round(item.price * 1_000_000);
  return item.reputation * 1000 - micro;
}
