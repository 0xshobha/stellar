# SynergiStellar Implementation Plan

## Scope

- Build the full SynergiStellar project in a separate directory: `../synergi-stellar`
- Deliver a working monorepo with:
  - Express + TypeScript backend
  - Next.js frontend dashboard
  - Soroban contract scaffold in Rust
  - MCP server in TypeScript
  - Local dev scripts, env examples, and docs
- Prioritize production-like structure and end-to-end runnable flow with mocked external data where needed.

## Delivery Checklist

### 1) Repository and Workspace Setup

- [x] Create `synergi-stellar/` as sibling of `hack/`
- [x] Initialize npm workspaces at root
- [x] Add shared scripts for install, dev, build, lint
- [x] Add root `.gitignore`

### 2) Backend (Express + TypeScript)

- [x] Create backend TypeScript project config
- [x] Implement environment loader and validation
- [x] Implement SSE session manager
- [x] Implement x402 middleware wrapper
- [x] Implement x402 client wrapper with graceful fallback mode
- [x] Implement in-memory transaction store with explorer links
- [x] Implement worker agents:
  - [x] PriceFeed
  - [x] NewsDigest
  - [x] Summarizer
  - [x] SentimentAI
  - [x] MathSolver
  - [x] DeepResearch (recursive)
- [x] Implement manager orchestration service using Claude with fallback planner
- [x] Implement REST APIs:
  - [x] `POST /api/query`
  - [x] `GET /api/events/:sessionId`
  - [x] `GET /api/status/:sessionId`
  - [x] `GET /api/transactions`
  - [x] `GET /api/wallet/balance`
  - [x] `POST /api/wallet/create`
  - [x] `GET /agents/catalog`
  - [x] `GET /agents/reputation/:agentName`

### 3) Frontend (Next.js 14 + Tailwind)

- [x] Initialize app router project structure
- [x] Build dashboard page layout
- [x] Build components:
  - [x] `AgentChat`
  - [x] `TopologyGraph`
  - [x] `TransactionLog`
  - [x] `ProtocolTrace`
  - [x] `AgentCatalog`
- [x] Implement SSE client hook for live updates
- [x] Implement API proxy routes to backend
- [x] Show payment metrics and session status

### 4) Contract (Soroban / Rust)

- [x] Add `contracts/agent-registry` crate
- [x] Implement contract models (`Agent`, `DataKey`)
- [x] Implement register/get/list functions
- [x] Implement job result reputation updates
- [x] Add build instructions in docs

### 5) MCP Server

- [x] Initialize TypeScript MCP server project
- [x] Expose tools:
  - [x] list agents
  - [x] query manager agent
  - [x] agent reputation
  - [x] direct agent call
  - [x] transaction history
  - [x] wallet balance
  - [x] create agent wallet
- [x] Implement robust backend HTTP helper and error formatting

### 6) Scripts, Configuration, and Docs

- [x] Add backend `.env.example`
- [x] Add frontend `.env.local.example`
- [x] Add utility script for wallet generation/funding
- [x] Add README with setup, run, architecture, real-vs-mock details
- [x] Add quick verification steps for x402 flow

### 7) Quality and Build Validation

- [x] Install dependencies for all workspaces
- [x] Run backend build
- [x] Run frontend build
- [x] Run MCP server build
- [x] Run root aggregate build
- [x] Fix compile errors related to this implementation

### 8) Frontend Brand, Legal, and SEO Completeness

- [x] Add brand logo SVG asset
- [x] Add reusable logo component in layout/header
- [x] Add privacy policy page and route
- [x] Add Open Graph dynamic image route
- [x] Add robots metadata route
- [x] Add sitemap metadata route
- [x] Add web manifest metadata route
- [x] Add global metadata for OpenGraph/Twitter/canonical tags

### 9) Frontend Light-Mode Playful UX and Docs Rendering

- [x] Refresh global light-mode visual system (cards, gradients, soft shadows)
- [x] Add playful micro-interactions (hover lift, transitions, subtle animation)
- [x] Improve header and footer sections with cleaner navigation and status chips
- [x] Restyle dashboard panels for better light-mode readability and hierarchy
- [x] Add top-level `docs/` directory with project markdown documents
- [x] Add `/docs` listing page in frontend
- [x] Add `/docs/[slug]` dynamic markdown page renderer
- [x] Enable proper markdown rendering with GFM support and styled prose classes

## Implementation Notes

- Keep comments minimal and only where needed for clarity.
- Do not use emojis in code or docs.
- Keep types explicit and avoid loosely typed public interfaces.
- Keep architecture modular for hackathon iteration speed.
