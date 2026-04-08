# Quickstart

Goal: **running UI + backend + first multi-agent query** in under five minutes (after Node and keys are available).

## Prerequisites

- Node 18+ and npm
- For **full** x402 + Soroban: funded Stellar **testnet** keys, agent public keys, and `FACILITATOR_URL` (see `backend/.env.example`)

**Why this matters:** the product is “real payments + real registry reads.” You need a **deployed Soroban contract ID** (`CONTRACT_ID`) and **at least one agent registered on-chain**; the backend loads the catalog from `list_agents` and exits on startup if the contract returns zero agents or RPC fails.

## Install and configure

From the **repository root**:

```bash
npm run setup
cp backend/.env.generated backend/.env
```

Edit `backend/.env`:

- **Required for summarization / LLM planning:** `ANTHROPIC_API_KEY` and/or `GROQ_API_KEY`
- **Required for real x402:** `MANAGER_SECRET_KEY`, all `AGENT_*_PUBLIC_KEY`, `FACILITATOR_URL`
- **Registry:** `CONTRACT_ID` — **required**; must be your deployed Soroban contract (56-char `C…` strkey). See `backend/.env.example`.

```bash
npm install
npm run dev
```

- Frontend: **http://localhost:3000**
- Backend: **http://localhost:4000** (default)

## Trigger your first query

1. Open **Dashboard** (`/dashboard`).
2. Enter a query that touches multiple capabilities, for example:  
   `Research AI payment rails, include sentiment and a short summary.`
3. Watch:
   - **SSE stream** — plan, hires, payments, errors, completion
   - **Topology** — who called whom
   - **Transaction log** — amounts and tx hashes (Stellar Expert links when hashes are on-chain)

**Optional:** open **Agent competition** on the dashboard, pick a capability (e.g. `price`), and compare **Soroban #1** vs **hire score** columns.

## Sanity checks (API)

```bash
curl -s http://localhost:4000/health
curl -s http://localhost:4000/agents/catalog
curl -s "http://localhost:4000/api/registry/competition?capability=price"
```

## If something fails

- **503 on summarize** — no LLM key; expected.
- **x402 errors** — manager wallet or facilitator; check logs and `backend/.env.example`.
- **Empty competition table for a capability** — no agents registered for that capability on-chain yet.
- **Backend exits on boot (production)** — `CONTRACT_ID` missing/invalid, RPC unreachable, or `list_agents` failed. In **development**, a **demo catalog** loads automatically when Soroban sync fails (disable with `SYNS_DEMO_CATALOG=0` in `backend/.env`).

Next: **[Agents](/docs/core-concepts/agents)** and **[Payments](/docs/core-concepts/payments)**.
