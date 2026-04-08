const fs = require('node:fs');
const path = require('node:path');

const { Keypair } = require(require.resolve('@stellar/stellar-sdk', { paths: [path.resolve(__dirname, '../backend')] }));

const GENERATED_ENV_PATH = path.resolve(__dirname, '../backend/.env.generated');

const walletSpecs = [
  { name: 'MANAGER', publicKey: 'MANAGER_PUBLIC', secretKey: 'MANAGER_SECRET' },
  { name: 'AGENT_PRICE', publicKey: 'AGENT_PRICE_PUBLIC_KEY', secretKey: 'AGENT_PRICE_SECRET' },
  { name: 'AGENT_NEWS', publicKey: 'AGENT_NEWS_PUBLIC_KEY', secretKey: 'AGENT_NEWS_SECRET' },
  { name: 'AGENT_SUMMARIZE', publicKey: 'AGENT_SUMMARIZE_PUBLIC_KEY', secretKey: 'AGENT_SUMMARIZE_SECRET' },
  { name: 'AGENT_SENTIMENT', publicKey: 'AGENT_SENTIMENT_PUBLIC_KEY', secretKey: 'AGENT_SENTIMENT_SECRET' },
  { name: 'AGENT_MATH', publicKey: 'AGENT_MATH_PUBLIC_KEY', secretKey: 'AGENT_MATH_SECRET' },
  { name: 'AGENT_RESEARCH', publicKey: 'AGENT_RESEARCH_PUBLIC_KEY', secretKey: 'AGENT_RESEARCH_SECRET' }
];

async function friendbot(name, publicKey) {
  const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Friendbot failed for ${name}: ${res.status}`);
    } else {
      console.log(`Funded ${name}: ${publicKey}`);
    }
  } catch (error) {
    console.warn(`Friendbot failed for ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }

  await delay(500);
}

function parseEnvFile(content) {
  const lines = content.split(/\r?\n/);
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    result[key] = value;
  }
  return result;
}

async function runFriendbotForAll(wallets) {
  for (const wallet of wallets) {
    await friendbot(wallet.name, wallet.publicKey);
  }
}

function printFinalChecklist() {
  console.log(`
=== SynergiStellar Setup Complete ===

DONE:
[x] Wallets generated
[x] All wallets funded with testnet XLM via friendbot

TODO:
[ ] Copy backend/.env.generated values into backend/.env
[ ] Add your ANTHROPIC_API_KEY to backend/.env
[ ] (Optional) Get testnet USDC at: https://testanchor.stellar.org/sep24/...
    or use: https://laboratory.stellar.org/#account-creator?network=test
[ ] (Optional) Deploy Soroban contract:
    cd contracts/agent-registry
    cargo build --target wasm32-unknown-unknown --release
    stellar contract deploy --wasm target/wasm32-unknown-unknown/release/agent_registry.wasm \
      --source MANAGER_SECRET --network testnet
[ ] Run: npm run dev
[ ] Open: http://localhost:3000

Stellar Explorer (Manager):
https://stellar.expert/explorer/testnet/account/MANAGER_PUBLIC_KEY
`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printChecklist() {
  printFinalChecklist();
}

async function runGenerateAndFund() {
  const lines = [];
  const wallets = [];

  for (const spec of walletSpecs) {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const secretKey = keypair.secret();
    lines.push(`${spec.publicKey}=${publicKey}`);
    lines.push(`${spec.secretKey}=${secretKey}`);
    wallets.push({ name: spec.name, publicKey });
  }

  fs.writeFileSync(GENERATED_ENV_PATH, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Generated ${GENERATED_ENV_PATH}`);

  await runFriendbotForAll(wallets);
  printChecklist();
}

async function runFundOnly() {
  if (!fs.existsSync(GENERATED_ENV_PATH)) {
    throw new Error(`Missing ${GENERATED_ENV_PATH}. Run script without --fund-only first.`);
  }

  const content = fs.readFileSync(GENERATED_ENV_PATH, 'utf8');
  const envVars = parseEnvFile(content);
  const wallets = Object.entries(envVars)
    .filter(([key, value]) => key.includes('PUBLIC') && Boolean(value))
    .map(([key, value]) => ({ name: key, publicKey: value }))
    .filter((item) => Boolean(item.publicKey));

  if (wallets.length === 0) {
    throw new Error(`No *_PUBLIC_KEY entries found in ${GENERATED_ENV_PATH}.`);
  }

  await runFriendbotForAll(wallets);
  printChecklist();
}

async function run() {
  const fundOnly = process.argv.includes('--fund-only');
  if (fundOnly) {
    await runFundOnly();
    return;
  }

  await runGenerateAndFund();
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
