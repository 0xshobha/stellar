#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const DEFAULT_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12000);

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const tools: Tool[] = [
  {
    name: 'list_agents',
    description: 'List all available worker agents with pricing and reputation.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'query_manager_agent',
    description: 'Submit a natural language query to manager agent and return final status.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Task prompt for manager agent' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_agent_reputation',
    description: 'Get reputation and pricing details for one registry agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Registry id e.g. prc_bas, new_api, sum_pro' }
      },
      required: ['agent_id']
    }
  },
  {
    name: 'call_agent_direct',
    description:
      'Call a worker HTTP route. Use registry id (prc_bas) for a specific tier, or legacy role (PriceFeed) to let the manager pick the best worker.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_ref: {
          type: 'string',
          description: 'Registry id (prc_bas, new_std, …) or legacy role (PriceFeed, NewsDigest, …)'
        },
        input: { type: 'string' }
      },
      required: ['agent_ref', 'input']
    }
  },
  {
    name: 'get_transaction_history',
    description: 'Get x402 payment history with explorer links.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 10 } }
    }
  },
  {
    name: 'get_wallet_balance',
    description: 'Get manager wallet balances for XLM and USDC.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'create_agent_wallet',
    description: 'Create a sponsored wallet for an agent and return credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_name: { type: 'string' }
      },
      required: ['agent_name']
    }
  }
];

async function callBackend<T>(path: string, options?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as Envelope<T> | T;
  if (typeof payload === 'object' && payload !== null && 'ok' in payload) {
    const envelope = payload as Envelope<T>;
    if (!envelope.ok || envelope.data === undefined) {
      throw new Error(`${envelope.error?.code ?? 'BACKEND_ERROR'}: ${envelope.error?.message ?? 'Unknown backend failure'}`);
    }
    return envelope.data;
  }
  return payload as T;
}

async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'list_agents': {
      const data = await callBackend<{ items: unknown[]; count: number }>('/agents/catalog');
      return JSON.stringify(data, null, 2);
    }
    case 'query_manager_agent': {
      const query = String(args.query ?? '');
      const start = await callBackend<{ sessionId: string }>('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      }, 6000);

      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const status = await callBackend<{
          complete: boolean;
          summary: string;
          agentsHired: string[];
          totalCost: number;
          txHashes: string[];
        }>(`/api/status/${start.sessionId}`, undefined, 6000);
        if (status.complete) {
          return [
            `Summary: ${status.summary}`,
            `Agents hired: ${status.agentsHired.join(', ') || 'none'}`,
            `Total cost: ${status.totalCost} USDC`,
            `Transactions: ${status.txHashes.join(', ') || 'none'}`
          ].join('\n');
        }
      }
      return 'Timeout waiting for completion.';
    }
    case 'get_agent_reputation': {
      const agentId = String(args.agent_id ?? args.agent_name ?? '');
      const data = await callBackend(`/agents/reputation/${encodeURIComponent(agentId)}`);
      return JSON.stringify(data, null, 2);
    }
    case 'call_agent_direct': {
      const endpointMap: Record<string, string> = {
        PriceFeed: 'price',
        NewsDigest: 'news',
        Summarizer: 'summarize',
        SentimentAI: 'sentiment',
        MathSolver: 'math',
        DeepResearch: 'research'
      };
      const agentRef = String(args.agent_ref ?? args.agent_name ?? '');
      let endpoint = endpointMap[agentRef];
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (!endpoint) {
        const catalog = await callBackend<{ items: Array<{ id: string; endpoint: string }> }>('/agents/catalog');
        const item = catalog.items.find((i) => i.id === agentRef);
        if (!item) {
          throw new Error(`Unknown agent_ref ${agentRef}`);
        }
        endpoint = item.endpoint;
        headers['x-registry-agent'] = item.id;
      }
      const data = await callBackend(`/agents/${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: String(args.input ?? '') })
      });
      return JSON.stringify(data, null, 2);
    }
    case 'get_transaction_history': {
      const limit = Number(args.limit ?? 10);
      const data = await callBackend<{ items: unknown[] }>(`/api/transactions?limit=${limit}`);
      return JSON.stringify(data, null, 2);
    }
    case 'get_wallet_balance': {
      const data = await callBackend('/api/wallet/balance');
      return JSON.stringify(data, null, 2);
    }
    case 'create_agent_wallet': {
      const data = await callBackend('/api/wallet/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: String(args.agent_name ?? '') })
      });
      return JSON.stringify(data, null, 2);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const server = new Server(
  {
    name: 'stellar-net',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const text = await handleTool(request.params.name, (request.params.arguments as Record<string, unknown>) || {});
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const formatted = {
      type: 'mcp_error',
      tool: request.params.name,
      message,
      hint: 'Check backend health, env variables, and session status endpoint.'
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
