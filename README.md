# MemO — Agent Task Ledger & Vector Audit Memory

Decoupled AI-agent task manager + append-only audit ledger, built on MongoDB Atlas.
Hooks into an agent's execution loop and meticulously records what was planned, what is
being done, and what was completed — so any multi-step workflow can be audited or debugged
months later with semantic search.

## Architecture

| Layer | Tech |
|---|---|
| App | Next.js 16 (App Router) + TypeScript |
| Primary store | MongoDB Atlas — db `memo`, JSON-schema validated collections |
| Vector memory | Atlas Vector Search — `memo_vec_idx`, 384-d cosine (bge-small-en-v1.5) |
| Embeddings | edge AI inference endpoint (primary) → hosted provider (secondary) → deterministic local hash (fallback) |
| Manifest sync | `agent_todo.json` + `.agent_status.md` regenerated on every state change, mirrored to object storage (S3 SigV4) |
| UI | Dark audit dashboard: task board, full timelines, semantic search bar, live manifest |

## Data model

- **`tasks`** — macro plan: `TASK-YYYYMMDD-NN`, title, description, status `PENDING → IN_PROGRESS → COMPLETED/FAILED`.
- **`execution_logs`** — **append-only** audit ledger: task FK, DB timestamp, phase (`PLANNING | TOOL_CALL | VERIFICATION | SYSTEM_HANDOFF`), `agent_reasoning`, `action_payload`, `execution_result`. No update/delete path exists anywhere in this codebase.
- **`log_vectors`** — every committed log is embedded (audit string = task_id + phase + action + result) and indexed with `log_id` + metadata.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | liveness + row counts |
| GET/POST | `/api/tasks` | list / create task *(POST: `x-memo-key`)* |
| GET/PATCH | `/api/tasks/[id]` | detail + full timeline / status change *(PATCH: key)* |
| GET/POST | `/api/logs` | recent ledger entries / append immutable step *(POST: key)* |
| GET | `/api/search?q=&limit=` | `semantic_audit_search` — kNN over log vectors, joined to full log docs |
| GET | `/api/manifest` | current `agent_todo.json` + `.agent_status.md` |

## SDK / orchestrator example

`scripts/memo_client.py` (in the runtime workspace) — `create_task → update_status → log_step(...) → semantic_audit_search → update_status`, including a `tool()` helper that records a shell command before/after execution (spec deliverable #3).

## Self-recording

MemO's first production task was recording its own construction — open the dashboard and
see the build history (8 entries, PLANNING → SYSTEM_HANDOFF) as proof.
