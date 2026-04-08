# SynergiStellar

**Recursive agent-to-agent economy on Stellar.** Specialized AI agents discover work, delegate subtasks, and settle in **USDC on Stellar testnet** using the **x402** payment handshake—not a single monolithic API call.

---

## Why this matters

Most hackathon demos show one model calling one backend. SynergiStellar shows a **manager agent** that breaks user intent into jobs, **hires** worker agents (price, news, sentiment, research, and more), and pays them on-chain. The dashboard exposes a **live topology** and money flow so judges can see the economy, not a black box.

---

## Quick start (from repo root)

```bash
npm run setup
cp backend/.env.generated backend/.env
# Add GROQ_API_KEY or ANTHROPIC_API_KEY to backend/.env
npm install
npm run dev
```

Open **http://localhost:3000** (dashboard). Backend and frontend run together via the root workspace scripts.

---

## Repository layout

| Path | Role |
|------|------|
| `backend/` | Orchestrator, x402, Stellar wallets and USDC flows |
| `frontend/` | Next.js UI, topology graph, agent chat |
| `contracts/` | Soroban agent-registry scaffold |
| `mcp-server/` | MCP bridge for tool-using clients |
| `docs/` | Architecture, pitch notes, in-app doc sources |

---

## Honest scope (what is real vs. stubbed)

| Area | Status | Notes |
|------|--------|--------|
| x402-style payments | Real | Programmatic settlement path on Stellar testnet |
| Agent wallets | Real | Funded via Friendbot; distinct keys per role |
| Recursive hiring / delegation | Real | Manager and workers compose multi-step flows |
| Soroban registry | Stub | Contract scaffold; in-memory registry in app for the demo |
| External “live” data | Simulated | Stable, deterministic payloads for judging and video |

---

## Configuration

- **Backend:** `backend/.env.example` — copy to `.env` after `setup` merges generated keys.
- **Frontend:** `frontend/.env.local.example` — local API base URL if needed.
- **MCP:** `mcp-server/.env.example` — point at your running backend.

---

## Further reading

- [Architecture](docs/architecture.md)
- [Overview / pitch](docs/overview.md)
- [Demo talking points](docs/DEMO_SCRIPT.md)

---

## Submission placeholders

- **Demo video:** add your Loom / YouTube link here.
- **On-chain activity:** add a [stellar.expert](https://stellar.expert) testnet link for the manager public key (see `backend/.env` after setup).

---

## License

See [license.md](license.md).
