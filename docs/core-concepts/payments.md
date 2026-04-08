# Payments

## x402 in one paragraph

**x402** is HTTP’s **“Payment Required”** pattern made machine-usable: a server responds with **402** and **payment requirements**; a client **signs** an authorization; a **facilitator** helps **verify and settle** so the resource server can return **200** with a **payment response** header carrying the **on-chain transaction** reference.

**Why this matters:** agents do not need shared merchant accounts or bespoke billing SDKs. They use **the same protocol as other HTTP clients**, which is how autonomous software scales economically.

## How payments flow in SynergiStellar

### Worker routes (server)

1. Request hits `POST /agents/:endpoint` (e.g. `backend/src/agents/price.ts`).
2. Middleware **`createPaywallForEndpoint`** (`backend/src/payments/x402Middleware.ts`):
   - Resolves **registry id** from `x-registry-agent` or picks best for that route’s capability.
   - Builds **payment requirements** (Stellar testnet/mainnet via `getStellarCaip2Network()`).
   - No `PAYMENT-SIGNATURE` / `X-PAYMENT` → **402** + JSON error `PAYMENT_REQUIRED`.
   - Valid payment → **verify** → **settle** → set **`PAYMENT-RESPONSE`** header → handler runs.
3. Successful settlement is **logged** (`recordX402Settlement`: agent, amount, tx hash, timestamp).

### Manager → worker (client)

1. **`x402FetchJson`** (`backend/src/payments/x402Client.ts`) wraps **`wrapFetchWithPaymentFromConfig`** with the **manager’s** Stellar signer.
2. First response may be **402**; the stack completes the handshake and retries with proof.
3. Response JSON is merged with **tx hash** from the payment response header when present.

**Why Stellar**

- **Fast, cheap settlement** suited to micro-payments and demos.
- **USDC** on testnet/mainnet maps cleanly to “real unit of account” for judges.
- **Soroban** lives alongside: **registry state** (reputation, price) complements **payment state** (x402 / facilitator), so **market discovery** and **settlement** are separable concerns.

## Configuration (non-negotiable in this repo)

- **Mandatory facilitator** — x402 settlement is required; see `backend/src/infra/config.ts` startup checks.
- **Keys:** `MANAGER_SECRET_KEY`, all `AGENT_*_PUBLIC_KEY`, `FACILITATOR_URL`.

## APIs and observability

- **`GET /api/payments/x402-settlements`** — middleware settlement ledger.
- **`GET /api/transactions`** — session-scoped payment records for the UI.
- **Dashboard Transaction log** — Stellar Expert links for 64-char on-chain hashes.

## Related docs

- **[Architecture / system overview](/docs/architecture/system-overview)** — where middleware and client sit in the stack.
- **[Quickstart](/docs/quickstart)** — env setup.
