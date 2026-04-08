import { AgentCatalogItem, AgentName } from '../lib/types.js';
import { staticCatalog } from '../lib/store.js';
import { env } from '../config.js';

/* SOROBAN INTEGRATION STUB
When CONTRACT_ID env var is set (not 'LOCAL_MOCK_CONTRACT'), this module
would use @stellar/stellar-sdk Contract class to call on-chain functions:

import { Contract, rpc, xdr } from '@stellar/stellar-sdk';
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const contract = new Contract(process.env.CONTRACT_ID!);

To register an agent on-chain:
const tx = await server.prepareTransaction(
  new TransactionBuilder(account, { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call('register_agent', ...))
    .setTimeout(30).build()
);

For hackathon submission, in-memory state is used for speed.
All state updates happen identically to what the contract would do.
*/

const agentState = new Map<AgentName, AgentCatalogItem>(
  staticCatalog.map((item) => [item.name, { ...item }])
);
const basePriceByAgent = new Map<AgentName, number>(staticCatalog.map((item) => [item.name, item.price]));
const allTransactions: Array<{
  agentName: AgentName;
  success: boolean;
  price: number;
  reputation: number;
  timestamp: string;
}> = [];

if (!env.CONTRACT_ID || !env.CONTRACT_ID.trim()) {
  throw new Error('Invalid CONTRACT_ID: set CONTRACT_ID or use LOCAL_MOCK_CONTRACT for local mode.');
}

export function getAgentCatalog(): Array<AgentCatalogItem & { explorerUrl: string }> {
  return Array.from(agentState.values()).map((item) => {
    const publicKey = getAgentPublicKey(item.name);
    return {
      ...item,
      explorerUrl: `https://stellar.expert/explorer/testnet/account/${publicKey}`
    };
  });
}

export function getAgentByName(name: string): AgentCatalogItem | undefined {
  const found = agentState.get(name as AgentName);
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

  agentState.set(name, next);
  allTransactions.push({
    agentName: name,
    success,
    price: next.price,
    reputation: next.reputation,
    timestamp: new Date().toISOString()
  });

  return { ...next };
}

export function getAllTransactions(): Array<{
  agentName: AgentName;
  success: boolean;
  price: number;
  reputation: number;
  timestamp: string;
}> {
  return allTransactions.map((item) => ({ ...item }));
}

function getAgentPublicKey(agentName: AgentName): string {
  const envByAgent: Record<AgentName, string | undefined> = {
    PriceFeed: process.env.AGENT_PRICE_PUBLIC_KEY,
    NewsDigest: process.env.AGENT_NEWS_PUBLIC_KEY,
    Summarizer: process.env.AGENT_SUMMARIZER_PUBLIC_KEY,
    SentimentAI: process.env.AGENT_SENTIMENT_PUBLIC_KEY,
    MathSolver: process.env.AGENT_MATH_PUBLIC_KEY,
    DeepResearch: process.env.AGENT_RESEARCH_PUBLIC_KEY
  };

  return envByAgent[agentName] || 'UNCONFIGURED';
}
