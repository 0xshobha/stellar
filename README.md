# SynergiStellar

**Recursive agent-to-agent economy on Stellar.** The manager decomposes tasks, **selects competing workers** from a **Soroban-backed registry** (or a local mirror when `CONTRACT_ID=LOCAL_MOCK_CONTRACT`), pays via **x402**, and streams settlement + topology to the UI.

---

## Why this matters

Workers are **not hardcoded singletons**: multiple registry IDs share a capability (e.g. `prc_bas` vs `prc_pro` for `price`). The manager scores **reputation vs price**, respects an optional **budget** parsed from the query (e.g. “under **$0.02**”), and **retries with the next-best agent** after failures (up to three attempts per step). **DeepResearch** plans sub-capabilities dynamically (LLM when keys exist, heuristic fallback) and fans out **parallel** paid calls.

---

## Quick start (repo root)

```bash
npm run setup
cp backend/.env.generated backend/.env
# Required for summarization / manager LLM planning: add at least one of:
#   ANTHROPIC_API_KEY   or   GROQ_API_KEY
npm install
npm run dev
```

Open **http://localhost:3000**. For a health/observability JSON snapshot, call the backend directly, e.g. **GET `http://localhost:4000/api/system/status`** (x402 mode, registry agent count, which API keys are present).

---

## What is actually “real” now

| Area | Behavior |
|------|-----------|
| **Price** | [CoinGecko](https://www.coingecko.com/) public API (optional `COINGECKO_API_KEY` for higher limits). |
| **News** | [NewsAPI](https://newsapi.org/) when `NEWS_API_KEY` is set; otherwise [Hacker News Algolia](https://hn.algolia.com/) JSON search. |
| **Sentiment** | Lexicon scoring always; **HF inference** for tier `sen_nlp` when `HUGGINGFACE_API_TOKEN` is set. |
| **Summarize** | **Claude** or **Groq** only — returns **503** if no LLM key (no fake summary text). |
| **Math** | Sandboxed `Function` eval of sanitized arithmetic expressions. |
| **Research** | Dynamic capability list → parallel x402 calls into other workers; optional LLM plan. |
| **x402** | Unchanged: mock vs real controlled by `X402_MODE` / `X402_ENFORCE` / `X402_REAL_ONLY`. |
| **Soroban** | With a real `CONTRACT_ID`, the backend **simulates `list_agents`** on a timer and merges on-chain prices/reputation; **`record_job_result`** is submitted after each job (best effort). With `LOCAL_MOCK_CONTRACT`, all registry state stays in process memory but uses the **same selection and scoring rules**. |

---

## Repository layout

| Path | Role |
|------|------|
| `backend/` | Manager, workers, x402, Soroban client, `/api/system/status` |
| `frontend/` | Next.js dashboard, SSE, catalog |
| `contracts/agent-registry/` | Soroban contract: `list_agents`, `get_agents_by_capability`, `get_best_agent`, `record_job_result`, `register_agent` (+ `capability` field) |
| `mcp-server/` | MCP tools (registry ids + legacy role names for direct calls) |
| `docs/` | Deeper architecture / pitch |

---

## Environment

See **`backend/.env.example`**. Important keys:

- **LLM:** `ANTHROPIC_API_KEY` and/or `GROQ_API_KEY` (summarizer + parts of manager/research).
- **Stellar / x402:** `MANAGER_SECRET_KEY`, agent `AGENT_*_PUBLIC_KEY`, `X402_MODE`, `FACILITATOR_URL`, etc.
- **Registry:** `CONTRACT_ID`, optional `SOROBAN_RPC_URL`.
- **Data:** `NEWS_API_KEY`, `COINGECKO_API_KEY`, `HUGGINGFACE_API_TOKEN` (all optional with fallbacks except summarizer LLM).

---

## Soroban migration (breaking)

The Rust contract adds a **`capability`** field on `Agent` and extends **`register_agent`**. Redeploy WASM, then register agents whose **`name` symbol** matches backend IDs (`prc_bas`, `prc_pro`, …) and whose **`endpoint`** matches HTTP routes (`price`, `news`, …). Price on chain should be in **micro-USDC** (6 decimals), consistent with how the TS client decodes `price_usdc`.

---

## Further reading

- [Architecture](docs/architecture.md)
- [Overview / pitch](docs/overview.md)
- [Demo talking points](docs/DEMO_SCRIPT.md)

---

## Submission placeholders

- **Demo video:** add your link here.
- **Explorer:** stellar.expert link for the manager and representative USDC txs.

---

## License

See [license.md](license.md).
