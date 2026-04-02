import { AgentCatalogItem, AgentName } from '../lib/types.js';
import { staticCatalog } from '../lib/store.js';

const agentState = new Map<AgentName, AgentCatalogItem>(
  staticCatalog.map((item) => [item.name, { ...item }])
);

export function getAgentCatalog(): AgentCatalogItem[] {
  return Array.from(agentState.values()).map((item) => ({ ...item }));
}

export function getAgentByName(name: AgentName): AgentCatalogItem | undefined {
  const found = agentState.get(name);
  return found ? { ...found } : undefined;
}

export function getAgentByEndpoint(endpoint: string): AgentCatalogItem | undefined {
  const found = Array.from(agentState.values()).find((agent) => agent.endpoint === endpoint);
  return found ? { ...found } : undefined;
}

export function recordJobResult(name: AgentName, success: boolean): AgentCatalogItem | undefined {
  const current = agentState.get(name);
  if (!current) return undefined;

  const next = { ...current };
  if (success) {
    next.jobsCompleted += 1;
    next.reputation = Math.min(10000, next.reputation + 50);
  } else {
    next.jobsFailed += 1;
    next.reputation = Math.max(0, next.reputation - 100);
  }

  const multiplier = next.reputation >= 8500 ? 1.1 : next.reputation < 6000 ? 0.9 : 1;
  next.price = Number((current.price * multiplier).toFixed(6));
  agentState.set(name, next);
  return { ...next };
}
