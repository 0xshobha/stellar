import type { Request, Response, NextFunction } from 'express';
import { Keypair } from '@stellar/stellar-sdk';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactStellarScheme as ExactStellarServerScheme } from '@x402/stellar/exact/server';
import { env, isX402Enforced, isX402RealMode, isX402RealOnly } from '../config.js';

const STELLAR_TESTNET_NETWORK = 'stellar:testnet' as const;

const facilitatorClient = new HTTPFacilitatorClient({ url: env.FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient).register('stellar:*', new ExactStellarServerScheme());

let initializationPromise: Promise<void> | null = null;

async function ensureResourceServerInitialized(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = resourceServer.initialize();
  }
  await initializationPromise;
}

export function createPaywall(priceUSDC: number, agentName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isX402Enforced) {
      res.setHeader('x-payment-enforced', 'false');
      next();
      return;
    }

    if (!isX402RealMode) {
      handleMockPaywall(req, res, next, priceUSDC, agentName);
      return;
    }

    try {
      await ensureResourceServerInitialized();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isX402RealOnly) {
        res.status(503).json({
          ok: false,
          error: {
            code: 'X402_INITIALIZATION_FAILED',
            message: `Real x402 mode initialization failed: ${message}`
          }
        });
        return;
      }
      handleMockPaywall(req, res, next, priceUSDC, agentName);
      return;
    }

    const recipient = resolveAgentRecipient(agentName);
    if (!recipient) {
      res.status(isX402RealOnly ? 500 : 402).json({
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
      network: STELLAR_TESTNET_NETWORK,
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
      res.setHeader('x-payment-network', STELLAR_TESTNET_NETWORK);
      res.setHeader('x-payment-recipient', recipient);
      res.json({
        ok: false,
        error: {
          code: 'PAYMENT_REQUIRED',
          message: 'Payment required before accessing this endpoint.',
          details: {
            network: STELLAR_TESTNET_NETWORK,
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
      const responseStatus = isX402RealOnly ? 502 : 402;
      res.status(responseStatus).json({
        ok: false,
        error: {
          code: settleResult.errorReason ?? 'PAYMENT_SETTLEMENT_FAILED',
          message: settleResult.errorMessage ?? 'Payment settlement failed.'
        }
      });
      return;
    }

    res.setHeader('x-payment-enforced', 'true');
    res.setHeader('PAYMENT-RESPONSE', encodePaymentResponseHeader(settleResult));
    next();
  };
}

function handleMockPaywall(req: Request, res: Response, next: NextFunction, priceUSDC: number, agentName: string) {
  const paymentProof = req.header('x-payment-proof');
  if (!paymentProof) {
    const paymentContext = {
      amount: Number(priceUSDC.toFixed(6)),
      asset: 'USDC',
      recipient: agentName,
      network: 'stellar-testnet'
    };

    res.status(402);
    res.setHeader('x-payment-enforced', 'true');
    res.setHeader('x-payment-required', 'true');
    res.setHeader('x-payment-asset', paymentContext.asset);
    res.setHeader('x-payment-amount', paymentContext.amount.toString());
    res.setHeader('x-payment-recipient', paymentContext.recipient);
    res.json({
      ok: false,
      error: {
        code: 'PAYMENT_REQUIRED',
        message: 'Payment required before accessing this endpoint.',
        details: paymentContext
      }
    });
    return;
  }

  res.setHeader('x-payment-enforced', 'true');
  next();
}

function resolveAgentRecipient(agentName: string): string | null {
  const recipients: Record<string, string | undefined> = {
    PriceFeed: env.AGENT_PRICE_PUBLIC_KEY,
    NewsDigest: env.AGENT_NEWS_PUBLIC_KEY,
    Summarizer: env.AGENT_SUMMARIZER_PUBLIC_KEY,
    SentimentAI: env.AGENT_SENTIMENT_PUBLIC_KEY,
    MathSolver: env.AGENT_MATH_PUBLIC_KEY,
    DeepResearch: env.AGENT_RESEARCH_PUBLIC_KEY
  };

  const configured = recipients[agentName];

  if (configured && configured.startsWith('G') && configured.length >= 56) {
    return configured;
  }

  if (env.MANAGER_SECRET_KEY) {
    return Keypair.fromSecret(env.MANAGER_SECRET_KEY).publicKey();
  }

  return null;
}
