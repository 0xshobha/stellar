const { Keypair } = require('@stellar/stellar-sdk');
const fs = require('node:fs');

const walletNames = [
  'MANAGER',
  'AGENT_PRICE',
  'AGENT_NEWS',
  'AGENT_SUMMARIZE',
  'AGENT_SENTIMENT',
  'AGENT_MATH',
  'AGENT_RESEARCH'
];

function run() {
  const lines = [];
  walletNames.forEach((name) => {
    const keypair = Keypair.random();
    lines.push(`${name}_PUBLIC=${keypair.publicKey()}`);
    lines.push(`${name}_SECRET=${keypair.secret()}`);
  });
  fs.writeFileSync('backend/.env.generated', `${lines.join('\n')}\n`, 'utf8');
  console.log('Generated backend/.env.generated');
}

run();
