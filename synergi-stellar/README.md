# SynergiStellar

**Recursive Agent-to-Agent economy on Stellar.**  
AI agents autonomously hire, negotiate, and pay each other in USDC using the **x402 payment protocol**.

---

## 📺 Demo Video
[Insert your Loom/OBS link here]

## 🔗 Live Transactions
[Insert stellar.expert link to manager public key here]  
*Example: https://stellar.expert/explorer/testnet/account/GA6HAFXLP2UR3YRETIHT6PFCD62BF2QUP6OLXOXF5T5PX723ZZPG7ETA*

---

## 🚀 The SynergiStellar Edge
Most submissions show "one agent calling one API." SynergiStellar demonstrates **Recursive A2A**: 
The Manager agent decomposes tasks into sub-tasks, hiring specialized workers (Price, Sentiment, News). These workers can themselves hire further sub-agents, creating a decentralized web of expertise. Our **Live Topology Graph** visualizes this "Invisible Economy" in real-time.

---

## 📊 What's Real vs Mock

| Feature | Status | Implementation Details |
|---|---|---|
| **x402 Payments** | **REAL** | Programmatic USDC transfers on Stellar Testnet. |
| **Agent Wallets** | **REAL** | Funded via Friendbot; each agent has a unique identity. |
| **Recursive Hiring** | **REAL** | Multi-hop agent service discovery and fulfillment. |
| **Soroban Registry** | *Mock* | In-memory registry (Soroban contract scaffold included). |
| **Agent Data** | *Mock* | AI-simulated payloads for stable demo-day performance. |

---

## 🛠 Setup in 5 Steps

### 1. Workdir
```bash
cd synergi-stellar
```

### 2. Wallets
```bash
npm run setup
```
*This generates `backend/.env.generated` with funded Stellar identities.*

### 3. Environment
```bash
cp backend/.env.generated backend/.env
```
Add your `GROQ_API_KEY` (preferred) or `ANTHROPIC_API_KEY` to `backend/.env`.

### 4. Install
```bash
npm install
```

### 5. Launch
```bash
npm run dev
```
*Open http://localhost:3000 to view the Dashboard.*

---

## 🏗 Technical Architecture

- **Backend**: FastAPI/Express orchestrator using the x402 protocol.
- **Frontend**: Next.js 14 + D3.js real-time money-flow visualization.
- **Protocol**: x402 for agent-to-agent payment handshakes.
- **Settlement**: USDC on Stellar Testnet for sub-second finality.

## 📄 Documentation
Comprehensive guides are available in the `/docs` folder:
- [Architecture](file:///home/anand/work/blockchain/dorahacks/stellar/synergi-stellar/docs/architecture.md)
- [Pitch Deck](file:///home/anand/work/blockchain/dorahacks/stellar/synergi-stellar/docs/overview.md)
- [Demo Script](file:///home/anand/work/blockchain/dorahacks/stellar/synergi-stellar/docs/DEMO_SCRIPT.md)

---
**Build the future of AI commerce on Stellar.**
