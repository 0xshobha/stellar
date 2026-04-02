import { AgentCatalogItem, AgentName } from '../lib/types.js';
import { staticCatalog } from '../lib/store.js';
import { env } from '../config.js';

const agentState = new Map<AgentName, AgentCatalogItem>(
  staticCatalog.map((item) => [item.name, { ...item }])
);
const basePriceByAgent = new Map<AgentName, number>(staticCatalog.map((item) => [item.name, item.price]));

if (!env.CONTRACT_ID || !env.CONTRACT_ID.trim()) {
  throw new Error('Invalid CONTRACT_ID: set CONTRACT_ID or use LOCAL_MOCK_CONTRACT for local mode.');
}

const isSorobanConfigured = env.CONTRACT_ID !== 'LOCAL_MOCK_CONTRACT';
if (isSorobanConfigured) {
  // Soroban integration stub (for production testnet/mainnet wiring):
  // import { Contract, SorobanRpc } from '@stellar/stellar-sdk';
  // const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
  // const contract = new Contract(env.CONTRACT_ID);
  // const tx = new TransactionBuilder(account, { fee, networkPassphrase })
  //   .addOperation(contract.call('register_agent', ...args))
  //   .setTimeout(30)
  //   .build();
  // Sign + submit + poll with server.sendTransaction(...) and server.getTransaction(...).
}

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
    next.reputation = Math.min(10000, next.reputation + 45);
  } else {
    next.jobsFailed += 1;
    next.reputation = Math.max(0, next.reputation - 120);
  }

  const basePrice = basePriceByAgent.get(name) ?? current.price;
  const totalJobs = next.jobsCompleted + next.jobsFailed;
  const successRate = totalJobs > 0 ? next.jobsCompleted / totalJobs : 0.5;
  const reputationFactor = 0.8 + (next.reputation / 10000) * 0.5;
  const reliabilityFactor = 0.85 + successRate * 0.3;
  const dynamicPrice = basePrice * reputationFactor * reliabilityFactor;
  next.price = Number(Math.max(0.0001, dynamicPrice).toFixed(6));

  agentState.set(name, next);
  return { ...next };
}
