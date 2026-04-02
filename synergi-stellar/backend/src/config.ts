import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  BACKEND_BASE_URL: z.string().url().default('http://localhost:4000'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  MANAGER_SECRET_KEY: z.string().optional(),
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  X402_MODE: z.enum(['mock', 'real']).default('mock'),
  X402_REAL_ONLY: z.enum(['true', 'false']).default('false'),
  FACILITATOR_URL: z.string().url().default('https://x402-stellar-491bf9f7e30b.herokuapp.com'),
  X402_MAX_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(300).default(90),
  X402_USDC_ASSET_ADDRESS: z.string().optional(),
  AGENT_PRICE_PUBLIC_KEY: z.string().optional(),
  AGENT_NEWS_PUBLIC_KEY: z.string().optional(),
  AGENT_SUMMARIZER_PUBLIC_KEY: z.string().optional(),
  AGENT_SENTIMENT_PUBLIC_KEY: z.string().optional(),
  AGENT_MATH_PUBLIC_KEY: z.string().optional(),
  AGENT_RESEARCH_PUBLIC_KEY: z.string().optional(),
  CONTRACT_ID: z.string().default('LOCAL_MOCK_CONTRACT'),
  X402_ENFORCE: z.enum(['true', 'false']).default('false')
});

export const env = envSchema.parse(process.env);
export const isX402Enforced = env.X402_ENFORCE === 'true';
export const isX402RealMode = env.X402_MODE === 'real';
export const isX402RealOnly = env.X402_REAL_ONLY === 'true';

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
