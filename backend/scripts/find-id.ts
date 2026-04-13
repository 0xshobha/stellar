
import { Server } from '@stellar/stellar-sdk/rpc';
import { xdr } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new Server(RPC_URL);
const managerPk = process.env.MANAGER_PUBLIC_KEY || process.env.MANAGER_PUBLIC || '';

async function main() {
    if (!managerPk) {
        throw new Error('MANAGER_PUBLIC_KEY missing in backend/.env (legacy MANAGER_PUBLIC also supported)');
    }
    console.log('Searching for Contract ID created by:', managerPk);
    const txs = await server.getTransactions({ order: 'desc', limit: 50 });
    for (const tx of txs.transactions) {
        if (!tx.resultMetaXdr) continue;
        const meta = xdr.TransactionMeta.fromXDR(tx.resultMetaXdr, 'base64');
        if (meta.v() !== 3) continue;
        
        const sorobanMeta = meta.v3().sorobanMeta();
        if (!sorobanMeta) continue;
        
        const returnValue = sorobanMeta.returnValue();
        if (returnValue && returnValue.arm() === 'address') {
            const contractId = returnValue.address().toString();
            console.log('FOUND CONTRACT ID:', contractId);
            process.exit(0);
        }
    }
    console.log('No contract ID found in recent transactions.');
}

main().catch(console.error);
