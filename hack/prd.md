# 🚀 SYNERGI STELLAR — Product Requirements Document
### x402 Autonomous Agent Economy on Stellar
*Hackathon: Stellar Hacks: Agents — $10,000 Prize Pool | Deadline: April 13, 2026*

---

## 1. Executive Summary

**SynergiStellar** is a decentralized Agent-to-Agent (A2A) economy where AI agents autonomously discover, hire, negotiate, and pay each other using **x402 micropayments on Stellar** with USDC stablecoin settlement. Unlike Synergi (Stacks/Bitcoin), this is purpose-built for Stellar's ecosystem: sub-cent fees, 5-second finality, native USDC, and Soroban smart contracts.

**Why this wins the hackathon:**
- Hits every judging axis: Stellar integration, x402, Claude AI, agentic payments
- Real on-chain transactions on Stellar testnet (required)
- Recursive A2A = visually impressive demo
- Live dashboard + topology graph = undeniable "wow" factor
- Distinct from every other submission (no one else is doing full recursive A2A on Stellar)

---

## 2. Core Differentiators vs Synergi (Stacks version)

| Feature | Synergi (Stacks) | **SynergiStellar** |
|---|---|---|
| Chain | Stacks/Bitcoin L2 | **Stellar** (native) |
| Payment Token | STX / sBTC | **USDC on Stellar** |
| Settlement Speed | ~10 min | **~5 seconds** |
| Tx Cost | ~0.001 STX | **~$0.00001** |
| Smart Contracts | Clarity | **Soroban (Rust)** |
| Agent Wallets | Manual setup | **Stellar Sponsored Account** (instant) |
| Reputation | On-chain Clarity | **On-chain Soroban** |
| AI LLM | Groq/Gemini | **Claude (Anthropic) + Groq fallback** |
| MCP Support | None | **Full MCP server included** |
| x402 Protocol | x402-stacks | **x402-stellar (official)** |

---

## 3. User Personas

**Primary: Hackathon Judges** — Need to see working x402 on Stellar + creative use of agents.

**Secondary: Developer/Builder** — Wants to plug their AI agent into a paid service marketplace.

**Tertiary: Agent Owner** — Wants to monetize their API/tool without managing subscriptions.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js 14 + React 18 + Tailwind)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │AgentChat │ │TopologyG │ │ TxnLog   │ │ProtocolTrace  │  │
│  └────┬─────┘ └──────────┘ └──────────┘ └───────────────┘  │
│       │ POST /api/query    SSE /api/events                  │
├───────┼─────────────────────────────────────────────────────┤
│  BACKEND (Express + @x402/stellar)                          │
│  ┌────▼──────────────────────────────────────────────────┐  │
│  │  Manager Agent (Claude claude-sonnet-4-20250514)      │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │ autonomousHiringDecision(reputation, cost)      │  │  │
│  │  └──────────────┬──────────────────────────────────┘  │  │
│  │                 │ x402 Payment (HTTP 402 → 200)        │  │
│  │  ┌──────┬───────┼──────┬──────┬───────────────────┐   │  │
│  │  │Price │News   │ Math │Summ. │ Research (recursive│   │  │
│  │  │$0.001│$0.002 │$0.003│$0.002│  hires sub-agents)│   │  │
│  │  └──────┴───────┴──────┴──────┴───────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  SOROBAN SMART CONTRACT (Stellar Testnet)                   │
│  agent-registry — Registration, Jobs, Reputation            │
├─────────────────────────────────────────────────────────────┤
│  x402 FACILITATOR (Official Stellar x402 Facilitator)       │
│  https://x402-stellar-491bf9f7e30b.herokuapp.com/           │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Feature Specification

### 5.1 Core Features (MVP — must ship)

#### F1: Manager Agent (Claude-powered)
- Receives natural language query from user
- Uses Claude to plan multi-step task decomposition
- Evaluates available worker agents by reputation + cost
- Issues x402 HTTP requests to worker agents
- Handles recursive hiring (Research agent hires sub-agents)
- Streams execution steps via SSE

#### F2: Worker Agent Registry (6 agents)
| Agent | Endpoint | Price (USDC) | Recursive? |
|---|---|---|---|
| PriceFeed | `/agents/price` | 0.001 | No |
| NewsDigest | `/agents/news` | 0.002 | No |
| Summarizer | `/agents/summarize` | 0.001 | No |
| SentimentAI | `/agents/sentiment` | 0.001 | No |
| MathSolver | `/agents/math` | 0.002 | No |
| DeepResearch | `/agents/research` | 0.01 | **Yes** → hires Summarizer + Sentiment |

#### F3: x402 Payment Flow
- Worker agents gate endpoints with x402 middleware
- Manager agent wallet auto-signs Soroban auth entries
- Official Stellar x402 facilitator processes payments
- Every payment links to Stellar testnet explorer

#### F4: Live Economy Dashboard
- Real-time topology graph (Canvas/D3) showing User→Manager→Worker flows
- Transaction log with A2A depth badges
- Protocol trace (raw 402 headers visible)
- Payment volume counter (USDC)

#### F5: Soroban Reputation Contract
- Agent registration with metadata
- Job lifecycle: created → completed/failed
- Reputation score (basis points: +50 success, -100 failure)
- Dynamic pricing tier based on reputation

#### F6: Stellar Sponsored Agent Accounts
- One-click agent wallet creation (no XLM needed to start)
- Uses Stellar native sponsorship to cover ~1.5 XLM setup
- Auto-fund with testnet USDC via friendbot

### 5.2 Bonus Features (differentiators, add if time permits)

#### B1: Claude MCP Integration
- MCP server exposing agent marketplace to Claude Code
- Let judges interact via `claude` CLI during evaluation

#### B2: Agent Service Discovery API
- GET `/agents/catalog` — returns all agents with prices, reputation, capabilities
- Bazaar-style discoverability (mentioned in hackathon ideas!)

#### B3: Spending Policy Guards
- Per-agent max-spend limits via contract accounts
- Prevents runaway agent spending

---

## 6. Technical Stack

| Layer | Technology | Why |
|---|---|---|
| Blockchain | Stellar Testnet | Required by hackathon |
| Smart Contracts | Soroban (Rust) | Native to Stellar |
| Payment Protocol | x402-stellar (`@x402/stellar`) | Official integration |
| x402 Facilitator | Official Stellar facilitator | Already deployed |
| Backend | Express.js + TypeScript | Fast to build |
| LLM (Manager) | Claude claude-sonnet-4-20250514 | Tagged in hackathon! |
| LLM (Fallback) | Groq llama-3.3-70b | Free tier, fast |
| Frontend | Next.js 14 + Tailwind | Speed of development |
| Topology Graph | D3.js or Canvas API | Real-time agent viz |
| Streaming | Server-Sent Events (SSE) | Simple, works everywhere |
| Agent Wallet | Stellar SDK + Sponsored Accounts | Instant onboarding |

---

## 7. Repository Structure

```
synergi-stellar/
├── contracts/
│   └── agent-registry/
│       ├── src/lib.rs          # Soroban contract
│       └── Cargo.toml
├── backend/
│   ├── src/
│   │   ├── index.ts            # Express server entry
│   │   ├── manager.ts          # Manager Agent (Claude)
│   │   ├── agents/             # Worker agent endpoints
│   │   │   ├── price.ts
│   │   │   ├── news.ts
│   │   │   ├── summarize.ts
│   │   │   ├── sentiment.ts
│   │   │   ├── math.ts
│   │   │   └── research.ts     # Recursive agent
│   │   ├── x402/
│   │   │   ├── middleware.ts   # x402 paywall middleware
│   │   │   └── client.ts      # x402 HTTP client (payer)
│   │   ├── stellar/
│   │   │   ├── wallet.ts      # Agent wallet management
│   │   │   └── contract.ts    # Soroban contract calls
│   │   └── sse.ts             # SSE event streaming
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   └── page.tsx        # Main dashboard
│   │   └── components/
│   │       ├── AgentChat.tsx
│   │       ├── TopologyGraph.tsx
│   │       ├── TransactionLog.tsx
│   │       ├── ProtocolTrace.tsx
│   │       └── AgentCatalog.tsx
│   └── package.json
├── mcp-server/
│   └── src/index.ts            # MCP server for Claude Code
├── SKILL.md                    # AI development skill
├── README.md
└── package.json                # Monorepo root
```

---

## 8. Implementation Roadmap

### Day 1-2 (April 1-2): Foundation
- [ ] Scaffold monorepo with npm workspaces
- [ ] Set up Stellar testnet wallets (manager + all worker agents)
- [ ] Deploy Soroban agent-registry contract
- [ ] Implement x402 middleware on all worker agents
- [ ] Verify first x402 payment on testnet

### Day 3-4 (April 3-4): Core Logic
- [ ] Build Manager Agent with Claude API integration
- [ ] Implement task decomposition and hiring decision logic
- [ ] Build all 6 worker agents (5 simple + 1 recursive)
- [ ] Test recursive hiring flow end-to-end

### Day 5-6 (April 5-6): Frontend
- [ ] Build dashboard layout (chat + topology + logs)
- [ ] Implement real-time SSE consumption
- [ ] Build topology graph with D3/Canvas
- [ ] Protocol trace panel (raw x402 headers)

### Day 7 (April 7): Polish
- [ ] Reputation contract integration
- [ ] Agent catalog / discovery API
- [ ] MCP server implementation
- [ ] Error handling + fallbacks

### Day 8-9 (April 8-9): Testing + Demo
- [ ] Full flow testing on testnet
- [ ] Record 2-3 minute demo video
- [ ] Write comprehensive README
- [ ] Deploy to Render/Vercel/Railway

### Day 10-13 (April 10-13): Submission Buffer
- [ ] Final polish
- [ ] Submit on DoraHacks before April 13 22:30

---

## 9. Submission Checklist

- [ ] Public GitHub repo with complete source code
- [ ] Clear README.md (what you built, how to run, what's mocked)
- [ ] 2-3 minute demo video showing:
  - User types query in chat
  - Manager plans and hires workers
  - Real x402 payments flowing
  - Live topology graph updating
  - Transaction log with Stellar explorer links
- [ ] Stellar testnet transactions visible on-chain
- [ ] Submitted on DoraHacks before April 13, 22:30

---

## 10. Winning Strategy

**Why judges will pick this:**

1. **Technical depth**: Recursive A2A + Soroban contract + x402 + Claude = full-stack hackathon
2. **Alignment with prompt**: Hits every hackathon idea (agent wallets, A2A payments, service discovery, reputation)
3. **Visual demo**: Topology graph with animated payment flows is *undeniable* in a 3-min video
4. **Uses Claude**: Hackathon is literally tagged "Claude" — using Claude as the Manager Agent is strategic
5. **Real on-chain**: Every payment is a real testnet transaction

**Key differentiator over other submissions:** Most projects will do a simple "agent pays for one API call." SynergiStellar shows **recursive, autonomous, multi-agent economic coordination** — agents hiring agents — on Stellar.

---

## 11. Environment Variables

```env
# Backend
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...           # Fallback LLM
MANAGER_SECRET_KEY=S...        # Stellar secret key for manager wallet
STELLAR_NETWORK=testnet        # or mainnet
FACILITATOR_URL=https://x402-stellar-491bf9f7e30b.herokuapp.com
CONTRACT_ID=C...               # Deployed Soroban contract

# Frontend
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

---

## 12. Mock vs Real Distinction (README transparency)

Be honest in your README — judges respect it:

| Feature | Real / Mock |
|---|---|
| x402 payments | **REAL** — Stellar testnet USDC |
| Agent wallet balances | **REAL** — funded via friendbot |
| Soroban contract | **REAL** — deployed testnet |
| Worker agent "intelligence" | Mock (simple rule-based responses) |
| News/Price data | Mock (static JSON, not live APIs) |
| Reputation scoring | Real on-chain, but seeded initial data |