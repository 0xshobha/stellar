# SKILL: SynergiStellar — x402 Agent Economy on Stellar

> Drop this file at the root of the repo. Invoke in Claude Code with:
> `stellar-synergi:build` or just paste relevant sections into your prompt.

---

## Project Overview

SynergiStellar is a recursive Agent-to-Agent (A2A) economy where AI agents hire and pay each other using x402 micropayments on Stellar. Manager Agent (Claude-powered) receives queries, decomposes tasks, evaluates worker agents by reputation/cost, and settles payments via USDC on Stellar testnet.

**Stack:** Express + TypeScript backend | Next.js 14 frontend | Soroban (Rust) smart contracts | @x402/stellar | Claude API

---

## Key Packages

```bash
# Backend
npm install @stellar/stellar-sdk @x402/stellar express typescript ts-node dotenv @anthropic-ai/sdk

# Frontend
npm install next react react-dom d3 tailwindcss typescript

# Contracts
# Uses Stellar CLI + Rust toolchain
cargo add soroban-sdk
```

---

## Pattern 1: x402 Worker Agent (Protected Endpoint)

```typescript
// backend/src/x402/middleware.ts
import { paymentMiddleware } from '@x402/stellar';

export function createPaywall(priceUSDC: number) {
  return paymentMiddleware({
    amount: priceUSDC,                          // e.g. 0.001 = $0.001 USDC
    asset: 'USDC',
    facilitatorUrl: process.env.FACILITATOR_URL!,
    network: process.env.STELLAR_NETWORK as 'testnet' | 'mainnet',
  });
}

// backend/src/agents/price.ts
import express from 'express';
import { createPaywall } from '../x402/middleware';

const router = express.Router();

router.get('/', createPaywall(0.001), async (req, res) => {
  // This only runs after x402 payment is verified
  res.json({
    agent: 'PriceFeed',
    data: { BTC: 65000, ETH: 3200, XLM: 0.12 },
    paidAt: new Date().toISOString(),
  });
});

export default router;
```

---

## Pattern 2: x402 Client (Manager Agent Payer)

```typescript
// backend/src/x402/client.ts
import { wrapFetch } from '@x402/stellar';
import { Keypair } from '@stellar/stellar-sdk';

const managerKeypair = Keypair.fromSecret(process.env.MANAGER_SECRET_KEY!);

// This fetch wrapper automatically handles 402 → sign → retry
export const x402Fetch = wrapFetch(fetch, {
  keypair: managerKeypair,
  network: process.env.STELLAR_NETWORK as 'testnet' | 'mainnet',
});

// Usage in manager:
// const result = await x402Fetch('http://localhost:4000/agents/price');
// Payment is automatic — no manual signing needed
```

---

## Pattern 3: Manager Agent (Claude Task Planner)

```typescript
// backend/src/manager.ts
import Anthropic from '@anthropic-ai/sdk';
import { x402Fetch } from './x402/client';
import { getAgentCatalog } from './stellar/contract';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface AgentInfo {
  name: string;
  endpoint: string;
  price: number;
  reputation: number;
  capabilities: string[];
}

export async function processQuery(
  query: string,
  emit: (event: string, data: any) => void  // SSE emitter
): Promise<void> {

  const agents = await getAgentCatalog();
  emit('status', { message: 'Planning task...', agents: agents.length });

  // Step 1: Ask Claude to plan
  const planResponse = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are an autonomous manager agent. Given this query: "${query}"

Available worker agents: ${JSON.stringify(agents, null, 2)}

Respond ONLY with JSON:
{
  "plan": "brief explanation",
  "steps": [
    { "agentName": "AgentName", "reason": "why", "input": "what to send" }
  ]
}`
    }]
  });

  const planText = planResponse.content[0].type === 'text' ? planResponse.content[0].text : '{}';
  const plan = JSON.parse(planText.replace(/```json|```/g, '').trim());

  emit('plan', plan);

  // Step 2: Execute each step with x402 payments
  const results: any[] = [];
  for (const step of plan.steps) {
    const agent = agents.find(a => a.name === step.agentName);
    if (!agent) continue;

    emit('hiring', { agent: agent.name, price: agent.price, reason: step.reason });

    try {
      const response = await x402Fetch(`http://localhost:4000/agents/${agent.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: step.input }),
      });

      const data = await response.json();
      results.push({ agent: agent.name, result: data });

      emit('paid', {
        agent: agent.name,
        amount: agent.price,
        txHash: data.txHash,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${data.txHash}`
      });
    } catch (err) {
      emit('error', { agent: agent.name, error: String(err) });
    }
  }

  // Step 3: Synthesize results with Claude
  const summaryResponse = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `User asked: "${query}". Agent results: ${JSON.stringify(results)}. Provide a clear, concise answer.`
    }]
  });

  const summary = summaryResponse.content[0].type === 'text' ? summaryResponse.content[0].text : '';
  emit('complete', { summary, totalAgents: results.length });
}
```

---

## Pattern 4: Recursive Agent (DeepResearch)

```typescript
// backend/src/agents/research.ts
import { createPaywall } from '../x402/middleware';
import { x402Fetch } from '../x402/client';

router.post('/', createPaywall(0.01), async (req, res) => {
  const { input, depth = 0 } = req.body;

  // Recursive A2A: Research agent hires sub-agents
  const [summaryRes, sentimentRes] = await Promise.all([
    x402Fetch('http://localhost:4000/agents/summarize', {
      method: 'POST',
      body: JSON.stringify({ input, parentDepth: depth }),
    }),
    x402Fetch('http://localhost:4000/agents/sentiment', {
      method: 'POST',
      body: JSON.stringify({ input, parentDepth: depth }),
    })
  ]);

  const summary = await summaryRes.json();
  const sentiment = await sentimentRes.json();

  res.json({
    agent: 'DeepResearch',
    depth,
    subAgentsHired: ['Summarizer', 'SentimentAI'],
    result: { summary: summary.data, sentiment: sentiment.data },
    totalCost: 0.01 + 0.001 + 0.001,  // research + summarize + sentiment
  });
});
```

---

## Pattern 5: Soroban Agent Registry Contract

```rust
// contracts/agent-registry/src/lib.rs
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec};

#[contracttype]
pub struct Agent {
    pub name: String,
    pub owner: Address,
    pub endpoint: String,
    pub price_usdc: i128,   // in stroops: 1 = 0.0000001 USDC
    pub reputation: i128,   // basis points 0-10000
    pub jobs_completed: u64,
    pub jobs_failed: u64,
}

#[contracttype]
pub enum DataKey {
    Agent(Symbol),
    AgentList,
}

#[contract]
pub struct AgentRegistry;

#[contractimpl]
impl AgentRegistry {
    pub fn register_agent(
        env: Env,
        name: Symbol,
        owner: Address,
        endpoint: String,
        price_usdc: i128,
    ) {
        owner.require_auth();
        let agent = Agent {
            name: String::from_str(&env, ""),
            owner: owner.clone(),
            endpoint,
            price_usdc,
            reputation: 5000,   // Start at 50% reputation
            jobs_completed: 0,
            jobs_failed: 0,
        };
        env.storage().persistent().set(&DataKey::Agent(name.clone()), &agent);
    }

    pub fn record_job_result(env: Env, name: Symbol, success: bool) {
        let mut agent: Agent = env.storage().persistent().get(&DataKey::Agent(name.clone())).unwrap();
        if success {
            agent.jobs_completed += 1;
            agent.reputation = (agent.reputation + 50).min(10000);
        } else {
            agent.jobs_failed += 1;
            agent.reputation = (agent.reputation - 100).max(0);
        }
        env.storage().persistent().set(&DataKey::Agent(name), &agent);
    }

    pub fn get_agent(env: Env, name: Symbol) -> Option<Agent> {
        env.storage().persistent().get(&DataKey::Agent(name))
    }
}
```

---

## Pattern 6: SSE Streaming (Backend)

```typescript
// backend/src/sse.ts
import { Response } from 'express';

export class SSEEmitter {
  private clients: Map<string, Response> = new Map();

  addClient(id: string, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('data: {"type":"connected"}\n\n');
    this.clients.set(id, res);
  }

  emit(id: string, eventType: string, data: any) {
    const client = this.clients.get(id);
    if (client) {
      client.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
    }
  }

  removeClient(id: string) {
    this.clients.delete(id);
  }
}
```

---

## Pattern 7: Stellar Wallet Setup (testnet)

```typescript
// backend/src/stellar/wallet.ts
import { Keypair, Networks, StellarSdk } from '@stellar/stellar-sdk';
import fetch from 'node-fetch';

export async function createAndFundWallet(): Promise<{ publicKey: string; secretKey: string }> {
  const keypair = Keypair.random();

  // Fund with friendbot (testnet only)
  await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`);

  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

// Pre-generate wallets for each agent and put secret keys in .env
// Run once: npx ts-node -e "const {createAndFundWallet} = require('./src/stellar/wallet'); createAndFundWallet().then(console.log)"
```

---

## Pattern 8: Frontend SSE Consumer + Topology

```typescript
// frontend/src/components/AgentChat.tsx — SSE hook
import { useState, useEffect, useRef } from 'react';

export function useAgentStream(sessionId: string) {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const es = new EventSource(`/api/events/${sessionId}`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [...prev, data]);
    };

    return () => es.close();
  }, [sessionId]);

  return events;
}
```

---

## Deployment (Render.com — free tier)

```yaml
# render.yaml
services:
  - type: web
    name: synergi-backend
    env: node
    buildCommand: cd backend && npm install && npm run build
    startCommand: cd backend && npm start
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: MANAGER_SECRET_KEY
        sync: false
      - key: FACILITATOR_URL
        value: https://x402-stellar-491bf9f7e30b.herokuapp.com

  - type: web
    name: synergi-frontend
    env: node
    buildCommand: cd frontend && npm install && npm run build
    startCommand: cd frontend && npm start
```

---

## Common Pitfalls

1. **x402 payment fails silently** → Check facilitator URL is correct testnet endpoint
2. **Manager wallet has no USDC** → Fund with testnet USDC at https://xlm402.com or laboratory.stellar.org
3. **Soroban contract not found** → Always use CONTRACT_ID from deploy output, not hardcoded
4. **SSE drops connection** → Add `res.flushHeaders()` immediately after setting headers
5. **Claude returns non-JSON** → Always wrap parse in try/catch + strip markdown fences
6. **Recursive depth loop** → Add `depth` param and `if (depth > 2) return early`

---

## Quick Testnet Setup

```bash
# 1. Generate manager wallet
npx ts-node -e "
const { Keypair } = require('@stellar/stellar-sdk');
const kp = Keypair.random();
console.log('Public:', kp.publicKey());
console.log('Secret:', kp.secret());
"

# 2. Fund with friendbot
curl "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"

# 3. Get testnet USDC (via SEP-24 at testanchor.stellar.org or xlm402.com)

# 4. Deploy Soroban contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/agent_registry.wasm \
  --source MANAGER_SECRET_KEY \
  --network testnet
```