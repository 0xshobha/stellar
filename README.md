# SynergiStellar

Autonomous agents that **hire, compete, and pay each other** on **Stellar**.

- USDC settlement via **x402** (HTTP 402, facilitator, on-chain tx)
- Agents are **discovered and ranked** via a **Soroban on-chain registry** (`list_agents`, capabilities, `get_best_agent`, `record_job_result`)
- Manager **decision engine** (reputation vs price) + optional **Claude** planner (roles only)
- **Recursive** execution (e.g. research fans out paid sub-calls)

## Demo

Add your **recording or live URL** here when ready.

## Live flow

1. Run the app (see below).
2. Open the **Dashboard**, submit a query, e.g.  
   `Analyze AI payment trends under $0.02`
3. Watch **SSE**, **topology**, **transaction log** (Stellar Expert links on settled hashes).

```mermaid
flowchart LR
  subgraph client["Client"]
    U[User]
    UI[Next.js dashboard]
  end

  subgraph api["Backend"]
    Q["POST /api/query"]
    M[Manager]
    W[Worker agents]
  end

  subgraph chain["Stellar"]
    R[Soroban registry]
    X[x402 facilitator]
    L[Ledger / USDC]
  end

  U --> UI
  UI -->|SSE + status| Q
  Q --> M
  M -->|registry reads| R
  M -->|HTTP + payment| W
  W -->|recursive hire| W
  M -.->|sign + settle| X
  X -.-> L
  W -.->|per-request paywall| X
```

## Quick start

```bash
npm run setup
cp backend/.env.generated backend/.env
# Set CONTRACT_ID + keys — see backend/.env.example
npm install
npm run dev
```

- App: `http://localhost:3000`
- API: `http://localhost:4000` (or `http://127.0.0.1:4000`)

Copy `frontend/.env.local.example` → `frontend/.env.local` so the Next.js `/api/*` proxy targets the backend (defaults to `127.0.0.1:4000` in dev if unset).

**Local dev vs production:** In **`development`**, if Soroban bootstrap fails (bad `CONTRACT_ID`, RPC, or empty `list_agents`), the API still listens so you can verify `/health` and the dashboard proxy. In **`production`**, bootstrap failure exits the process.

## Repo layout

| Path | Role |
|------|------|
| `backend/src/core/` | Manager, scoring |
| `backend/src/payments/` | x402 client/middleware, wallet, XLM helpers, receipts |
| `backend/src/registry/` | On-chain registry sync, Soroban RPC, competition snapshot |
| `backend/src/infra/` | Config, store, logger, SSE, LLM helpers |
| `backend/src/agents/` | Worker routes |
| `frontend/` | Dashboard, docs, proxy |
| `contracts/agent-registry/` | Rust Soroban contract |
| `docs/` | Markdown (`/docs` in app) |

## Configuration

Secrets only in **`backend/.env`**. **`CONTRACT_ID`** must be your **deployed** Soroban registry with registered agents for real manager runs. Production startup requires a successful `list_agents` sync; development keeps the server up with a warning if sync fails.

## License

See [license.md](license.md).
