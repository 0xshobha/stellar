const { Keypair } = require('@stellar/stellar-sdk');
const fs = require('node:fs');
const path = require('node:path');

const GENERATED_ENV_PATH = path.resolve(__dirname, '../backend/.env.generated');

const walletEnvKeys = [
  { public: 'MANAGER_PUBLIC_KEY', secret: 'MANAGER_SECRET_KEY' },
  { public: 'AGENT_PRICE_PUBLIC_KEY', secret: 'AGENT_PRICE_SECRET_KEY' },
  { public: 'AGENT_NEWS_PUBLIC_KEY', secret: 'AGENT_NEWS_SECRET_KEY' },
  { public: 'AGENT_SUMMARIZER_PUBLIC_KEY', secret: 'AGENT_SUMMARIZER_SECRET_KEY' },
  { public: 'AGENT_SENTIMENT_PUBLIC_KEY', secret: 'AGENT_SENTIMENT_SECRET_KEY' },
  { public: 'AGENT_MATH_PUBLIC_KEY', secret: 'AGENT_MATH_SECRET_KEY' },
  { public: 'AGENT_RESEARCH_PUBLIC_KEY', secret: 'AGENT_RESEARCH_SECRET_KEY' }
];

async function friendbot(publicKey) {
  const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Friendbot failed for ${publicKey}: ${response.status} ${details}`);
  }
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

function printChecklist() {
  console.log('\nNext steps checklist:');
  console.log('[ ] Copy values from backend/.env.generated into backend/.env');
  console.log('[ ] Add GROQ_API_KEY in backend/.env (preferred free LLM path)');
  console.log('[ ] Swap X402_MODE=real and X402_ENFORCE=true when testing paid flow');
  console.log('[ ] Fund each wallet with testnet USDC trustline + payment');
  console.log('[ ] Deploy Soroban contract and set CONTRACT_ID in backend/.env');
  console.log('[ ] Run npm run dev from repository root');
}

async function runGenerateAndFund() {
  const lines = [];
  const publicKeys = [];

  for (const entry of walletEnvKeys) {
    const keypair = Keypair.random();
    lines.push(`${entry.public}=${keypair.publicKey()}`);
    lines.push(`${entry.secret}=${keypair.secret()}`);
    publicKeys.push(keypair.publicKey());
  }

  fs.writeFileSync(GENERATED_ENV_PATH, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Generated ${GENERATED_ENV_PATH}`);

  for (const key of publicKeys) {
    await friendbot(key);
    console.log(`Friendbot funded: ${key}`);
  }

  printChecklist();
}

async function runFundOnly() {
  if (!fs.existsSync(GENERATED_ENV_PATH)) {
    throw new Error(`Missing ${GENERATED_ENV_PATH}. Run script without --fund-only first.`);
  }

  const content = fs.readFileSync(GENERATED_ENV_PATH, 'utf8');
  const envVars = parseEnvFile(content);
  const publicKeys = walletEnvKeys.map((entry) => envVars[entry.public]).filter(Boolean);

  if (publicKeys.length === 0) {
    throw new Error(`No *_PUBLIC_KEY entries found in ${GENERATED_ENV_PATH}.`);
  }

  for (const key of publicKeys) {
    await friendbot(key);
    console.log(`Friendbot funded: ${key}`);
  }

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
