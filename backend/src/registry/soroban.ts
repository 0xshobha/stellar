/**
 * Soroban RPC: read agent registry from chain and submit record_job_result.
 * Read paths throw on RPC/simulation failure so the runtime stays chain-backed.
 */
import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  scValToNative
} from '@stellar/stellar-sdk';
import { Api, Server as SorobanServer, assembleTransaction } from '@stellar/stellar-sdk/rpc';
import type { AgentCatalogItem, PlannerAgentRole } from '../infra/types.js';
import { env } from '../infra/config.js';
import { logError, logInfo, logWarn } from '../infra/logger.js';

const DEFAULT_RPC = 'https://soroban-testnet.stellar.org';

const ENDPOINT_TO_PLANNER: Record<string, PlannerAgentRole> = {
  price: 'PriceFeed',
  news: 'NewsDigest',
  summarize: 'Summarizer',
  sentiment: 'SentimentAI',
  math: 'MathSolver',
  research: 'DeepResearch'
};

function microUsdcToNumber(m: bigint | number | string): number {
  const n = typeof m === 'bigint' ? Number(m) : Number(m);
  if (!Number.isFinite(n)) return 0;
  return n / 1e6;
}

function parseAgentRow(raw: unknown): AgentCatalogItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.name ?? '').trim();
  const endpoint = String(o.endpoint ?? '').trim().toLowerCase();
  if (!id || !endpoint) return null;
  const plannerRole = ENDPOINT_TO_PLANNER[endpoint];
  if (!plannerRole) return null;
  const capability = String(o.capability ?? endpoint).trim().toLowerCase() || endpoint;
  const price = microUsdcToNumber(o.price_usdc as bigint | number | string);
  const reputation = Number(o.reputation ?? 5000);
  const jobsCompleted = Number(o.jobs_completed ?? 0);
  const jobsFailed = Number(o.jobs_failed ?? 0);
  const recursive = Boolean(o.recursive);

  return {
    id,
    plannerRole,
    capability,
    endpoint,
    price: Number.isFinite(price) && price > 0 ? price : 0.0001,
    reputation: Number.isFinite(reputation) ? reputation : 5000,
    capabilities: [capability, `${plannerRole.toLowerCase()}-work`],
    recursive,
    jobsCompleted: Number.isFinite(jobsCompleted) ? jobsCompleted : 0,
    jobsFailed: Number.isFinite(jobsFailed) ? jobsFailed : 0
  };
}

function networkPassphrase(): string {
  return env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

function sorobanServer(): SorobanServer {
  const url = env.SOROBAN_RPC_URL || DEFAULT_RPC;
  return new SorobanServer(url, { allowHttp: url.startsWith('http://') });
}

function sourcePublicKey(): string {
  if (env.MANAGER_PUBLIC_KEY && /^G[A-Z2-7]{55}$/.test(env.MANAGER_PUBLIC_KEY)) {
    return env.MANAGER_PUBLIC_KEY;
  }
  if (env.MANAGER_SECRET_KEY?.startsWith('S')) {
    try {
      return Keypair.fromSecret(env.MANAGER_SECRET_KEY).publicKey();
    } catch {
      /* fall through */
    }
  }
  throw new Error(
    'Soroban reads require MANAGER_PUBLIC_KEY or a valid MANAGER_SECRET_KEY (simulation source account).'
  );
}

type ContractCallOperation = ReturnType<Contract['call']>;

async function simulateRegistryOperationStrict(
  operation: ContractCallOperation,
  context: string
): Promise<unknown> {
  const pk = sourcePublicKey();

  try {
    const server = sorobanServer();
    const account = await server.getAccount(pk);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase()
    })
      .addOperation(operation)
      .setTimeout(60)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (!Api.isSimulationSuccess(sim) || !sim.result?.retval) {
      const detail = sim && typeof sim === 'object' && 'error' in sim ? JSON.stringify(sim.error) : 'unknown';
      throw new Error(`Soroban simulation did not succeed (${context}): ${detail}`);
    }

    return scValToNative(sim.result.retval);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Soroban simulation')) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    logError('Soroban contract simulation failed', { context, message });
    throw new Error(`Soroban ${context} failed: ${message}`);
  }
}

function unwrapSorobanOption(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw !== 'object') return raw;
  const o = raw as Record<string, unknown>;
  if ('Some' in o) return o.Some ?? null;
  if (o.tag === 'None' || o.tag === 0) return null;
  if (o.tag === 'Some' || o.tag === 1) {
    const vals = o.values;
    if (Array.isArray(vals) && vals.length > 0) return vals[0];
  }
  return raw;
}

/** On-chain competitors in one capability bucket (Soroban `get_agents_by_capability`). */
export async function fetchAgentsByCapabilityFromChain(capability: string): Promise<AgentCatalogItem[]> {
  const cap = capability.trim().toLowerCase();
  if (!cap) return [];

  const contract = new Contract(env.CONTRACT_ID);
  const native = await simulateRegistryOperationStrict(
    contract.call('get_agents_by_capability', nativeToScVal(cap, { type: 'string' })),
    'get_agents_by_capability'
  );

  if (!Array.isArray(native)) {
    throw new Error('Soroban get_agents_by_capability returned unexpected shape');
  }

  const out: AgentCatalogItem[] = [];
  for (const row of native) {
    const item = parseAgentRow(row);
    if (item) out.push(item);
  }
  return out;
}

/** Soroban `get_best_agent` — same scoring as on-chain leaderboard. Returns null when the contract has no winner. */
export async function fetchBestAgentFromChain(capability: string): Promise<AgentCatalogItem | null> {
  const cap = capability.trim().toLowerCase();
  if (!cap) return null;

  const contract = new Contract(env.CONTRACT_ID);
  const native = await simulateRegistryOperationStrict(
    contract.call('get_best_agent', nativeToScVal(cap, { type: 'string' })),
    'get_best_agent'
  );

  const inner = unwrapSorobanOption(native);
  if (inner == null) return null;
  return parseAgentRow(inner);
}

/** Full registry from `list_agents`; throws if RPC fails or the contract returns zero agents. */
export async function fetchAgentsFromChain(): Promise<AgentCatalogItem[]> {
  const pk = sourcePublicKey();
  const server = sorobanServer();
  const contract = new Contract(env.CONTRACT_ID);
  const account = await server.getAccount(pk);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase()
  })
    .addOperation(contract.call('list_agents'))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!Api.isSimulationSuccess(sim) || !sim.result?.retval) {
    throw new Error(
      `Soroban list_agents simulation failed for contract ${env.CONTRACT_ID}. Check CONTRACT_ID, RPC, and network.`
    );
  }

  const native = scValToNative(sim.result.retval) as unknown;
  if (!Array.isArray(native)) {
    throw new Error('Soroban list_agents returned unexpected shape');
  }

  const out: AgentCatalogItem[] = [];
  for (const row of native) {
    const item = parseAgentRow(row);
    if (item) out.push(item);
  }

  if (out.length === 0) {
    throw new Error(
      'Soroban list_agents returned zero agents. Register agents on-chain before running the manager.'
    );
  }

  logInfo('Soroban registry synced', { count: out.length });
  return out;
}

/** Submit record_job_result(name: Symbol, success: bool). Uses manager secret. */
export async function submitRecordJobOnChain(registrySymbol: string, success: boolean): Promise<boolean> {
  if (!env.MANAGER_SECRET_KEY?.startsWith('S')) return false;

  try {
    const server = sorobanServer();
    const kp = Keypair.fromSecret(env.MANAGER_SECRET_KEY);
    const contract = new Contract(env.CONTRACT_ID);
    const account = await server.getAccount(kp.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase()
    })
      .addOperation(
        contract.call(
          'record_job_result',
          nativeToScVal(registrySymbol, { type: 'symbol' }),
          nativeToScVal(success)
        )
      )
      .setTimeout(60)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (!Api.isSimulationSuccess(sim)) {
      logWarn('Soroban record_job_result simulation failed', { registrySymbol });
      return false;
    }

    const prepared = assembleTransaction(tx, sim).build();
    prepared.sign(kp);
    const send = await server.sendTransaction(prepared);
    if (send.status !== 'PENDING' && send.status !== 'DUPLICATE') {
      logWarn('Soroban sendTransaction unexpected status', { status: send.status });
      return false;
    }
    return true;
  } catch (error) {
    logError('Soroban record_job_result failed', {
      registrySymbol,
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
