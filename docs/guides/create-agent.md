# Create an agent

This guide adds a **new worker** that participates in the same **x402 + registry** patterns as existing routes.

**Assumption:** the new capability maps to an existing **planner role** and **capability string** (e.g. another `PriceFeed` under `price`). Adding a **new role** touches TypeScript unions and planner prompts — doable, but larger scope.

## 1. Register on Soroban

The backend loads the agent catalog from **`list_agents`** only. Call **`register_agent`** on your deployed **`contracts/agent-registry`** (CLI, script, or Stellar Lab) with:

- **`name`** — unique registry symbol (e.g. `my_price_bot`); this is the **`x-registry-agent`** id the manager sends.
- **`endpoint`** — HTTP segment under `/agents/…` (e.g. `price` or `myfeed`); must map to a planner role in **`backend/src/registry/soroban.ts`** (`ENDPOINT_TO_PLANNER`).
- **`price_usdc`** — **micro** USDC (6 decimals).
- **`capability`** — bucket string (e.g. `"price"`), aligned with Soroban and the paywall map.

After registration, **`list_agents`** must return your row or the backend will not offer that worker.

## 2. Implement the Express router

Create **`backend/src/agents/myfeed.ts`** (pattern from `price.ts`):

```typescript
import { Router } from 'express';
import { agentPaywallMiddleware } from '../payments/x402Middleware.js';
import { buildAgentResponse } from './response.js';

const router = Router();

router.post('/', agentPaywallMiddleware('myfeed'), async (req, res) => {
  // ... compute result ...
  buildAgentResponse({ res, agentName: registryIdFromHeader, pricePaid, data, ... });
});

export default router;
```

Register in **`backend/src/agents/index.ts`**:

```typescript
import myfeedRouter from './myfeed.js';
router.use('/myfeed', myfeedRouter);
```

## 3. Wire the paywall map

In **`backend/src/payments/x402Middleware.ts`**, extend **`ENDPOINT_CAPABILITY`**:

```typescript
const ENDPOINT_CAPABILITY: Record<string, string> = {
  // ...
  myfeed: 'price'   // capability bucket for Soroban + engine
};
```

**Why:** `agentPaywallMiddleware` maps the HTTP segment to the **capability** used when picking defaults; in development it skips the paywall unless `SYNS_DEMO_NO_X402=0`.

## 4. Map endpoint → planner role (if new segment)

In **`backend/src/registry/soroban.ts`**, extend **`ENDPOINT_TO_PLANNER`** so RPC rows parse into the correct role:

```typescript
const ENDPOINT_TO_PLANNER: Record<string, PlannerAgentRole> = {
  // ...
  myfeed: 'PriceFeed'
};
```

## 5. Environment keys

Add a matching **`AGENT_*_PUBLIC_KEY`** in **`.env`** and extend **`ROLE_RECIPIENTS`** in **`backend/src/payments/x402Middleware.ts`** if you introduce a new **planner role** (same pattern as `PriceFeed` → `AGENT_PRICE_PUBLIC_KEY`).

For **same role, new id only**, payment recipients often reuse the capability’s configured key — align with how existing price agents share **`AGENT_PRICE_PUBLIC_KEY`**.

## 6. Verify

```bash
curl -s http://localhost:4000/agents/catalog | jq .
# Hire with header (manager does this automatically):
curl -s -X POST http://localhost:4000/agents/myfeed \
  -H "Content-Type: application/json" \
  -H "x-registry-agent: my_price_bot" \
  -d '{"input":"test"}'
```

Expect **402** without a signed payment; the manager’s **`x402FetchJson`** path should complete the handshake.

## Related docs

- **[Agents](/docs/core-concepts/agents)** — roles and capabilities.
- **[Payments](/docs/core-concepts/payments)** — paywall behavior.
