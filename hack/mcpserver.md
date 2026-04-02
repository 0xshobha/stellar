#!/usr/bin/env node
// mcp-server/src/index.ts
// SynergiStellar MCP Server — exposes agent marketplace tools to Claude Code
//
// Install: Add to ~/.claude/mcp.json
// {
//   "mcpServers": {
//     "synergi-stellar": {
//       "command": "node",
//       "args": ["/path/to/mcp-server/dist/index.js"],
//       "env": { "BACKEND_URL": "http://localhost:4000" }
//     }
//   }
// }

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

// ─── Tool Definitions ──────────────────────────────────────────────────────

const tools: Tool[] = [
  {
    name: 'list_agents',
    description: 'List all available worker agents in the SynergiStellar marketplace with their prices, reputations, and capabilities.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'query_manager_agent',
    description: 'Send a natural language query to the SynergiStellar Manager Agent. It will autonomously plan, hire worker agents using x402 micropayments on Stellar, and return a synthesized answer.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The task or question for the manager agent (e.g. "research quantum computing and summarize findings")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_agent_reputation',
    description: 'Get the on-chain Soroban reputation score for a specific agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_name: {
          type: 'string',
          description: 'Name of the agent (e.g. "PriceFeed", "DeepResearch", "Summarizer")',
        },
      },
      required: ['agent_name'],
    },
  },
  {
    name: 'call_agent_direct',
    description: 'Directly call a specific worker agent with x402 payment. The MCP server handles the Stellar payment automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_name: {
          type: 'string',
          description: 'Name of the agent to call',
          enum: ['PriceFeed', 'NewsDigest', 'Summarizer', 'SentimentAI', 'MathSolver', 'DeepResearch'],
        },
        input: {
          type: 'string',
          description: 'Input data for the agent',
        },
      },
      required: ['agent_name', 'input'],
    },
  },
  {
    name: 'get_transaction_history',
    description: 'Get the history of x402 payments made on Stellar testnet, with explorer links.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of transactions to return (default 10)',
          default: 10,
        },
      },
    },
  },
  {
    name: 'get_wallet_balance',
    description: 'Get the current USDC balance of the manager agent wallet on Stellar testnet.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_agent_wallet',
    description: 'Create a new Stellar wallet for an agent using the sponsored account pattern (no XLM needed to start).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_name: {
          type: 'string',
          description: 'Display name for this agent wallet',
        },
      },
      required: ['agent_name'],
    },
  },
];

// ─── Tool Handlers ─────────────────────────────────────────────────────────

async function callBackend(path: string, body?: any): Promise<any> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`Backend error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function handleTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'list_agents': {
      const agents = await callBackend('/agents/catalog');
      return JSON.stringify(agents, null, 2);
    }

    case 'query_manager_agent': {
      // Non-streaming version — polls for result
      const { sessionId } = await callBackend('/api/query', { query: args.query });

      // Poll for completion (simplified — production would use SSE)
      let attempts = 0;
      while (attempts < 30) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await callBackend(`/api/status/${sessionId}`);
        if (status.complete) {
          return `✅ Task Complete\n\n${status.summary}\n\n📊 Agents hired: ${status.agentsHired.join(', ')}\n💰 Total cost: ${status.totalCost} USDC\n🔗 Transactions: ${status.txHashes.map((h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`).join('\n')}`;
        }
        attempts++;
      }
      return 'Timeout waiting for agent response. Check dashboard at http://localhost:3000';
    }

    case 'get_agent_reputation': {
      const rep = await callBackend(`/agents/reputation/${args.agent_name}`);
      return `Agent: ${args.agent_name}\nReputation: ${rep.reputation}/10000 (${(rep.reputation / 100).toFixed(1)}%)\nJobs completed: ${rep.jobsCompleted}\nJobs failed: ${rep.jobsFailed}\nPrice: ${rep.priceUsdc} USDC`;
    }

    case 'call_agent_direct': {
      const endpointMap: Record<string, string> = {
        PriceFeed: 'price',
        NewsDigest: 'news',
        Summarizer: 'summarize',
        SentimentAI: 'sentiment',
        MathSolver: 'math',
        DeepResearch: 'research',
      };
      const endpoint = endpointMap[args.agent_name];
      if (!endpoint) throw new Error(`Unknown agent: ${args.agent_name}`);

      const result = await callBackend(`/agents/${endpoint}`, { input: args.input });
      return `✅ Agent: ${args.agent_name}\n💰 Payment: ${result.pricePaid} USDC\n🔗 Tx: https://stellar.expert/explorer/testnet/tx/${result.txHash}\n\nResult:\n${JSON.stringify(result.data, null, 2)}`;
    }

    case 'get_transaction_history': {
      const history = await callBackend(`/api/transactions?limit=${args.limit || 10}`);
      return history.map((tx: any) =>
        `[${tx.timestamp}] ${tx.from} → ${tx.to} | ${tx.amount} USDC | ${tx.txHash.slice(0, 8)}... | https://stellar.expert/explorer/testnet/tx/${tx.txHash}`
      ).join('\n');
    }

    case 'get_wallet_balance': {
      const balance = await callBackend('/api/wallet/balance');
      return `Manager Wallet Balance:\nPublic Key: ${balance.publicKey}\nXLM: ${balance.xlm}\nUSDC: ${balance.usdc}\nNetwork: Stellar Testnet\n🔗 https://stellar.expert/explorer/testnet/account/${balance.publicKey}`;
    }

    case 'create_agent_wallet': {
      const wallet = await callBackend('/api/wallet/create', { name: args.agent_name });
      return `✅ New Stellar wallet created for "${args.agent_name}"\nPublic Key: ${wallet.publicKey}\nFunded with: ${wallet.xlmFunded} XLM (via sponsorship)\n🔗 https://stellar.expert/explorer/testnet/account/${wallet.publicKey}\n\n⚠️  Secret key returned once — save it:\n${wallet.secretKey}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Server Setup ──────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'synergi-stellar',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(name, args || {});
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${String(err)}` }],
      isError: true,
    };
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('SynergiStellar MCP Server running on stdio');
}

main().catch(console.error);

/*
─── package.json for mcp-server ──────────────────────────────────

{
  "name": "synergi-stellar-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}

─── Add to ~/.claude/mcp.json ────────────────────────────────────

{
  "mcpServers": {
    "synergi-stellar": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "BACKEND_URL": "http://localhost:4000"
      }
    }
  }
}

─── Then in Claude Code you can say: ────────────────────────────

"Use synergi-stellar to list available agents"
"Use synergi-stellar to query the manager agent: research AI trends"
"Use synergi-stellar to check the wallet balance"

*/