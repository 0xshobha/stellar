import type { AgentCatalogItem } from '../infra/types.js';

/** Optional in-memory catalog used only when explicitly enabled by configuration. */
export const DEMO_AGENT_CATALOG: AgentCatalogItem[] = [
  {
    id: 'prc_demo',
    plannerRole: 'PriceFeed',
    capability: 'price',
    endpoint: 'price',
    price: 0.001,
    reputation: 8200,
    capabilities: ['price-check'],
    recursive: false,
    jobsCompleted: 10,
    jobsFailed: 0
  },
  {
    id: 'new_demo',
    plannerRole: 'NewsDigest',
    capability: 'news',
    endpoint: 'news',
    price: 0.0015,
    reputation: 7800,
    capabilities: ['headlines'],
    recursive: false,
    jobsCompleted: 8,
    jobsFailed: 0
  },
  {
    id: 'sum_demo',
    plannerRole: 'Summarizer',
    capability: 'summarize',
    endpoint: 'summarize',
    price: 0.0008,
    reputation: 8500,
    capabilities: ['summary'],
    recursive: false,
    jobsCompleted: 20,
    jobsFailed: 0
  },
  {
    id: 'sen_demo',
    plannerRole: 'SentimentAI',
    capability: 'sentiment',
    endpoint: 'sentiment',
    price: 0.001,
    reputation: 7600,
    capabilities: ['sentiment'],
    recursive: false,
    jobsCompleted: 12,
    jobsFailed: 0
  },
  {
    id: 'mat_demo',
    plannerRole: 'MathSolver',
    capability: 'math',
    endpoint: 'math',
    price: 0.001,
    reputation: 8000,
    capabilities: ['math'],
    recursive: false,
    jobsCompleted: 30,
    jobsFailed: 0
  },
  {
    id: 'res_demo',
    plannerRole: 'DeepResearch',
    capability: 'research',
    endpoint: 'research',
    price: 0.006,
    reputation: 7400,
    capabilities: ['research'],
    recursive: true,
    jobsCompleted: 5,
    jobsFailed: 0
  }
];
