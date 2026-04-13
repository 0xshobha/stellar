import type { Request, Response, NextFunction } from 'express';
import { Keypair, Transaction } from '@stellar/stellar-sdk';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactStellarScheme as ExactStellarServerScheme } from '@x402/stellar/exact/server';
import { demoNoX402Enabled, demoRealTxEnabled, env, getStellarCaip2Network } from '../infra/config.js';
import { getAgentById, pickBestAgentForCapability } from '../registry/contract.js';
import type { PlannerAgentRole } from '../infra/types.js';
import { logError, logInfo } from '../infra/logger.js';
import { recordX402Settlement } from '../infra/store.js';
import { prepareXlmPayment, submitSignedTransaction } from './xlm.js';

const facilitatorClient = new HTTPFacilitatorClient({ url: env.FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient).register('stellar:*', new ExactStellarServerScheme());

let initializationPromise: Promise<void> | null = null;

async function ensureResourceServerInitialized(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = resourceServer.initialize();
  }
  await initializationPromise;
}

const ENDPOINT_CAPABILITY: Record<string, string> = {
  price: 'price',
  news: 'news',
  summarize: 'summarize',
  sentiment: 'sentiment',
  math: 'math',
  research: 'research'
};

/**
 * Paywall priced from registry: uses x-registry-agent or picks best for the route capability.
 */
export function createPaywallForEndpoint(endpoint: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const capability = ENDPOINT_CAPABILITY[endpoint];
    if (!capability) {
      res.status(500).json({
        ok: false,
        error: { code: 'BAD_ENDPOINT', message: `Unknown agent endpoint: ${endpoint}` }
      });
      return;
    }

    let registryId = req.header('x-registry-agent')?.trim();
    if (!registryId) {
      const picked = pickBestAgentForCapability(capability, Number.MAX_VALUE);
      if (!picked) {
        res.status(503).json({
          ok: false,
          error: { code: 'NO_AGENT', message: `No registered worker for capability ${capability}` }
        });
        return;
      }
      registryId = picked.id;
    }

    const agent = getAgentById(registryId);
    if (!agent || agent.endpoint !== endpoint) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'BAD_REGISTRY_AGENT',
          message: 'x-registry-agent does not match this HTTP route'
        }
      });
      return;
    }

    return createPaywall(agent.price, agent.id)(req, res, next);
  };
}

export function createPaywall(priceUSDC: number, agentName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const network = getStellarCaip2Network();

    try {
      await ensureResourceServerInitialized();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('x402 resource server initialization failed', { agentName, message });
      res.status(503).json({
        ok: false,
        error: {
          code: 'X402_INITIALIZATION_FAILED',
          message: `Real x402 mode initialization failed: ${message}`
        }
      });
      return;
    }

    try {
      const recipient = resolveAgentRecipient(agentName);
      if (!recipient) {
        logError('x402 missing Stellar recipient for agent', { agentName });
        res.status(500).json({
          ok: false,
          error: {
            code: 'X402_AGENT_RECIPIENT_MISSING',
            message: `Missing valid Stellar recipient address for ${agentName}`
          }
        });
        return;
      }

      const requirements = await resourceServer.buildPaymentRequirements({
        scheme: 'exact',
        payTo: recipient,
        price: priceUSDC,
        network,
        maxTimeoutSeconds: env.X402_MAX_TIMEOUT_SECONDS
      });

      const paymentHeader = req.header('PAYMENT-SIGNATURE') ?? req.header('X-PAYMENT');
      if (!paymentHeader) {
        const paymentRequired = await resourceServer.createPaymentRequiredResponse(
          requirements,
          {
            url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
            description: `${agentName} endpoint`,
            mimeType: 'application/json'
          },
          'Payment required before accessing this endpoint.'
        );

        res.status(402);
        res.setHeader('x-payment-enforced', 'true');
        res.setHeader('x-payment-required', 'true');
        res.setHeader('PAYMENT-REQUIRED', encodePaymentRequiredHeader(paymentRequired));
        res.setHeader('x-payment-network', network);
        res.setHeader('x-payment-recipient', recipient);
        res.json({
          ok: false,
          error: {
            code: 'PAYMENT_REQUIRED',
            message: 'Payment required before accessing this endpoint.',
            details: {
              network,
              recipient,
              amount: priceUSDC,
              scheme: 'exact'
            }
          }
        });
        return;
      }

      let payload;
      try {
        payload = decodePaymentSignatureHeader(paymentHeader);
      } catch {
        res.status(400).json({
          ok: false,
          error: {
            code: 'INVALID_PAYMENT_SIGNATURE',
            message: 'Invalid payment signature payload'
          }
        });
        return;
      }

      const matchingRequirement = resourceServer.findMatchingRequirements(requirements, payload);
      if (!matchingRequirement) {
        res.status(402).json({
          ok: false,
          error: {
            code: 'PAYMENT_REQUIREMENT_MISMATCH',
            message: 'Submitted payment does not match endpoint payment requirements.'
          }
        });
        return;
      }

      const verifyResult = await resourceServer.verifyPayment(payload, matchingRequirement);
      if (!verifyResult.isValid) {
        res.status(402).json({
          ok: false,
          error: {
            code: verifyResult.invalidReason ?? 'PAYMENT_INVALID',
            message: 'Payment verification failed.'
          }
        });
        return;
      }

      const settleResult = await resourceServer.settlePayment(payload, matchingRequirement);
      if (!settleResult.success) {
        logError('x402 settlement failed', {
          agentName,
          errorReason: settleResult.errorReason,
          errorMessage: settleResult.errorMessage
        });
        res.status(502).json({
          ok: false,
          error: {
            code: settleResult.errorReason ?? 'PAYMENT_SETTLEMENT_FAILED',
            message: settleResult.errorMessage ?? 'Payment settlement failed.'
          }
        });
        return;
      }

      const txHash =
        typeof (settleResult as { transaction?: string }).transaction === 'string'
          ? (settleResult as { transaction: string }).transaction
          : '';

      recordX402Settlement({
        agent: agentName,
        amount: priceUSDC,
        txHash: txHash || '(unknown)'
      });
      logInfo('x402 settlement recorded', {
        agent: agentName,
        amount: priceUSDC,
        txHash: txHash || '(missing in facilitator response)'
      });

      res.setHeader('x-payment-enforced', 'true');
      res.setHeader('PAYMENT-RESPONSE', encodePaymentResponseHeader(settleResult));
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('x402 paywall unexpected error', { agentName, message });
      res.status(500).json({
        ok: false,
        error: {
          code: 'X402_INTERNAL_ERROR',
          message: 'Payment flow failed unexpectedly.'
        }
      });
    }
  };
}

const ROLE_RECIPIENTS: Record<PlannerAgentRole, string | undefined> = {
  PriceFeed: env.AGENT_PRICE_PUBLIC_KEY,
  NewsDigest: env.AGENT_NEWS_PUBLIC_KEY,
  Summarizer: env.AGENT_SUMMARIZER_PUBLIC_KEY,
  SentimentAI: env.AGENT_SENTIMENT_PUBLIC_KEY,
  MathSolver: env.AGENT_MATH_PUBLIC_KEY,
  DeepResearch: env.AGENT_RESEARCH_PUBLIC_KEY
};

function resolveAgentRecipient(agentRegistryId: string): string | null {
  const catalog = getAgentById(agentRegistryId);
  if (catalog) {
    const configured = ROLE_RECIPIENTS[catalog.plannerRole];
    if (configured && configured.startsWith('G') && configured.length >= 56) {
      return configured;
    }
  }

  const legacy: Record<string, string | undefined> = {
    PriceFeed: env.AGENT_PRICE_PUBLIC_KEY,
    NewsDigest: env.AGENT_NEWS_PUBLIC_KEY,
    Summarizer: env.AGENT_SUMMARIZER_PUBLIC_KEY,
    SentimentAI: env.AGENT_SENTIMENT_PUBLIC_KEY,
    MathSolver: env.AGENT_MATH_PUBLIC_KEY,
    DeepResearch: env.AGENT_RESEARCH_PUBLIC_KEY
  };

  const configured = legacy[agentRegistryId];
  if (configured && configured.startsWith('G') && configured.length >= 56) {
    return configured;
  }

  if (env.MANAGER_SECRET_KEY) {
    return Keypair.fromSecret(env.MANAGER_SECRET_KEY).publicKey();
  }

  return null;
}

/** Selects paywall mode based on environment flags. */
export function agentPaywallMiddleware(endpoint: string) {
  if (demoRealTxEnabled) {
    return createDemoRealTxPaywallForEndpoint(endpoint);
  }
  if (demoNoX402Enabled) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return createPaywallForEndpoint(endpoint);
}

function createDemoRealTxPaywallForEndpoint(endpoint: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const capability = ENDPOINT_CAPABILITY[endpoint];
    if (!capability) {
      res.status(500).json({
        ok: false,
        error: { code: 'BAD_ENDPOINT', message: `Unknown agent endpoint: ${endpoint}` }
      });
      return;
    }

    let registryId = req.header('x-registry-agent')?.trim();
    if (!registryId) {
      const picked = pickBestAgentForCapability(capability, Number.MAX_VALUE);
      if (!picked) {
        res.status(503).json({
          ok: false,
          error: { code: 'NO_AGENT', message: `No registered worker for capability ${capability}` }
        });
        return;
      }
      registryId = picked.id;
    }

    const agent = getAgentById(registryId);
    if (!agent || agent.endpoint !== endpoint) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'BAD_REGISTRY_AGENT',
          message: 'x-registry-agent does not match this HTTP route'
        }
      });
      return;
    }

    const recipient = resolveAgentRecipient(agent.id);
    if (!recipient) {
      res.status(500).json({
        ok: false,
        error: {
          code: 'X402_AGENT_RECIPIENT_MISSING',
          message: `Missing valid Stellar recipient address for ${agent.id}`
        }
      });
      return;
    }

    try {
      if (!env.MANAGER_SECRET_KEY) {
        throw new Error('MANAGER_SECRET_KEY is required for demo real tx mode.');
      }
      const managerKeypair = Keypair.fromSecret(env.MANAGER_SECRET_KEY);
      const prepared = await prepareXlmPayment({
        from: managerKeypair.publicKey(),
        destination: recipient,
        amount: agent.price,
        memo: `x402:${agent.id}`.slice(0, 28)
      });
      const tx = new Transaction(prepared.xdr, prepared.networkPassphrase);
      tx.sign(managerKeypair);
      const submitted = await submitSignedTransaction({
        signedXdr: tx.toXDR(),
        noteFrom: 'ManagerAgent'
      });

      recordX402Settlement({
        agent: agent.id,
        amount: agent.price,
        txHash: submitted.txHash
      });

      // Keep header shape compatible with buildAgentResponse tx extraction.
      res.setHeader(
        'PAYMENT-RESPONSE',
        encodePaymentResponseHeader({
          success: true,
          network: getStellarCaip2Network(),
          transaction: submitted.txHash
        })
      );
      res.setHeader('x-payment-enforced', 'true');
      res.setHeader('x-payment-network', getStellarCaip2Network());
      res.setHeader('x-payment-recipient', recipient);

      logInfo('Demo real tx payment settled', {
        agent: agent.id,
        endpoint,
        amount: agent.price,
        txHash: submitted.txHash
      });
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('Demo real tx payment failed', {
        endpoint,
        agent: agent.id,
        message
      });
      res.status(502).json({
        ok: false,
        error: {
          code: 'DEMO_REAL_TX_FAILED',
          message
        }
      });
    }
  };
}
