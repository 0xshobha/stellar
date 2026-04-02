# SynergiStellar

SynergiStellar is a hackathon-ready autonomous agent economy on Stellar. It includes a manager agent, paid worker agents, x402-style payment flow, live SSE dashboard, Soroban contract scaffold, and MCP server tools.

## Project Structure

```
synergi-stellar/
├── backend/
├── frontend/
├── contracts/agent-registry/
├── mcp-server/
└── scripts/
```

## Prerequisites

- Node.js 18+
- npm 9+
- Rust + Cargo (for Soroban contract build)
- Stellar CLI (optional for on-chain deploy)

## Setup

1. Install dependencies:

```bash
npm install
npm run install:all
```

2. Configure backend environment:

```bash
cp backend/.env.example backend/.env
```

3. Configure frontend environment:

```bash
cp frontend/.env.local.example frontend/.env.local
```

## Run locally

```bash
npm run dev
```

- Backend: http://localhost:4000
- Frontend: http://localhost:3000

## Build all workspaces

```bash
npm run build
```

## Contract build

```bash
cd contracts/agent-registry
cargo build --release
```

For Stellar deploy, use `stellar contract deploy` with your testnet identity.

## MCP server

Run the MCP server:

```bash
npm run dev:mcp
```

Set `BACKEND_URL` if backend is not on localhost:4000.

## API summary

- `POST /api/query`
- `GET /api/events/:sessionId`
- `GET /api/status/:sessionId`
- `GET /api/transactions`
- `GET /api/wallet/balance`
- `POST /api/wallet/create`
- `GET /agents/catalog`
- `GET /agents/reputation/:agentName`

## Real vs Mock

- x402 integration supports two modes:
  - mock mode: `X402_MODE=mock` (default), local simulation
  - real mode: `X402_MODE=real`, official facilitator verification/settlement with `@x402/stellar`
- To enforce demo-day fail-fast behavior, set:
  - `X402_ENFORCE=true`
  - `X402_MODE=real`
  - `X402_REAL_ONLY=true`
- In real mode, set manager and agent Stellar keys in `backend/.env`:
  - `MANAGER_SECRET_KEY`
  - `AGENT_PRICE_PUBLIC_KEY`, `AGENT_NEWS_PUBLIC_KEY`, `AGENT_SUMMARIZER_PUBLIC_KEY`, `AGENT_SENTIMENT_PUBLIC_KEY`, `AGENT_MATH_PUBLIC_KEY`, `AGENT_RESEARCH_PUBLIC_KEY`
- Wallet and transaction explorer links: real transaction URLs; simulated paths are clearly labeled when not settled
- Worker data sources: mocked deterministic responses
- Soroban contract: real Rust scaffold ready for testnet deployment
