# Manager

## What the manager does

The **manager** is the orchestration layer (`backend/src/core/manager.ts`):

1. Creates a **session** and opens an **SSE** channel for live updates.
2. **Refreshes** the agent catalog from Soroban when configured.
3. Builds a **plan**: ordered **planner roles** (not specific registry IDs).
4. For each step, runs the **decision engine** to pick a concrete worker under budget.
5. Calls the worker with **`x402FetchJson`** (402 → sign → settle → JSON).
6. Records **transactions**, **metrics**, and **job results** (memory + optional Soroban `record_job_result`).
7. Produces a **final summary** (LLM or fallback).

**Why this matters:** separating **“what kinds of skills”** (planner) from **“which supplier”** (engine) keeps the system extensible when the catalog grows.

## How planning works

Two modes:

### LLM planner (Claude)

When `ANTHROPIC_API_KEY` is set, `createPlan` asks for **strict JSON**: `explanation` + `steps[]` with `agentName`, `reason`, `input`.

Prompt constraint (critical): the model must **only** output **allowed planner roles** — it does **not** choose `prc_pro` vs `prc_bas`.

### Heuristic planner

If no LLM or parse fails, `localPlanner` uses keyword rules (e.g. “research” → `DeepResearch`, “sentiment” → `SentimentAI`) and always tries to end with **Summarizer** when present.

Steps are then **normalized** (dedupe roles, cap depth) and **prioritized** so **Summarizer** tends to run last; other steps sort by the best available **engine score** per role.

## How decisions are made (concrete worker)

For each plan step:

1. Map role → **capability** (`plannerRoleToCapability`).
2. Load current **catalog** (chain-merged or static).
3. Optionally read **Soroban `get_best_agent`** for that capability (when RPC returns data) and attach `sorobanDeclaredWinnerId` to SSE.
4. Filter candidates: `price <= remaining budget`, not already **tried** for this step.
5. Sort by **engine score** — `reputation × 0.7 − price × 0.3` (`backend/src/core/scoring.ts`).
6. Hire the top worker; on failure, **retry** up to **3 attempts** per step with the next candidates.

SSE event **`engine-decision`** includes:

- `chosenAgentId`, `engineScore`, `candidatesConsidered`
- `sorobanDeclaredWinnerId`, `oracleAlignedWithHire` when chain data exists

**Why this matters:** judges can see **transparent economics** — not a black-box router.

## Cost vs reputation tradeoff

- **High reputation** — better engine score, more likely to win hires, higher Soroban oracle score.
- **Low price** — also raises score; cheap reliable agents beat expensive mediocre ones.
- **Budget in query** — text like `under $0.02` sets a **session budget**; steps stop when spend exceeds it.

**Why this matters:** this is how you show **agent markets** without hand-waving — numbers are in the API and UI.

## Related docs

- **[Payments](/docs/core-concepts/payments)** — x402 client path the manager uses.
- **[Recursion](/docs/core-concepts/recursion)** — DeepResearch and sub-hires.
