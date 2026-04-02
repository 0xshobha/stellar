import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  BACKEND_BASE_URL: z.string().default('http://localhost:4000'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  MANAGER_SECRET_KEY: z.string().optional(),
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  X402_MODE: z.enum(['mock', 'real']).default('mock'),
  X402_REAL_ONLY: z.enum(['true', 'false']).default('false'),
  FACILITATOR_URL: z.string().default('https://x402-stellar-491bf9f7e30b.herokuapp.com'),
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

export function getStellarCaip2Network(): 'stellar:testnet' | 'stellar:pubnet' {
  return env.STELLAR_NETWORK === 'mainnet' ? 'stellar:pubnet' : 'stellar:testnet';
}
