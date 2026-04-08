# System overview

## Mental model

```text
User (Dashboard)
    → POST /api/query → Manager session (async)
         → Soroban RPC (catalog / best agent) [optional]
         → x402 HTTP → Worker /agents/*
              → x402 HTTP → Sub-workers (e.g. research fan-out)
    ← SSE /api/events/:sessionId + polled /api/status/:sessionId
```

**Why this matters:** the UI is a **lens** on an economic runtime, not the source of truth for payments or registry.

## Components

### Frontend (`frontend/`)

- **Next.js App Router** — dashboard, docs (markdown from `docs/`), API proxy to backend.
- **SSE client** — appends stream events for topology and protocol trace.
- **Agent competition panel** — `GET /api/registry/competition?capability=…`.

### Backend (`backend/`)

| Piece | Path / entry | Responsibility |
|-------|----------------|------------------|
| HTTP API | `src/index.ts` | Query, status, transactions, wallet helpers, registry competition |
| Agents | `src/agents/*.ts`, `src/agents/index.ts` | Capability routers + x402 paywall |
| Manager | `src/core/manager.ts` | Plan, hire, pay, retries, metrics, Soroban job results |
| Payments / x402 | `src/payments/x402Middleware.ts`, `src/payments/x402Client.ts`, `src/payments/wallet.ts`, … | Server paywall, client signing, Stellar helpers |
| Registry | `src/registry/contract.ts`, `src/registry/soroban.ts`, `src/registry/competition.ts` | Catalog merge, RPC reads, competition snapshot |
| Infra | `src/infra/config.ts`, `src/infra/store.ts`, `src/infra/logger.ts`, … | Env, sessions, traces, static seed catalog |

### Soroban (`contracts/agent-registry/`)

- **`register_agent`**, **`list_agents`**, **`get_agents_by_capability`**, **`get_best_agent`**, **`record_job_result`**, **`update_agent_price`**
- **Why:** shared **competition state** any client can read; not locked in one server’s DB.

### MCP (`mcp-server/`)

- Tools for driving agents / registry from compatible clients (optional to the main demo).

## Key HTTP surfaces

- **`POST /api/query`** — starts manager run; returns `sessionId`.
- **`GET /api/events/:sessionId`** — SSE event stream.
- **`GET /api/status/:sessionId`** — session snapshot, metrics, transactions.
- **`GET /agents/catalog`** — merged catalog rows.
- **`GET /api/registry/competition?capability=price`** — Soroban field + scores.

## Data lifetimes

- **In-memory** session state, traces, and transaction lists — cleared on process restart.
- **Chain** — durable registry and USDC movements (testnet/mainnet).

**Why this matters:** pitch “transparency” using **explorer links** and **contract views**, not only in-app logs.

## Related docs

- **[Payments](/docs/core-concepts/payments)** — x402 flow detail.
- **[Create an agent](/docs/guides/create-agent)** — extend the backend.
