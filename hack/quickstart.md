# SynergiStellar — Quick Start Guide
## From Zero to x402 Payments in 30 Minutes

---

## Prerequisites

```bash
node --version    # need 18+
cargo --version   # need Rust (for Soroban contracts)
stellar --version # install: cargo install --locked stellar-cli
```

---

## Step 1: Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/synergi-stellar
cd synergi-stellar
npm run install:all  # installs all workspaces
```

**package.json (root):**
```json
{
  "name": "synergi-stellar",
  "workspaces": ["backend", "frontend", "mcp-server"],
  "scripts": {
    "install:all": "npm install && npm install --workspaces",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "dev": "concurrently \"npm:dev:backend\" \"npm:dev:frontend\""
  }
}
```

---

## Step 2: Generate & Fund Wallets

```bash
# Run this script to generate all needed wallets
node scripts/setup-wallets.js
```

**scripts/setup-wallets.js:**
```javascript
const { Keypair } = require('@stellar/stellar-sdk');
const fetch = require('node-fetch');

const wallets = [
  'MANAGER',
  'AGENT_PRICE',
  'AGENT_NEWS',
  'AGENT_SUMMARIZE',
  'AGENT_SENTIMENT',
  'AGENT_MATH',
  'AGENT_RESEARCH',
];

async function setup() {
  const envLines = [];

  for (const name of wallets) {
    const kp = Keypair.random();

    // Fund with friendbot
    await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    console.log(`✅ ${name}: ${kp.publicKey()}`);

    envLines.push(`${name}_PUBLIC=${kp.publicKey()}`);
    envLines.push(`${name}_SECRET=${kp.secret()}`);

    await new Promise(r => setTimeout(r, 500)); // rate limit
  }

  require('fs').writeFileSync('backend/.env.generated', envLines.join('\n'));
  console.log('\n✅ Wallets created! Copy backend/.env.generated into backend/.env');
}

setup();
```

---

## Step 3: Deploy Soroban Contract

```bash
cd contracts/agent-registry

# Build
stellar contract build

# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/agent_registry.wasm \
  --source-account YOUR_MANAGER_SECRET \
  --network testnet

# Save the output CONTRACT_ID to backend/.env
```

---

## Step 4: Configure Environment

```bash
cp backend/.env.example backend/.env
# Fill in:
# - ANTHROPIC_API_KEY (get at console.anthropic.com)
# - GROQ_API_KEY (free at console.groq.com)
# - All SECRET keys from Step 2
# - CONTRACT_ID from Step 3
```

---

## Step 5: Start Development

```bash
# Terminal 1
npm run dev:backend    # starts on :4000

# Terminal 2
npm run dev:frontend   # starts on :3000

# Terminal 3 (optional — MCP for Claude Code)
cd mcp-server && npm run dev
```

Open http://localhost:3000 → type "Research the latest AI trends and summarize them" → watch the economy come alive!

---

## Step 6: Verify x402 Payments

After a query, check:
1. Transaction log in dashboard
2. Click any tx hash → Stellar testnet explorer
3. You should see real USDC transfers between agent wallets

---

## Testnet USDC

The friendbot only gives XLM. For USDC on testnet:

**Option A** (easiest): Use https://xlm402.com — it's a testnet x402 demo that also shows how to get testnet USDC.

**Option B**: Use Stellar Lab → https://laboratory.stellar.org → Assets → Testnet USDC issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

**Option C**: Use the SEP-24 testnet anchor at https://testanchor.stellar.org

---

## Demo Script (for your video)

1. Open dashboard at localhost:3000
2. Type: **"Research quantum computing, analyze sentiment of recent news, and give me a price check on XLM"**
3. Narrate what's happening:
   - "Manager Agent (Claude) is planning the task..."
   - "It's hiring DeepResearch for 0.01 USDC..."
   - "DeepResearch recursively hired Summarizer and SentimentAI..."
   - "PriceFeed was also hired for XLM price..."
   - "All payments settled in under 5 seconds on Stellar..."
   - "Here are the on-chain transactions..." (click explorer links)
4. Show the topology graph with animated payment flows
5. Show the protocol trace with raw 402 headers

---

## Submission Checklist

- [ ] `README.md` is comprehensive (what's real vs mocked)
- [ ] All x402 payments link to Stellar testnet explorer
- [ ] Soroban contract address in README
- [ ] `SKILL.md` at repo root
- [ ] Demo video is 2-3 minutes, shows full A2A flow
- [ ] Repo is public
- [ ] Submitted at dorahacks.io before April 13, 22:30