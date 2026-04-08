const path = require("path");
const dotenv = require("dotenv");
const StellarSdk = require("stellar-sdk");

const envCandidates = [
  path.resolve(__dirname, ".env"),
  path.resolve(__dirname, ".env.local"),
  path.resolve(__dirname, "..", ".env.local"),
];

for (const envPath of envCandidates) {
  dotenv.config({ path: envPath, override: false });
}

const server = new StellarSdk.Horizon.Server(
  "https://horizon-testnet.stellar.org"
);

if (!process.env.SECRET_KEY) {
  throw new Error("Missing SECRET_KEY. Add it to stellar-agent-project/.env and rerun.");
}

if (!process.env.DESTINATION_PUBLIC_KEY) {
  throw new Error(
    "Missing DESTINATION_PUBLIC_KEY. Add it to stellar-agent-project/.env and rerun."
  );
}

const sourceKeys = StellarSdk.Keypair.fromSecret(process.env.SECRET_KEY);

async function sendPayment() {
  const account = await server.loadAccount(sourceKeys.publicKey());

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: process.env.DESTINATION_PUBLIC_KEY,
        asset: StellarSdk.Asset.native(),
        amount: "1",
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(sourceKeys);

  const result = await server.submitTransaction(transaction);
  console.log("✅ Payment success:", result.hash);
}

sendPayment();

