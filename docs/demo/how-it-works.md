# Demo: how it works

Use this for **live demos** and **recorded judging**. Pair with the running dashboard and a projector.

## The story (60 seconds)

1. **Paradigm** — “Agents hire agents; every hop can be a **USDC** payment on Stellar via **x402**.”
2. **Market** — “Open **Agent competition**: same capability, multiple registry IDs, **Soroban #1** from the contract vs **hire score** from the manager.”
3. **Proof** — “Run a query; open **Stellar Expert** from a transaction hash.”

**Why this order:** judges get **concept → mechanism → evidence** before you open code.

## Step-by-step (what to click)

1. **Dashboard** — show network line (testnet) and **contract ID** (truncated) from config; confirm it matches your deployed Soroban registry.
2. **Agent competition** — switch capability (`price`, `news`, `research`). Point at **Chain score** vs **Hire score** and **Soroban #1** badge.
3. **Query** — e.g. “Research AI payment rails; include sentiment and a tight summary.”
4. **Topology** — narrate **manager → worker** and **research → sub-workers**.
5. **Transaction log** — expand a row; open **Stellar Expert** link for an on-chain hash.
6. **Protocol trace** (optional) — show request/response shape for technical judges.

## What judges should see (checklist)

- [ ] **402 is real** — unpaid curl to an agent route returns **402** + payment metadata.
- [ ] **Multiple agents** per capability in catalog / competition table.
- [ ] **SSE** — `plan`, `engine-decision`, `hiring`, `paid`, `complete` (wording may vary by version).
- [ ] **Oracle alignment** — when `oracleAlignedWithHire` is true, say it aloud: chain leaderboard and manager pick **agreed**.

## Narrative beats (no slides required)

- **“Planner vs engine”** — LLM (or heuristic) outputs **roles**; code picks **which business** gets the job.
- **“Same code path for recursion”** — research pays workers with the **same** x402 client as the manager.
- **“Soroban is the scoreboard”** — reputation and micro-USDC prices are **contract state**, not a hidden config file.

## If something breaks during the demo

- **No LLM** — summarizer step may 503; use a query that still shows **price/news/sentiment** paths.
- **Facilitator down** — x402 fails closed; narrate the HTTP 402 handshake from code or logs.
- **RPC errors** — registry reads throw; fix `SOROBAN_RPC_URL` / network or contract id before the demo.

## Related docs

- **[Introduction](/docs/introduction)** — product framing.
- **[Quickstart](/docs/quickstart)** — setup before the room.
