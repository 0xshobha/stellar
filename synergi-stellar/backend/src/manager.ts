import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { env } from './config.js';
import { logError, logInfo, logWarn } from './lib/logger.js';
import {
  addTransaction,
  completeSession,
  createSessionStatus,
  getSessionMetrics,
  registerPaymentToSession,
  registerSessionError,
  updateSessionStatus
} from './lib/store.js';
import { AgentCatalogItem, AgentName } from './lib/types.js';
import { sseHub } from './sse.js';
import { getAgentCatalog, recordJobResult } from './stellar/contract.js';
import { x402FetchJson } from './x402/client.js';

interface ManagerStep {
  agentName: AgentName;
  reason: string;
  input: string;
  depth?: number;
}

interface WorkerResponse {
  agent: string;
  pricePaid: number;
  data: unknown;
  txHash: string;
}

interface RecursiveSubTransaction {
  agent: string;
  txHash: string;
  pricePaid: number;
  from?: string;
  depth?: number;
  fallbackUsed?: boolean;
  attempts?: number;
}

const AGENT_TIMEOUT_MS = 9000;
const MAX_RECURSION_DEPTH = 2;

const claude = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

function getBackendBaseUrl(): string {
  return process.env.RUNTIME_BACKEND_BASE_URL || env.BACKEND_BASE_URL;
}

export function startQuerySession(query: string): string {
  const sessionId = randomUUID();
  createSessionStatus(sessionId, query);
  logInfo('Query session created', {
    sessionId,
    query
  });
  void runManagerSession(sessionId, query);
  return sessionId;
}

async function runManagerSession(sessionId: string, query: string): Promise<void> {
  logInfo('Manager session started', {
    sessionId,
    query
  });
  sseHub.emit(sessionId, 'status', { message: 'Manager started planning', stage: 'planning' });
  try {
    const catalog = getAgentCatalog();
    const plan = await createPlan(query, catalog);
    const normalizedPlan = normalizePlanSteps(plan.steps, catalog, query);
    const prioritized = prioritizeSteps(normalizedPlan, catalog);

    updateSessionStatus(sessionId, {
      totalSteps: prioritized.length,
      completedSteps: 0
    });

    sseHub.emit(sessionId, 'plan', {
      plan: plan.explanation,
      steps: prioritized
    });
    logInfo('Execution plan prepared', {
      sessionId,
      totalSteps: prioritized.length,
      steps: prioritized.map((item) => item.agentName)
    });

    const outputs: Array<{ agent: string; result: unknown }> = [];
    let completedSteps = 0;

    for (const step of prioritized) {
      const worker = catalog.find((item) => item.name === step.agentName);
      if (!worker) continue;
      const depth = Math.min(step.depth ?? 1, MAX_RECURSION_DEPTH);
      logInfo('Executing step', {
        sessionId,
        agent: worker.name,
        depth,
        completedSteps,
        totalSteps: prioritized.length
      });

      sseHub.emit(sessionId, 'step-start', {
        step: completedSteps + 1,
        totalSteps: prioritized.length,
        agent: worker.name,
        depth
      });

      sseHub.emit(sessionId, 'hiring', {
        agent: worker.name,
        price: worker.price,
        reason: step.reason,
        depth
      });

      const endpointUrl = `${getBackendBaseUrl()}/agents/${worker.endpoint}`;
      try {
        const response = await x402FetchJson<WorkerResponse>(sessionId, endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: step.input, depth })
        }, {
          retries: 2,
          timeoutMs: AGENT_TIMEOUT_MS,
          agentName: worker.name,
          fallbackFactory: (reason) => ({
            agent: worker.name,
            pricePaid: 0,
            data: { fallback: true, reason },
            txHash: `fallback-${worker.endpoint}-${Date.now().toString(16)}`
          })
        });

        outputs.push({
          agent: worker.name,
          result: response.data.data
        });

        addTransaction({
          from: 'ManagerAgent',
          to: worker.name,
          amount: response.data.pricePaid,
          asset: 'USDC',
          txHash: response.data.txHash,
          sessionId,
          depth
        });

        registerPaymentToSession(sessionId, response.data.txHash, response.data.pricePaid, worker.name);
        recordJobResult(worker.name, true);
        completedSteps += 1;
        updateSessionStatus(sessionId, { completedSteps });

        sseHub.emit(sessionId, 'paid', {
          source: 'ManagerAgent',
          agent: worker.name,
          amount: response.data.pricePaid,
          txHash: response.data.txHash,
          explorerUrl: `https://stellar.expert/explorer/testnet/tx/${response.data.txHash}`,
          fallbackUsed: response.fallbackUsed,
          attempts: response.attempts,
          depth
        });

        const recursiveTransactions = extractRecursiveTransactions(response.data.data);
        for (const subTx of recursiveTransactions) {
          const resolvedDepth = Number.isFinite(subTx.depth) ? Number(subTx.depth) : depth + 1;
          addTransaction({
            from: subTx.from ?? worker.name,
            to: subTx.agent,
            amount: subTx.pricePaid,
            asset: 'USDC',
            txHash: subTx.txHash,
            sessionId,
            depth: Math.max(depth + 1, resolvedDepth)
          });

          registerPaymentToSession(sessionId, subTx.txHash, subTx.pricePaid, subTx.agent);

          sseHub.emit(sessionId, 'recursive-paid', {
            source: subTx.from ?? worker.name,
            agent: subTx.agent,
            amount: subTx.pricePaid,
            txHash: subTx.txHash,
            explorerUrl: `https://stellar.expert/explorer/testnet/tx/${subTx.txHash}`,
            depth: Math.max(depth + 1, resolvedDepth),
            parentAgent: worker.name,
            fallbackUsed: Boolean(subTx.fallbackUsed),
            attempts: Number(subTx.attempts ?? 1)
          });
        }

        sseHub.emit(sessionId, 'step-complete', {
          step: completedSteps,
          totalSteps: prioritized.length,
          agent: worker.name,
          metrics: getSessionMetrics(sessionId)
        });
        logInfo('Step completed', {
          sessionId,
          agent: worker.name,
          txHash: response.data.txHash,
          paid: response.data.pricePaid,
          completedSteps,
          totalSteps: prioritized.length
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        registerSessionError(sessionId, `${worker.name}: ${message}`);
        recordJobResult(worker.name, false);
        sseHub.emit(sessionId, 'error', {
          agent: worker.name,
          message,
          depth
        });
        sseHub.emit(sessionId, 'step-failed', {
          step: completedSteps + 1,
          totalSteps: prioritized.length,
          agent: worker.name
        });
        logWarn('Step failed', {
          sessionId,
          agent: worker.name,
          message
        });
      }
    }

    const summary = await summarize(query, outputs);
    const finalMetrics = getSessionMetrics(sessionId);
    completeSession(sessionId, summary);
    sseHub.emit(sessionId, 'complete', {
      summary,
      metrics: finalMetrics,
      partial: Boolean(getSessionMetrics(sessionId).transactionCount < prioritized.length)
    });
    logInfo('Manager session completed', {
      sessionId,
      partial: Boolean(getSessionMetrics(sessionId).transactionCount < prioritized.length),
      transactionCount: finalMetrics.transactionCount,
      totalSpend: finalMetrics.totalSpend
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateSessionStatus(sessionId, { complete: true, summary: `Execution failed: ${message}` });
    sseHub.emit(sessionId, 'error', { message });
    logError('Manager session crashed', {
      sessionId,
      message
    });
  }
}

async function createPlan(query: string, agents: AgentCatalogItem[]): Promise<{ explanation: string; steps: ManagerStep[] }> {
  if (!claude) {
    return localPlanner(query, agents);
  }

  try {
    const completion = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Query: ${query}\nAgents: ${JSON.stringify(agents)}\nReturn strict JSON {"explanation":"...","steps":[{"agentName":"PriceFeed|NewsDigest|Summarizer|SentimentAI|MathSolver|DeepResearch","reason":"...","input":"..."}]}`
        }
      ]
    });

    const textParts = completion.content.filter((item) => item.type === 'text');
    const raw = textParts.map((item) => item.text).join('\n').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw) as { explanation: string; steps: ManagerStep[] };
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return localPlanner(query, agents);
    }
    return parsed;
  } catch {
    return localPlanner(query, agents);
  }
}

function localPlanner(query: string, agents: AgentCatalogItem[]): { explanation: string; steps: ManagerStep[] } {
  const lower = query.toLowerCase();
  const steps: ManagerStep[] = [];

  const addStep = (agentName: AgentName, reason: string, input = query) => {
    if (!agents.find((a) => a.name === agentName)) return;
    if (steps.find((s) => s.agentName === agentName)) return;
    steps.push({ agentName, reason, input, depth: agentName === 'DeepResearch' ? 1 : 0 });
  };

  if (lower.includes('research')) addStep('DeepResearch', 'Complex query requires recursive research');
  if (lower.includes('news') || lower.includes('headline')) addStep('NewsDigest', 'News context requested');
  if (lower.includes('sentiment')) addStep('SentimentAI', 'Sentiment analysis requested');
  if (lower.includes('price') || lower.includes('xlm') || lower.includes('btc') || lower.includes('eth')) {
    addStep('PriceFeed', 'Price lookup requested');
  }
  if (/[0-9]+\s*[+\-*/]/.test(lower)) addStep('MathSolver', 'Math expression detected');

  addStep('Summarizer', 'Final summary generation');

  return {
    explanation: 'Rule-based fallback planner selected workers by query intent and price efficiency.',
    steps
  };
}

function prioritizeSteps(steps: ManagerStep[], agents: AgentCatalogItem[]): ManagerStep[] {
  const score = (step: ManagerStep): number => {
    const agent = agents.find((item) => item.name === step.agentName);
    if (!agent) return 0;
    const reputationWeight = agent.reputation / 10000;
    const totalJobs = agent.jobsCompleted + agent.jobsFailed;
    const reliabilityWeight = totalJobs > 0 ? agent.jobsCompleted / totalJobs : 0.5;
    const costWeight = Math.min(1, 1 / Math.max(agent.price * 1000, 1));
    return Number((reputationWeight * 0.45 + reliabilityWeight * 0.35 + costWeight * 0.2).toFixed(6));
  };

  const nonSummary = steps.filter((step) => step.agentName !== 'Summarizer').sort((a, b) => score(b) - score(a));
  const summary = steps.filter((step) => step.agentName === 'Summarizer');
  return [...nonSummary, ...summary];
}

function normalizePlanSteps(steps: ManagerStep[], agents: AgentCatalogItem[], query: string): ManagerStep[] {
  const seen = new Set<AgentName>();
  const normalized: ManagerStep[] = [];

  for (const step of steps) {
    if (!agents.some((item) => item.name === step.agentName)) continue;
    if (seen.has(step.agentName)) continue;
    seen.add(step.agentName);
    normalized.push({
      agentName: step.agentName,
      reason: step.reason,
      input: step.input || query,
      depth: step.agentName === 'DeepResearch' ? 1 : 0
    });
  }

  if (!seen.has('Summarizer') && agents.some((item) => item.name === 'Summarizer')) {
    normalized.push({
      agentName: 'Summarizer',
      reason: 'Summarize all worker outputs into a final answer',
      input: query,
      depth: 0
    });
  }

  return normalized;
}

function extractRecursiveTransactions(payload: unknown): RecursiveSubTransaction[] {
  if (!payload || typeof payload !== 'object') return [];
  const maybeData = (payload as Record<string, unknown>).subTransactions;
  if (!Array.isArray(maybeData)) return [];

  const normalized: RecursiveSubTransaction[] = [];
  for (const item of maybeData) {
    if (!item || typeof item !== 'object') continue;
    const objectItem = item as Record<string, unknown>;
    if (typeof objectItem.agent !== 'string' || typeof objectItem.txHash !== 'string') continue;
    const pricePaid = Number(objectItem.pricePaid ?? 0);
    if (!Number.isFinite(pricePaid)) continue;

    normalized.push({
      agent: objectItem.agent,
      txHash: objectItem.txHash,
      pricePaid,
      from: typeof objectItem.from === 'string' ? objectItem.from : undefined,
      depth: Number(objectItem.depth ?? NaN),
      fallbackUsed: Boolean(objectItem.fallbackUsed),
      attempts: Number(objectItem.attempts ?? 1)
    });
  }

  return normalized;
}

async function summarize(query: string, results: Array<{ agent: string; result: unknown }>): Promise<string> {
  if (!claude) {
    return [`Query: ${query}`, ...results.map((item) => `${item.agent}: ${JSON.stringify(item.result)}`)].join('\n');
  }

  try {
    const completion = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Query: ${query}\nResults: ${JSON.stringify(results)}\nProvide concise final answer.`
        }
      ]
    });
    const textParts = completion.content.filter((item) => item.type === 'text');
    return textParts.map((item) => item.text).join('\n').trim();
  } catch {
    return [`Query: ${query}`, ...results.map((item) => `${item.agent}: ${JSON.stringify(item.result)}`)].join('\n');
  }
}
