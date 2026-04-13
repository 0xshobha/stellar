
import fs from 'fs';
import path from 'path';
import { 
    Address, 
    Contract, 
    Keypair, 
    Networks, 
    Operation, 
    TransactionBuilder, 
    BASE_FEE, 
    nativeToScVal, 
    xdr
} from '@stellar/stellar-sdk';
import { Server, Api, assembleTransaction } from '@stellar/stellar-sdk/rpc';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const RPC_URL = 'https://soroban-testnet.stellar.org'; // Official SDF Testnet RPC
const server = new Server(RPC_URL);
const networkPassphrase = Networks.TESTNET;
const ENHANCED_BASE_FEE = 1000000; // 1 XLM - maximum priority for final push

const secretKey = process.env.MANAGER_SECRET_KEY || process.env.MANAGER_SECRET;
if (!secretKey) throw new Error('MANAGER_SECRET_KEY missing in .env');
const keypair = Keypair.fromSecret(secretKey);
const summarizePublicKey = process.env.AGENT_SUMMARIZER_PUBLIC_KEY || process.env.AGENT_SUMMARIZE_PUBLIC_KEY;

const wasmPath = path.resolve(__dirname, '..', '..', 'contracts', 'agent-registry', 'target', 'wasm32-unknown-unknown', 'release', 'agent_registry.wasm');

async function sendTx(tx: any) {
    const sim = await server.simulateTransaction(tx);
    if (!Api.isSimulationSuccess(sim)) {
        console.error('Simulation failed:', JSON.stringify(sim, null, 2));
        throw new Error('Simulation failed');
    }
    const prepared = assembleTransaction(tx, sim).build();
    prepared.sign(keypair);
    const send = await server.sendTransaction(prepared);
    if (send.status === 'ERROR') throw new Error('Send failed: ' + JSON.stringify(send));
    
    console.log('Sent! Polling Horizon for inclusion...', send.hash);
    
    // Poll for up to 60 seconds
    for (let i = 0; i < 30; i++) {
        try {
            const res = await server.getTransaction(send.hash);
            if (res.status === 'SUCCESS') return res;
            if (res.status === 'FAILED') throw new Error('Transaction failed');
        } catch (e) {
            // maybe not found yet
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Transaction timed out in polling');
}

async function main() {
    console.log('Deploying from:', keypair.publicKey());
    const account = await server.getAccount(keypair.publicKey());

    // 1. Upload WASM
    const wasm = fs.readFileSync(wasmPath);
    console.log('WASM size:', wasm.length);
    
    let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
        .addOperation(Operation.uploadContractWasm({ wasm }))
        .setTimeout(60)
        .build();
    
    console.log('Uploading WASM...');
    let res = await sendTx(tx);
    if (!Api.isGetSuccessfulTransactionResponse(res)) throw new Error('Upload failed');
    const wasmHash = res.returnValue?.hash()?.toString('hex');
    console.log('WASM Hash:', wasmHash);

    // 2. Create Instance
    console.log('Creating instance...');
    const account2 = await server.getAccount(keypair.publicKey());
    tx = new TransactionBuilder(account2, { fee: BASE_FEE, networkPassphrase })
        .addOperation(Operation.createContract({
            wasmHash: Buffer.from(wasmHash!, 'hex'),
            address: Address.fromString(keypair.publicKey())
        }))
        .setTimeout(60)
        .build();
    
    res = await sendTx(tx);
    if (!Api.isGetSuccessfulTransactionResponse(res)) throw new Error('Instance creation failed');
    const contractId = res.returnValue?.address()?.toString();
    console.log('--- CONTRACT_ID:', contractId);

    // 3. Register Agents
    if (!contractId) throw new Error('No contract ID');
    const contract = new Contract(contractId);
    
    const agents = [
        { name: 'price', capability: 'price', endpoint: 'price', pk: process.env.AGENT_PRICE_PUBLIC_KEY },
        { name: 'news', capability: 'news', endpoint: 'news', pk: process.env.AGENT_NEWS_PUBLIC_KEY },
        { name: 'summarize', capability: 'summarize', endpoint: 'summarize', pk: summarizePublicKey },
        { name: 'sentiment', capability: 'sentiment', endpoint: 'sentiment', pk: process.env.AGENT_SENTIMENT_PUBLIC_KEY },
        { name: 'math', capability: 'math', endpoint: 'math', pk: process.env.AGENT_MATH_PUBLIC_KEY },
        { name: 'research', capability: 'research', endpoint: 'research', pk: process.env.AGENT_RESEARCH_PUBLIC_KEY },
    ];

    for (const a of agents) {
        if (!a.pk) continue;
        console.log(`Registering ${a.name}...`);
        const acc = await server.getAccount(keypair.publicKey());
        const registerTx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase })
            .addOperation(contract.call('register_agent', 
                nativeToScVal(a.name, { type: 'symbol' }),
                Address.fromString(a.pk).toScVal(),
                nativeToScVal(a.endpoint, { type: 'string' }),
                nativeToScVal(100, { type: 'i128' }), // price
                nativeToScVal(false), // recursive
                nativeToScVal(a.capability, { type: 'string' })
            ))
            .setTimeout(60)
            .build();
        
        await sendTx(registerTx);
        console.log(`Registered ${a.name}`);
    }

    console.log('\nDeployment Complete!');
    console.log('Update your .env with CONTRACT_ID=' + contractId);
}

main().catch(console.error);
