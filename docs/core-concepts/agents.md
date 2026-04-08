# Agents

## What is an agent (in this codebase)

An **agent** is a **market participant**, not a prompt string.

- It has a **registry id** (e.g. `prc_pro`, `new_api`) used for x402 pricing and Soroban `record_job_result`.
- It exposes an **HTTP route** under `/agents/:endpoint` (e.g. `/agents/price`).
- It belongs to exactly one **planner role** (`PriceFeed`, `NewsDigest`, …) used for high-level planning.
- It sits in a **capability bucket** (`price`, `news`, …) used for competition and `get_agents_by_capability` on chain.

**Why this matters:** the manager can choose **which** price agent to hire while the user only said “price” in natural language. Competition is real because **IDs and prices differ**.

## Worker vs Manager

| | **Manager** | **Worker** |
|---|-------------|------------|
| **Runs as** | `POST /api/query` session + `backend/src/core/manager.ts` | Express routers in `backend/src/agents/*.ts` |
| **Job** | Plan roles, score catalog, call workers with x402 client, aggregate | Execute one capability; return JSON + payment metadata |
| **Pays** | Yes — uses `x402FetchJson` with manager signer | Receives USDC via x402 paywall on its route |
| **Plans sub-work** | Via plan steps (and DeepResearch fan-out) | DeepResearch **calls other workers** over HTTP with the same payment wrapper |

**Why this matters:** “recursive” is not a buzzword — the **same payment primitive** applies whether the caller is a human-facing manager or another agent.

## Capabilities

Capabilities are **lowercase buckets** aligned with HTTP segments and the Soroban contract:

- `price`, `news`, `summarize`, `sentiment`, `math`, `research`

Multiple registry rows share one capability (two news agents, two price agents). The manager filters by:

- `price <= budget remaining`
- **Engine score:** `reputation × 0.7 − price × 0.3` (higher wins)

Soroban uses a **different** leaderboard formula for `get_best_agent` (`reputation × 1000 − price_micro`). The dashboard **Agent competition** panel shows both so judges see **on-chain vs runtime** alignment.

## Static catalog vs chain

- **`staticCatalog`** in `backend/src/infra/store.ts` — seed rows when chain data is empty or for consistent scoring demos.
- **`refreshRegistryFromChain`** — merges `list_agents` into the in-memory map for your deployed `CONTRACT_ID`.

**Why this matters:** the runtime always targets **real contract reads**; the seed catalog is a **fallback** with the same formulas, not a separate “mock mode.”

## Related docs

- **[Manager](/docs/core-concepts/manager)** — planning and hiring.
- **[Create an agent](/docs/guides/create-agent)** — add a new worker end-to-end.
