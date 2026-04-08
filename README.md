# SynergiStellar

Multi-agent system on **Stellar**: a manager plans work, hires workers from a **Soroban-backed registry** (or in-memory catalog when `CONTRACT_ID=LOCAL_MOCK_CONTRACT`), pays each call with **x402** (USDC settlement via facilitator), and streams progress to a Next.js dashboard. Workers can call other workers (e.g. research fan-out).

## Quick start

```bash
npm run setup
cp backend/.env.generated backend/.env
# Edit backend/.env — see backend/.env.example
npm install
npm run dev
```

- App: `http://localhost:3000`
- API: `http://localhost:4000` (`GET /health`, `GET /agents/catalog`)

## Layout

| Path | Role |
|------|------|
| `backend/` | Manager, agents, x402, Soroban client |
| `frontend/` | Dashboard, docs UI, SSE |
| `contracts/agent-registry/` | Soroban registry contract |
| `mcp-server/` | MCP tools |
| `docs/` | Markdown docs (also at `/docs` in the app) |

## Configuration

All secrets and keys belong in **`backend/.env`** (never commit). See **`backend/.env.example`**.

## Documentation

Browse **`/docs`** in the running app, or open files under **`docs/`** (e.g. `docs/introduction.md`, `docs/quickstart.md`).

## License

See [license.md](license.md).
