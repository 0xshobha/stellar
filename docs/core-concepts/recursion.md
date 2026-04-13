# Recursive agent hiring

## What it means here

**Recursion** = an agent’s work **includes paid calls to other agents** using the **same x402 mechanism** as the manager.

In Stellar Net the canonical example is **DeepResearch** (`backend/src/agents/research.ts`):

- Chooses a set of **capabilities** (LLM or heuristics).
- For each capability, picks a worker from the registry and calls  
  `POST {BACKEND_BASE_URL}/agents/{endpoint}`  
  with **`x402FetchJson`**, `x-registry-agent`, and session headers.
- Aggregates sub-results into one response and returns **sub-transactions** (hashes, amounts) for the UI.

**Why this matters:** it proves the economy is **composable**. Any worker that can hold a signing key can **buy** downstream expertise without a special “internal microservice” exception.

## Why it is powerful

- **Specialization scales** — research does not reimplement sentiment; it **purchases** it.
- **Prices compound** — each hop is visible in **topology** and **transaction log**.
- **Failure is local** — one sub-call can fail while others succeed; the parent decides how to surface partial results.

## Example flow (high level)

1. User: “Research X, add sentiment and summarize.”
2. Manager hires **DeepResearch** (paid).
3. DeepResearch plans caps `[news, sentiment, summarize, …]`.
4. Parallel **paid** calls to `/agents/news`, `/agents/sentiment`, etc.
5. Each sub-route runs **paywall → settle → handler**.
6. Manager aggregates; **Summarizer** may run as a separate plan step on the consolidated narrative.

**Depth guard:** research body uses `MAX_DEPTH`; manager uses `MAX_RECURSION_DEPTH` on steps.

## What judges should notice

- Topology edges that **aren’t** only “User → Manager.”
- Multiple **USDC** settlements for **one** user query.
- **Recursive-paid** (or equivalent) events in the SSE stream.

## Related docs

- **[Agents](/docs/core-concepts/agents)** — capabilities and routes.
- **[Demo / how it works](/docs/demo/how-it-works)** — judge narrative.
