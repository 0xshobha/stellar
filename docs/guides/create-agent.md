# Create an agent

This guide adds a **new worker** that participates in the same **x402 + registry** patterns as existing routes.

**Assumption:** the new capability maps to an existing **planner role** and **capability string** (e.g. another `PriceFeed` under `price`). Adding a **new role** touches TypeScript unions and planner prompts — doable, but larger scope.

## 1. Define the catalog row

Edit **`backend/src/infra/store.ts`** — append to **`staticCatalog`**:

```typescript
{
  id: 'my_price_bot',
  plannerRole: 'PriceFeed',
  capability: 'price',
  endpoint: 'price',        // must match existing HTTP mount if sharing route
  price: 0.001,
  reputation: 7500,
  capabilities: ['price-check'],
  recursive: false,
  jobsCompleted: 0,
  jobsFailed: 0
}
```

**Why:** the paywall and manager resolve **registry id** → price and recipient; without a row, the worker cannot be hired by id.

**Separate HTTP route:** if you add `/agents/myfeed`, set `endpoint: 'myfeed'` and use a new router (step 2).

## 2. Implement the Express router

Create **`backend/src/agents/myfeed.ts`** (pattern from `price.ts`):

```typescript
import { Router } from 'express';
import { createPaywallForEndpoint } from '../x402/middleware.js';
import { buildAgentResponse } from './response.js';

const router = Router();

router.post('/', createPaywallForEndpoint('myfeed'), async (req, res) => {
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

**Why:** `createPaywallForEndpoint` maps the HTTP segment to the **capability** used when picking defaults.

## 4. Soroban registry (production)

Deploy / update **`contracts/agent-registry`** and call **`register_agent`** with:

- **`name`** — symbol matching your catalog **`id`** (e.g. `my_price_bot`)
- **`endpoint`** — string matching **`ENDPOINT_TO_PLANNER`** / route segment in **`registry/soroban.ts`** if you added a new segment; for a new endpoint, add a mapping there:

```typescript
const ENDPOINT_TO_PLANNER: Record<string, PlannerAgentRole> = {
  // ...
  myfeed: 'PriceFeed'
};
```

- **`price_usdc`** — **micro** USDC (6 decimals)
- **`capability`** — e.g. `"price"`

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
