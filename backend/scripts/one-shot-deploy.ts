
import fs from 'fs';
import path from 'path';
import { 
    Address, 
    Contract, 
    Keypair, 
    Networks, 
    Operation, 
    TransactionBuilder, 
    nativeToScVal,
    xdr,
    scValToNative
} from '@stellar/stellar-sdk';
import { Server, Api, assembleTransaction } from '@stellar/stellar-sdk/rpc';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const server = new Server(RPC_URL);
const networkPassphrase = Networks.TESTNET;
const ENHANCED_BASE_FEE = '1100000'; // 1.1 XLM
const summarizePublicKey = process.env.AGENT_SUMMARIZER_PUBLIC_KEY || process.env.AGENT_SUMMARIZE_PUBLIC_KEY;

function updateEnv(key: string, value: string) {
    const envPath = path.resolve(__dirname, '..', '.env');
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
    } else {
        content += `\n${key}=${value}`;
    }
    fs.writeFileSync(envPath, content);
    console.log(`Updated .env: ${key}=${value}`);
}

async function getXdrResultDefinitive(txHash: string) {
    console.log(`Getting definitive result for ${txHash}...`);
    for (let i = 0; i < 60; i++) {
        try {
            const res = await axios.get(`${HORIZON_URL}/transactions/${txHash}`);
            if (res.data.successful) {
                const resultXdr = xdr.TransactionResult.fromXDR(res.data.result_xdr, 'base64');
                const lastOpResult = resultXdr.result().results()[0];
                const invokeHostFnResult = lastOpResult.tr().invokeHostFunctionResult();
                return scValToNative(invokeHostFnResult.success());
            }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Transaction inclusion failed after 120s');
}

async function sendTxResilient(tx: any, keypair: Keypair) {
    const sim = await server.simulateTransaction(tx);
    if (!Api.isSimulationSuccess(sim)) {
        throw new Error('Simulation failed: ' + JSON.stringify(sim, null, 2));
    }
    const prepared = assembleTransaction(tx, sim).build();
    prepared.sign(keypair);
    
    // Get current seq
    const initialAccount = await axios.get(`${HORIZON_URL}/accounts/${keypair.publicKey()}`);
    const initialSeq = BigInt(initialAccount.data.sequence);

    const send = await server.sendTransaction(prepared);
    if (send.status === 'ERROR') throw new Error('Send failed: ' + JSON.stringify(send));
    
    console.log('Sent! Hash:', send.hash, 'Waiting for sequence jump...');
    
    // Poll for sequence jump
    for (let i = 0; i < 40; i++) {
        try {
            const acc = await axios.get(`${HORIZON_URL}/accounts/${keypair.publicKey()}`);
            const currentSeq = BigInt(acc.data.sequence);
            if (currentSeq > initialSeq) {
                console.log('Sequence jumped! Transaction included.');
                return await getXdrResultDefinitive(send.hash);
            }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('Sequence jump timeout for ' + send.hash);
}

async function main() {
    const secretKey = process.env.MANAGER_SECRET_KEY || process.env.MANAGER_SECRET;
    if (!secretKey) throw new Error('MANAGER_SECRET_KEY missing');
    const keypair = Keypair.fromSecret(secretKey);
    console.log('Deploying with:', keypair.publicKey());

    const wasmPath = path.resolve(__dirname, '..', '..', 'contracts', 'agent-registry', 'target', 'wasm32-unknown-unknown', 'release', 'agent_registry.wasm');
    const wasm = fs.readFileSync(wasmPath);

    // 1. Upload WASM
    console.log('--- Phase 1: Uploading WASM ---');
    let acc = await server.getAccount(keypair.publicKey());
    let tx = new TransactionBuilder(acc, { fee: ENHANCED_BASE_FEE, networkPassphrase })
        .addOperation(Operation.uploadContractWasm({ wasm }))
        .setTimeout(300).build();
    const wasmHash = await sendTxResilient(tx, keypair);
    console.log('WASM Hash:', wasmHash);

    // 2. Instantiate
    console.log('--- Phase 2: Instantiating Contract ---');
    acc = await server.getAccount(keypair.publicKey());
    tx = new TransactionBuilder(acc, { fee: ENHANCED_BASE_FEE, networkPassphrase })
        .addOperation(Operation.createContract({
            wasmHash: Buffer.from(wasmHash as string, 'hex'),
            address: Address.fromString(keypair.publicKey())
        }))
        .setTimeout(300).build();
    const contractId = await sendTxResilient(tx, keypair);
    console.log('--- NEW CONTRACT_ID:', contractId);
    // Keep runtime and deploy tooling aligned: backend reads CONTRACT_ID.
    // Also write legacy alias for older local setups.
    updateEnv('CONTRACT_ID', contractId as string);
    updateEnv('SOROBAN_CONTRACT_ID', contractId as string);

    // 3. Register Agents
    console.log('--- Phase 3: Registering Agents ---');
    const contract = new Contract(contractId as string);
    const agents = [
        { name: 'price', capability: 'price', endpoint: 'https://synergi-agents.x402.ai/price', pk: process.env.AGENT_PRICE_PUBLIC_KEY },
        { name: 'news', capability: 'news', endpoint: 'https://synergi-agents.x402.ai/news', pk: process.env.AGENT_NEWS_PUBLIC_KEY },
        { name: 'summarize', capability: 'summarize', endpoint: 'https://synergi-agents.x402.ai/summarize', pk: summarizePublicKey },
        { name: 'sentiment', capability: 'sentiment', endpoint: 'https://synergi-agents.x402.ai/sentiment', pk: process.env.AGENT_SENTIMENT_PUBLIC_KEY },
        { name: 'math', capability: 'math', endpoint: 'https://synergi-agents.x402.ai/math', pk: process.env.AGENT_MATH_PUBLIC_KEY },
        { name: 'research', capability: 'research', endpoint: 'https://synergi-agents.x402.ai/research', pk: process.env.AGENT_RESEARCH_PUBLIC_KEY },
    ];

    for (const a of agents) {
        if (!a.pk) continue;
        console.log(`Registering ${a.name}...`);
        acc = await server.getAccount(keypair.publicKey());
        const registerOp = contract.call('register_agent', 
            nativeToScVal(a.name, { type: 'symbol' }),
            Address.fromString(a.pk).toScVal(),
            nativeToScVal(a.endpoint, { type: 'string' }),
            nativeToScVal(100, { type: 'i128' }), 
            nativeToScVal(false), 
            nativeToScVal(a.capability, { type: 'string' })
        );
        const registerTx = new TransactionBuilder(acc, { fee: ENHANCED_BASE_FEE, networkPassphrase })
            .addOperation(registerOp)
            .setTimeout(300).build();
        
        await sendTxResilient(registerTx, keypair);
        console.log(`Registered ${a.name}`);
    }

    console.log('\n--- FINAL DEPLOYMENT COMPLETE ---');
}

main().catch(console.error);
