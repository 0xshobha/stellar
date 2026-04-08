import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure we load the backend-local .env regardless of monorepo working directory.
// - src -> ../.env resolves to backend/.env
// - dist -> ../.env also resolves to backend/.env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  BACKEND_BASE_URL: z.string().url().default('http://localhost:4000'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  MANAGER_SECRET_KEY: z.string().optional(),
  MANAGER_PUBLIC_KEY: z.string().optional(),
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  X402_MODE: z.enum(['mock', 'real']).default('mock'),
  X402_REAL_ONLY: z.enum(['true', 'false']).default('false'),
  FACILITATOR_URL: z.string().url().default('https://x402-stellar-491bf9f7e30b.herokuapp.com'),
  X402_MAX_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(300).default(300),
  X402_USDC_ASSET_ADDRESS: z.string().optional(),
  AGENT_PRICE_PUBLIC_KEY: z.string().optional(),
  AGENT_NEWS_PUBLIC_KEY: z.string().optional(),
  AGENT_SUMMARIZER_PUBLIC_KEY: z.string().optional(),
  AGENT_SUMMARIZE_PUBLIC_KEY: z.string().optional(),
  AGENT_SENTIMENT_PUBLIC_KEY: z.string().optional(),
  AGENT_MATH_PUBLIC_KEY: z.string().optional(),
  AGENT_RESEARCH_PUBLIC_KEY: z.string().optional(),
  CONTRACT_ID: z.string().default('LOCAL_MOCK_CONTRACT'),
  X402_ENFORCE: z.enum(['true', 'false']).default('false'),
  SOROBAN_RPC_URL: z.string().url().optional()
});

type ParsedEnv = z.infer<typeof envSchema>;
type RuntimeEnv = Omit<ParsedEnv, 'AGENT_SUMMARIZER_PUBLIC_KEY' | 'MANAGER_PUBLIC_KEY'> & {
  AGENT_SUMMARIZER_PUBLIC_KEY?: string;
  MANAGER_PUBLIC_KEY?: string;
};

const parsedEnv = envSchema.parse(process.env);

function deriveManagerPublicKey(): string | undefined {
  if (parsedEnv.MANAGER_PUBLIC_KEY) return parsedEnv.MANAGER_PUBLIC_KEY;
  if (!parsedEnv.MANAGER_SECRET_KEY) return undefined;

  try {
    return Keypair.fromSecret(parsedEnv.MANAGER_SECRET_KEY).publicKey();
  } catch {
    return undefined;
  }
}

export const env: RuntimeEnv = {
  ...parsedEnv,
  MANAGER_PUBLIC_KEY: deriveManagerPublicKey(),
  AGENT_SUMMARIZER_PUBLIC_KEY: parsedEnv.AGENT_SUMMARIZER_PUBLIC_KEY ?? parsedEnv.AGENT_SUMMARIZE_PUBLIC_KEY
};

export const isX402Enforced = env.X402_ENFORCE === 'true';
export const isX402RealMode = env.X402_MODE === 'real';
export const isX402RealOnly = env.X402_REAL_ONLY === 'true';

const claudeEnabled = Boolean(env.ANTHROPIC_API_KEY || env.GROQ_API_KEY);
console.log(`[Config] x402Mode=${env.X402_MODE} enforce=${env.X402_ENFORCE} network=${env.STELLAR_NETWORK} claudeEnabled=${claudeEnabled}`);

const configuredAgentPublicKeys = {
  AGENT_PRICE_PUBLIC_KEY: env.AGENT_PRICE_PUBLIC_KEY,
  AGENT_NEWS_PUBLIC_KEY: env.AGENT_NEWS_PUBLIC_KEY,
  AGENT_SUMMARIZER_PUBLIC_KEY: env.AGENT_SUMMARIZER_PUBLIC_KEY,
  AGENT_SENTIMENT_PUBLIC_KEY: env.AGENT_SENTIMENT_PUBLIC_KEY,
  AGENT_MATH_PUBLIC_KEY: env.AGENT_MATH_PUBLIC_KEY,
  AGENT_RESEARCH_PUBLIC_KEY: env.AGENT_RESEARCH_PUBLIC_KEY
};

const startupErrors: string[] = [];

if (!env.CONTRACT_ID || !env.CONTRACT_ID.trim()) {
  startupErrors.push('CONTRACT_ID must be set (use LOCAL_MOCK_CONTRACT for local mode).');
}

if (isX402RealMode) {
  if (!env.MANAGER_SECRET_KEY || !env.MANAGER_SECRET_KEY.startsWith('S')) {
    startupErrors.push('X402_MODE=real requires MANAGER_SECRET_KEY with a valid Stellar secret key.');
  }

  for (const [key, value] of Object.entries(configuredAgentPublicKeys)) {
    if (!value || !/^G[A-Z2-7]{55}$/.test(value)) {
      startupErrors.push(`X402_MODE=real requires ${key} to be a valid Stellar public key.`);
    }
  }
}

if (isX402Enforced && !env.FACILITATOR_URL) {
  startupErrors.push('X402_ENFORCE=true requires FACILITATOR_URL.');
}

if (startupErrors.length > 0) {
  throw new Error(`Environment configuration invalid:\n- ${startupErrors.join('\n- ')}`);
}

export function getStellarCaip2Network(): 'stellar:testnet' | 'stellar:pubnet' {
  return env.STELLAR_NETWORK === 'mainnet' ? 'stellar:pubnet' : 'stellar:testnet';
}
