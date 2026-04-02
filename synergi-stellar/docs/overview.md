# SynergiStellar Overview

SynergiStellar is a hackathon demo of an autonomous agent economy on Stellar.

## Core concepts

- Manager agent decomposes a user request into specialized worker tasks.
- Worker endpoints can be x402-gated to require payment before execution.
- Execution is streamed over SSE so the dashboard updates in real time.
- Recursive execution allows workers to hire other workers.

## Demo flow

1. Submit a query in the dashboard.
2. Manager plans and selects agents by cost and reputation.
3. Payments and protocol events are logged.
4. Final answer is synthesized and returned.
