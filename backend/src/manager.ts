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
import { AgentCatalogItem, PlannerAgentRole } from './lib/types.js';
import { sseHub } from './sse.js';
import {
  getAgentCatalog,
  pickBestAgentForCapability,
  plannerRoleToCapability,
  recordJobResult,
  scoreAgentDecision
} from './stellar/contract.js';
import { x402FetchJson } from './x402/client.js';
import { isX402RealMode, isX402RealOnly } from './config.js';

interface ManagerStep {
  agentName: PlannerAgentRole;
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

const AGENT_TIMEOUT_MS = 14_000;
const MAX_RECURSION_DEPTH = 3;
const MAX_STEP_ATTEMPTS = 3;

const claude = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

function getBackendBaseUrl(): string {
  return process.env.RUNTIME_BACKEND_BASE_URL || env.BACKEND_BASE_URL;
}

function parseBudgetUsd(query: string): number | undefined {
  const m = query.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function catalogHasRole(agents: AgentCatalogItem[], role: PlannerAgentRole): boolean {
  return agents.some((a) => a.plannerRole === role);
}

export function startQuerySession(query: string): string {
  const sessionId = randomUUID();
  const budget = parseBudgetUsd(query);
  createSessionStatus(sessionId, query, budget);
  logInfo('Query session created', { sessionId, query, budgetUsd: budget });
  void runManagerSession(sessionId, query, budget);
  return sessionId;
}

async function runManagerSession(sessionId: string, query: string, budgetUsd: number | undefined): Promise<void> {
  logInfo('Manager session started', { sessionId, query });
  sseHub.emit(sessionId, 'status', { message: 'Manager started planning', stage: 'planning' });
  const budgetLimit = budgetUsd ?? Number.POSITIVE_INFINITY;

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
    let spentSession = 0;

    for (const step of prioritized) {
      const capability = plannerRoleToCapability(step.agentName);
      const depth = Math.min(step.depth ?? 1, MAX_RECURSION_DEPTH);
      const tried = new Set<string>();
      let stepDone = false;

      for (let attempt = 0; attempt < MAX_STEP_ATTEMPTS && !stepDone; attempt++) {
        const remaining = budgetLimit - spentSession;
        if (remaining <= 0 && budgetUsd !== undefined) {
          registerSessionError(sessionId, 'Budget exhausted');
          sseHub.emit(sessionId, 'error', { message: 'Budget exhausted', depth });
          break;
        }

        const worker = pickBestAgentForCapability(
          capability,
          budgetUsd === undefined ? Number.MAX_VALUE : remaining,
          tried
        );
        if (!worker) {
          registerSessionError(sessionId, `No agent available for ${capability} within budget`);
          sseHub.emit(sessionId, 'error', {
            message: `No agent for capability ${capability}`,
            depth
          });
          break;
        }
        tried.add(worker.id);

        logInfo('Executing step', {
          sessionId,
          agent: worker.id,
          capability,
          attempt: attempt + 1,
          depth,
          completedSteps,
          totalSteps: prioritized.length
        });

        sseHub.emit(sessionId, 'step-start', {
          step: completedSteps + 1,
          totalSteps: prioritized.length,
          agent: worker.id,
          plannerRole: step.agentName,
          depth
        });

        sseHub.emit(sessionId, 'hiring', {
          agent: worker.id,
          price: worker.price,
          reason: step.reason,
          depth
        });

        const endpointUrl = `${getBackendBaseUrl()}/agents/${worker.endpoint}`;
        const useFallback = !(isX402RealMode && isX402RealOnly);

        try {
          const response = await x402FetchJson<WorkerResponse>(sessionId, endpointUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-registry-agent': worker.id
            },
            body: JSON.stringify({ input: step.input, depth })
          }, {
            retries: 2,
            timeoutMs: AGENT_TIMEOUT_MS,
            agentName: worker.id,
            fallbackFactory: useFallback
              ? (reason) => ({
                  agent: worker.id,
                  pricePaid: 0,
                  data: { fallback: true, reason },
                  txHash: `fallback-${worker.endpoint}-${Date.now().toString(16)}`
                })
              : undefined
          });

          spentSession += response.data.pricePaid;
          outputs.push({
            agent: worker.id,
            result: response.data.data
          });

          addTransaction({
            from: 'ManagerAgent',
            to: worker.id,
            amount: response.data.pricePaid,
            asset: 'USDC',
            txHash: response.data.txHash,
            sessionId,
            depth
          });

          registerPaymentToSession(sessionId, response.data.txHash, response.data.pricePaid, worker.id);
          recordJobResult(worker.id, true);
          completedSteps += 1;
          updateSessionStatus(sessionId, { completedSteps });
          stepDone = true;

          sseHub.emit(sessionId, 'paid', {
            source: 'ManagerAgent',
            agent: worker.id,
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
              from: subTx.from ?? worker.id,
              to: subTx.agent,
              amount: subTx.pricePaid,
              asset: 'USDC',
              txHash: subTx.txHash,
              sessionId,
              depth: Math.max(depth + 1, resolvedDepth)
            });

            registerPaymentToSession(sessionId, subTx.txHash, subTx.pricePaid, subTx.agent);

            sseHub.emit(sessionId, 'recursive-paid', {
              source: subTx.from ?? worker.id,
              agent: subTx.agent,
              amount: subTx.pricePaid,
              txHash: subTx.txHash,
              explorerUrl: `https://stellar.expert/explorer/testnet/tx/${subTx.txHash}`,
              depth: Math.max(depth + 1, resolvedDepth),
              parentAgent: worker.id,
              fallbackUsed: Boolean(subTx.fallbackUsed),
              attempts: Number(subTx.attempts ?? 1)
            });
          }

          sseHub.emit(sessionId, 'step-complete', {
            step: completedSteps,
            totalSteps: prioritized.length,
            agent: worker.id,
            metrics: getSessionMetrics(sessionId)
          });
          logInfo('Step completed', {
            sessionId,
            agent: worker.id,
            txHash: response.data.txHash,
            paid: response.data.pricePaid,
            completedSteps,
            totalSteps: prioritized.length
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          registerSessionError(sessionId, `${worker.id}: ${message}`);
          recordJobResult(worker.id, false);
          sseHub.emit(sessionId, 'error', {
            agent: worker.id,
            message,
            depth,
            attempt: attempt + 1
          });
          logWarn('Step attempt failed', {
            sessionId,
            agent: worker.id,
            message,
            attempt: attempt + 1
          });
          if (attempt === MAX_STEP_ATTEMPTS - 1) {
            sseHub.emit(sessionId, 'step-failed', {
              step: completedSteps + 1,
              totalSteps: prioritized.length,
              agent: worker.id
            });
          }
        }
      }
    }

    const summary = await summarizeFinal(query, outputs);
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
    logError('Manager session crashed', { sessionId, message });
  }
}

async function createPlan(
  query: string,
  agents: AgentCatalogItem[]
): Promise<{ explanation: string; steps: ManagerStep[] }> {
  const roleList = [
    ...new Set(agents.map((a) => a.plannerRole))
  ].join('|');

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
          content: `Query: ${query}\nAvailable planner roles (pick at most one worker per role): ${roleList}\nReturn strict JSON {"explanation":"...","steps":[{"agentName":"One of the roles","reason":"...","input":"..."}]}`
        }
      ]
    });

    const textParts = completion.content.filter((item) => item.type === 'text');
    const raw = textParts.map((item) => item.text).join('\n').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw) as { explanation: string; steps: ManagerStep[] };
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return localPlanner(query, agents);
    }
    const steps = zodSafeSteps(parsed.steps);
    if (steps.length === 0) return localPlanner(query, agents);
    return { explanation: parsed.explanation || 'LLM plan', steps };
  } catch {
    return localPlanner(query, agents);
  }
}

function zodSafeSteps(raw: ManagerStep[]): ManagerStep[] {
  const roles: PlannerAgentRole[] = [
    'PriceFeed',
    'NewsDigest',
    'Summarizer',
    'SentimentAI',
    'MathSolver',
    'DeepResearch'
  ];
  const out: ManagerStep[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const agentName = (s as ManagerStep).agentName;
    if (!roles.includes(agentName)) continue;
    out.push({
      agentName,
      reason: String((s as ManagerStep).reason ?? ''),
      input: String((s as ManagerStep).input ?? ''),
      depth: (s as ManagerStep).depth
    });
  }
  return out;
}

function localPlanner(query: string, agents: AgentCatalogItem[]): { explanation: string; steps: ManagerStep[] } {
  const lower = query.toLowerCase();
  const steps: ManagerStep[] = [];

  const addStep = (role: PlannerAgentRole, reason: string, input = query) => {
    if (!catalogHasRole(agents, role)) return;
    if (steps.find((s) => s.agentName === role)) return;
    steps.push({ agentName: role, reason, input, depth: role === 'DeepResearch' ? 1 : 0 });
  };

  if (lower.includes('research')) addStep('DeepResearch', 'Recursive multi-source research');
  if (lower.includes('news') || lower.includes('headline')) addStep('NewsDigest', 'Live news context');
  if (lower.includes('sentiment')) addStep('SentimentAI', 'Sentiment scoring');
  if (lower.includes('price') || lower.includes('xlm') || lower.includes('btc') || lower.includes('eth')) {
    addStep('PriceFeed', 'Spot prices');
  }
  if (/[0-9]+\s*[+\-*/]/.test(lower)) addStep('MathSolver', 'Arithmetic');

  addStep('Summarizer', 'Consolidate findings');

  return {
    explanation: 'Heuristic planner mapped intent to capability roles; registry picks competing workers.',
    steps
  };
}

function bestRoleScore(role: PlannerAgentRole, agents: AgentCatalogItem[]): number {
  const cap = plannerRoleToCapability(role);
  const candidates = agents.filter((a) => a.plannerRole === role);
  if (candidates.length === 0) return -1;
  return Math.max(...candidates.map((c) => scoreAgentDecision(c)));
}

function prioritizeSteps(steps: ManagerStep[], agents: AgentCatalogItem[]): ManagerStep[] {
  const nonSummary = steps
    .filter((step) => step.agentName !== 'Summarizer')
    .sort((a, b) => bestRoleScore(b.agentName, agents) - bestRoleScore(a.agentName, agents));
  const summary = steps.filter((step) => step.agentName === 'Summarizer');
  return [...nonSummary, ...summary];
}

function normalizePlanSteps(steps: ManagerStep[], agents: AgentCatalogItem[], query: string): ManagerStep[] {
  const seen = new Set<PlannerAgentRole>();
  const normalized: ManagerStep[] = [];

  for (const step of steps) {
    if (!catalogHasRole(agents, step.agentName)) continue;
    if (seen.has(step.agentName)) continue;
    seen.add(step.agentName);
    normalized.push({
      agentName: step.agentName,
      reason: step.reason,
      input: step.input || query,
      depth: step.agentName === 'DeepResearch' ? 1 : 0
    });
  }

  if (!seen.has('Summarizer') && catalogHasRole(agents, 'Summarizer')) {
    normalized.push({
      agentName: 'Summarizer',
      reason: 'Synthesize worker outputs',
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

async function summarizeFinal(
  query: string,
  results: Array<{ agent: string; result: unknown }>
): Promise<string> {
  if (!claude) {
    try {
      const { completeText } = await import('./lib/llm.js');
      return await completeText(
        `User query: ${query}\nWorker JSON results: ${JSON.stringify(results).slice(0, 100_000)}\nGive a tight final answer.`
      );
    } catch {
      return [`Query: ${query}`, ...results.map((item) => `${item.agent}: ${JSON.stringify(item.result)}`)].join(
        '\n'
      );
    }
  }

  try {
    const completion = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 700,
      messages: [
        {
          role: 'user',
          content: `Query: ${query}\nResults: ${JSON.stringify(results).slice(0, 100_000)}\nProvide concise final answer.`
        }
      ]
    });
    const textParts = completion.content.filter((item) => item.type === 'text');
    return textParts.map((item) => item.text).join('\n').trim();
  } catch {
    try {
      const { completeText } = await import('./lib/llm.js');
      return await completeText(`Query: ${query}\nResults: ${JSON.stringify(results).slice(0, 80_000)}`);
    } catch {
      return [`Query: ${query}`, ...results.map((item) => `${item.agent}: ${JSON.stringify(item.result)}`)].join(
        '\n'
      );
    }
  }
}
