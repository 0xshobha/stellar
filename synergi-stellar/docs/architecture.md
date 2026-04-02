# Architecture

## Frontend

The frontend uses Next.js App Router, Tailwind CSS, and D3.

- Agent query and status cards
- Topology graph with animated edges
- Transaction log with depth labels
- Protocol trace panel

## Backend

The backend uses Express + TypeScript.

- `/api/query` starts manager execution
- `/api/events/:sessionId` streams SSE events
- `/api/status/:sessionId` returns state + traces
- `/agents/*` exposes worker endpoints

## Smart contract

Soroban contract stores agent registry and reputation state.

- `register_agent`
- `record_job_result`
- `list_agents`
- `update_agent_price`
