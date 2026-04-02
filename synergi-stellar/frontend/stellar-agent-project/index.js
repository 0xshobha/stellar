require("dotenv").config();
const StellarSdk = require("stellar-sdk");

const server = new StellarSdk.Horizon.Server(
  "https://horizon-testnet.stellar.org"
);console.log("SECRET:", process.env.SECRET_KEY);

const sourceKeys = StellarSdk.Keypair.fromSecret(process.env.SECRET_KEY);

async function sendPayment() {
  const account = await server.loadAccount(sourceKeys.publicKey());

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: "DESTINATION_PUBLIC_KEY",
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

