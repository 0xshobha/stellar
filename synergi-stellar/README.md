# SynergiStellar

> [!IMPORTANT]
> If you are in the monorepo root, ensure you `cd synergi-stellar` before running any commands.

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

## Quick local setup (5 steps)

1. Generate and fund manager + 6 agent wallets:

```bash
npm run setup
```

2. Copy generated wallet variables into backend env:

```bash
cp backend/.env.example backend/.env
# then copy values from backend/.env.generated into backend/.env
```

3. Add your Groq key in backend env (free-tier friendly):

```bash
# In backend/.env
GROQ_API_KEY=<your-groq-cloud-api-key>
```

4. Start local services from repo root:

```bash
npm run dev
```

5. Open the app:

- http://localhost:3000

Explorer link pattern for transactions:

- https://stellar.expert/explorer/testnet/tx/{hash}

## Backend server deployment

Use this when running backend on a VPS/cloud server.

### 1) Install and build backend

```bash
cd backend
npm install
npm run build
```

### 2) Configure backend environment for server

Create/update `backend/.env`:

```bash
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
BACKEND_BASE_URL=https://your-backend-domain.com
LOG_LEVEL=info
STELLAR_NETWORK=testnet
X402_MODE=mock
X402_REAL_ONLY=false
X402_ENFORCE=false
```

Notes:

- Keep `PORT` aligned with your platform-provided port if required.
- `HOST=0.0.0.0` allows external access through your reverse proxy or load balancer.

### 3) Start backend in production

```bash
npm run start
```

### 4) Verify server health

```bash
curl http://127.0.0.1:4000/health
```

Expected response includes `{ "ok": true }`.

### 5) Optional process manager (PM2)

```bash
npm install -g pm2
pm2 start dist/index.js --name synergi-backend
pm2 save
pm2 startup
```

## Full server run (frontend + backend)

From repository root:

```bash
npm run build:server
npm run start:server
```

Recommended server environment setup:

- Backend (`backend/.env`): `BACKEND_BASE_URL=https://api.yourdomain.com`, `CONTRACT_ID=<DEPLOYED_CONTRACT_ID>`
- Frontend (`frontend/.env.local`):
  - `NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com`
  - `BACKEND_URL=https://api.yourdomain.com`
  - `NEXT_PUBLIC_SITE_URL=https://app.yourdomain.com`

Verification endpoint for contract linkage:

- `GET /api/chain/config` returns network, contract id, and x402 mode.

## Vercel deployment (fixes NOT_FOUND)

Deploy only the Next.js frontend app from `synergi-stellar/frontend`.

If you import the whole repository and Vercel points to the wrong root, you can get `NOT_FOUND` even when code builds locally.

### Vercel project settings

- Framework Preset: `Next.js`
- Root Directory: `synergi-stellar/frontend`
- Build Command: `npm run build`
- Install Command: `npm install`

### Required Vercel environment variables (Frontend project)

- `BACKEND_URL=https://<your-backend-domain>`
- `NEXT_PUBLIC_BACKEND_URL=https://<your-backend-domain>`
- `NEXT_PUBLIC_SITE_URL=https://<your-frontend-domain>`
- `NEXT_PUBLIC_STELLAR_NETWORK=testnet` (or `mainnet`)
- `NEXT_PUBLIC_REQUIRED_FREIGHTER_ADDRESS=<optional-wallet-public-key>`

### Why NOT_FOUND happens here

- Vercel receives requests at the deployed URL, but no Next.js app/routes are mounted at that root.
- Most commonly this is a monorepo root-directory mismatch, not a TypeScript error.

## Build all workspaces

```bash
npm run build
```

## Contract setup (Freighter + Testnet, working sequence)

Use this exact order so build/deploy works reliably.

### 1) App network config

- In `backend/.env`: `STELLAR_NETWORK=testnet`
- In `frontend/.env.local`: `NEXT_PUBLIC_STELLAR_NETWORK=testnet`

### 2) Wallet setup (Freighter)

1. Install Freighter extension and create/import wallet.
2. Switch Freighter network to Testnet.
3. Fund the wallet from Friendbot: https://friendbot.stellar.org/
4. Keep your testnet public key ready: `<YOUR_FREIGHTER_PUBLIC_KEY>`

### 3) Install local contract toolchain (one-time)

```bash
rustup default stable
rustup target add wasm32v1-none
stellar --version
```

If `stellar --version` fails, install Stellar CLI first, then re-run the command.

### 4) Build Soroban contract WASM

```bash
cd contracts/agent-registry
cargo build --target wasm32v1-none --release
```

Expected artifact:

`contracts/agent-registry/target/wasm32v1-none/release/agent_registry.wasm`

### 5) Register network and identity in Stellar CLI

```bash
stellar network add testnet --rpc-url https://soroban-testnet.stellar.org:443 --network-passphrase "Test SDF Network ; September 2015"
stellar keys add freighter-testnet --public-key <YOUR_FREIGHTER_PUBLIC_KEY>
```

### 6) Deploy to Stellar testnet

```bash
stellar contract deploy --network testnet --source freighter-testnet --wasm target/wasm32v1-none/release/agent_registry.wasm
```

Copy the returned contract id and set in backend config:

`CONTRACT_ID=<DEPLOYED_CONTRACT_ID>` in `backend/.env`

### 7) Optional smoke call

```bash
stellar contract invoke --id <DEPLOYED_CONTRACT_ID> --network testnet --source freighter-testnet -- register_agent --name price --owner <YOUR_FREIGHTER_PUBLIC_KEY> --endpoint /agents/price --price_usdc 1000000 --recursive false
```

### 8) Run app services

```bash
npm run dev -w backend
npm run dev -w frontend
```

Note: this repo currently keeps agent state in backend memory for local runtime behavior; the contract path above is for testnet deployment and on-chain verification flows.

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
- `GET /api/chain/config`
- `POST /api/wallet/create`
- `GET /agents/catalog`
- `GET /agents/reputation/:agentName`

## Environment variables reference

### Backend (`backend/.env`)

| Key                         | Required                            | Default                | Purpose                                                  |
| --------------------------- | ----------------------------------- | ---------------------- | -------------------------------------------------------- |
| NODE_ENV                    | Yes                                 | development            | Runtime mode (`development`, `test`, `production`)       |
| PORT                        | Yes                                 | 4000                   | Backend listen port                                      |
| HOST                        | Yes                                 | 0.0.0.0                | Bind address for server process                          |
| BACKEND_BASE_URL            | Yes                                 | http://localhost:4000  | Base URL used by internal manager-worker calls           |
| LOG_LEVEL                   | Recommended                         | info                   | Terminal log level (`debug`, `info`, `warn`, `error`)    |
| ANTHROPIC_API_KEY           | Optional                            | empty                  | Optional Anthropic key if you enable Claude planner path |
| GROQ_API_KEY                | Recommended                         | empty                  | Preferred free-tier LLM key for local hackathon setup    |
| MANAGER_SECRET_KEY          | Optional (required for real wallet) | empty                  | Manager Stellar secret key                               |
| STELLAR_NETWORK             | Yes                                 | testnet                | Stellar network (`testnet` or `mainnet`)                 |
| X402_MODE                   | Yes                                 | mock                   | x402 processing mode (`mock` or `real`)                  |
| X402_REAL_ONLY              | Optional                            | false                  | Disable fallback when real mode is expected              |
| FACILITATOR_URL             | Optional                            | Heroku facilitator URL | x402 facilitator endpoint                                |
| X402_MAX_TIMEOUT_SECONDS    | Optional                            | 90                     | Max timeout for x402 requests                            |
| X402_USDC_ASSET_ADDRESS     | Optional                            | empty                  | USDC asset address for real settlement                   |
| AGENT_PRICE_PUBLIC_KEY      | Optional (real mode)                | empty                  | Stellar public key for `PriceFeed` agent                 |
| AGENT_NEWS_PUBLIC_KEY       | Optional (real mode)                | empty                  | Stellar public key for `NewsDigest` agent                |
| AGENT_SUMMARIZER_PUBLIC_KEY | Optional (real mode)                | empty                  | Stellar public key for `Summarizer` agent                |
| AGENT_SENTIMENT_PUBLIC_KEY  | Optional (real mode)                | empty                  | Stellar public key for `SentimentAI` agent               |
| AGENT_MATH_PUBLIC_KEY       | Optional (real mode)                | empty                  | Stellar public key for `MathSolver` agent                |
| AGENT_RESEARCH_PUBLIC_KEY   | Optional (real mode)                | empty                  | Stellar public key for `DeepResearch` agent              |
| CONTRACT_ID                 | Optional                            | LOCAL_MOCK_CONTRACT    | Soroban agent registry contract id                       |
| X402_ENFORCE                | Optional                            | false                  | Enforce payment policy without relaxed fallback          |

### Frontend (`frontend/.env.local`)

| Key                         | Required    | Default               | Purpose                                          |
| --------------------------- | ----------- | --------------------- | ------------------------------------------------ |
| NEXT_PUBLIC_BACKEND_URL     | Yes         | http://localhost:4000 | Backend base URL for API proxy/SSE               |
| NEXT_PUBLIC_STELLAR_NETWORK | Recommended | testnet               | Network label used in UI/runtime assumptions     |
| NEXT_PUBLIC_SITE_URL        | Recommended | http://localhost:3000 | Canonical site URL for metadata, sitemap, robots |

### MCP server (`mcp-server` process env)

| Key                | Required | Default               | Purpose                                    |
| ------------------ | -------- | --------------------- | ------------------------------------------ |
| BACKEND_URL        | Yes      | http://localhost:4000 | Backend URL used by MCP tools              |
| REQUEST_TIMEOUT_MS | Optional | 12000                 | Timeout per backend request from MCP tools |

## Freighter + Soroban (what to change)

If you will use Freighter wallet and Soroban testnet/mainnet flows, update these keys first.

### Backend required changes (`backend/.env`)

| Key                         | Example                    | Why                                            |
| --------------------------- | -------------------------- | ---------------------------------------------- |
| NODE_ENV                    | production                 | Server deployment mode                         |
| PORT                        | 4000                       | Server port (or platform provided port)        |
| HOST                        | 0.0.0.0                    | Expose backend for reverse proxy/load balancer |
| BACKEND_BASE_URL            | https://api.yourdomain.com | Correct absolute backend URL                   |
| STELLAR_NETWORK             | testnet                    | Must match Freighter selected network          |
| CONTRACT_ID                 | C...                       | Deployed Soroban contract id                   |
| X402_MODE                   | real                       | Use real x402 flow                             |
| X402_REAL_ONLY              | true                       | Prevent mock fallback in production            |
| X402_ENFORCE                | true                       | Enforce paid flow                              |
| MANAGER_SECRET_KEY          | S...                       | Manager signing key                            |
| X402_USDC_ASSET_ADDRESS     | C... or G...               | Asset address for USDC settlement              |
| AGENT_PRICE_PUBLIC_KEY      | G...                       | Worker wallet public key                       |
| AGENT_NEWS_PUBLIC_KEY       | G...                       | Worker wallet public key                       |
| AGENT_SUMMARIZER_PUBLIC_KEY | G...                       | Worker wallet public key                       |
| AGENT_SENTIMENT_PUBLIC_KEY  | G...                       | Worker wallet public key                       |
| AGENT_MATH_PUBLIC_KEY       | G...                       | Worker wallet public key                       |
| AGENT_RESEARCH_PUBLIC_KEY   | G...                       | Worker wallet public key                       |

### Frontend required changes (`frontend/.env.local`)

| Key                                    | Example                                                  | Why                                                   |
| -------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| NEXT_PUBLIC_BACKEND_URL                | https://api.yourdomain.com                               | Frontend API/SSE target                               |
| NEXT_PUBLIC_STELLAR_NETWORK            | testnet                                                  | Should match Freighter network                        |
| NEXT_PUBLIC_SITE_URL                   | https://app.yourdomain.com                               | Correct metadata/canonical URLs                       |
| NEXT_PUBLIC_REQUIRED_FREIGHTER_ADDRESS | GD6W54KPBSMLD5ZKYNF7CQFKJUZHMRTC6TN3MVFRGCR2Q7JYCYDGRSWJ | Enforce the exact Freighter account on Connect Wallet |

### Freighter prerequisites

| Item              | Required value                    |
| ----------------- | --------------------------------- |
| Freighter network | Same as `STELLAR_NETWORK`         |
| Wallet funded     | Testnet: Friendbot funded account |
| Browser extension | Freighter installed and unlocked  |

## End-to-end user flows

### Flow 1: Open dashboard and load initial data

1. User opens the frontend at `http://localhost:3000`.
2. Frontend requests `/api/agents/catalog` to show all worker agents and pricing.
3. Frontend requests `/api/docs/latest` to render latest docs links.

### Flow 2: Submit manager query

1. User enters a prompt in Manager Agent Query and clicks Run Manager.
2. Frontend posts `{ query }` to `/api/query`.
3. Backend creates a new `sessionId` and starts manager execution asynchronously.
4. Frontend receives `sessionId` and switches UI into running state.

### Flow 3: Live protocol stream (SSE)

1. Frontend opens EventSource to `/api/events/:sessionId`.
2. Backend streams status events like planning, hiring, paid, step-complete, step-failed, and complete.
3. UI panels update in near real time: protocol trace, transaction log, and topology.

### Flow 4: Session status polling

1. Frontend polls `/api/status/:sessionId` while run is active.
2. Backend returns progress counters, traces, summary, and completion state.
3. Frontend stops polling when the run is complete or failed.

### Flow 5: Manager orchestration and worker execution

1. Manager creates a plan from user query and agent catalog.
2. Manager ranks steps by relevance, cost, and reputation.
3. Manager calls selected worker endpoints (`/agents/*`) with x402 payment-aware fetch.
4. Workers return results and transaction metadata.
5. Manager synthesizes final answer and emits completion event.

### Flow 6: Recursive sub-agent execution

1. If a worker is marked recursive, it can hire other workers.
2. Sub-transactions are recorded with depth metadata.
3. Trace and transaction UI show parent and child hops in one session timeline.

### Flow 7: Payment behavior (mock vs real)

1. In mock mode (`X402_MODE=mock`), payment traces are simulated for local demo.
2. In real mode (`X402_MODE=real`), x402 facilitator flow is used for actual verification/settlement.
3. With `X402_REAL_ONLY=true` and `X402_ENFORCE=true`, fallback simulation is disabled.

### Flow 8: Wallet APIs

1. User (or UI integration) can call `GET /api/wallet/balance` for manager wallet snapshot.
2. User can call `POST /api/wallet/create` to create a sponsored demo wallet.
3. Response includes network and wallet identity values used for demo operations.

### Flow 9: Contract-backed agent state lifecycle

1. Agent owners register agents with endpoint, owner, price, and recursion flag.
2. During operations, job outcomes update reputation and dynamic price.
3. Clients query list/reputation state to decide who to hire next.

### Flow 10: Docs and policy pages

1. User opens `/docs` to browse markdown docs rendered by Next.js.
2. User opens `/docs/[slug]` for specific guide pages.
3. User opens `/privacy` to understand runtime data handling and caveats.

## Real vs Mock

| Capability       | Mock mode (`X402_MODE=mock`)                | Real mode (`X402_MODE=real`)                                               |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| x402 payments    | Simulated payment requirement/receipt flow  | Facilitator verification + settlement via `@x402/stellar`                  |
| Wallet balances  | Local fallback only when key not configured | Live Horizon balance lookup (`/accounts/{publicKey}`)                      |
| Soroban contract | In-memory registry is source of truth       | In-memory registry still active; optional Soroban wiring via `CONTRACT_ID` |

Recommended real-mode env flags for demo-day fail-fast:

- `X402_ENFORCE=true`
- `X402_MODE=real`
- `X402_REAL_ONLY=true`

Stellar explorer transaction pattern:

- https://stellar.expert/explorer/testnet/tx/{hash}

## Submission Checklist

Before final submission, verify:

- [ ] `npm run setup` completed successfully and `backend/.env.generated` exists.
- [ ] `backend/.env` contains valid `MANAGER_SECRET_KEY` and worker public keys.
- [ ] `GROQ_API_KEY` is set in `backend/.env`.
- [ ] For real-mode demo: `X402_MODE=real`, `X402_ENFORCE=true`, and all wallets are funded.
- [ ] Frontend `NEXT_PUBLIC_BACKEND_URL` points to the correct backend origin.
- [ ] All components (`backend`, `frontend`, `mcp-server`) build without errors (`npm run build`).
