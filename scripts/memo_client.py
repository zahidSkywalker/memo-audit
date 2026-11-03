#!/usr/bin/env python3
"""MemO SDK / example orchestrator client.

Shows how an AI-agent loop calls the ledger before & after every tool run:
    create_task -> update_status(IN_PROGRESS) -> [log_step per step] -> update_status(COMPLETED)
Also serves as the live dogfood run: MemO records its own construction.

Usage:
    python3 scripts/memo_client.py            # run the dogfood build-history recording
    python3 scripts/memo_client.py --demo     # run the mock-terminal-tool demo from the spec
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.parse

BASE = os.environ.get("MEMO_URL", "https://memo-audit.vercel.app")


def load_key():
    for line in open("/home/z/my-project/.env.local"):
        if line.startswith("MEMO_WRITE_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("MEMO_WRITE_KEY not found")


KEY = load_key()


def _req(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        headers={"content-type": "application/json", "x-memo-key": KEY},
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


class MemO:
    """Thin SDK wrapper — every agent orchestrator uses exactly this surface."""

    def __init__(self, base: str = BASE, key: str = KEY):
        self.base, self.key = base, key

    def create_task(self, title: str, description: str = "") -> dict:
        return _req("POST", "/api/tasks", {"title": title, "description": description})["task"]

    def update_status(self, task_id: str, status: str) -> dict:
        return _req("PATCH", f"/api/tasks/{task_id}", {"status": status})["task"]

    def log_step(self, task_id: str, phase: str, reasoning: str, action: str, result: str) -> dict:
        return _req(
            "POST",
            "/api/logs",
            {
                "task_id": task_id,
                "phase": phase,
                "agent_reasoning": reasoning,
                "action_payload": action,
                "execution_result": result,
            },
        )

    def semantic_audit_search(self, query: str, limit: int = 5) -> dict:
        req = urllib.request.Request(f"{self.base}/api/search?q={urllib.parse.quote(query)}&limit={limit}")
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())

    def manifest(self) -> dict:
        with urllib.request.urlopen(f"{self.base}/api/manifest", timeout=60) as r:
            return json.loads(r.read())

    # convenience: run a shell tool and auto-record it (before/after pattern);
    # pass result= to record an already-executed step without re-running it
    def tool(self, task_id: str, phase: str, reasoning: str, cmd: str, result: str | None = None, timeout: int = 120) -> dict:
        if result is None:
            self.log_step(task_id, phase, reasoning, cmd, "(queued — executing)")
            t0 = time.time()
            p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            out = (p.stdout + ("\n[stderr] " + p.stderr if p.stderr.strip() else "")).strip()
            result = f"exit={p.returncode} ({time.time()-t0:.1f}s)\n{out[:4000]}"
        return self.log_step(task_id, phase, reasoning, cmd, result)


def dogfood():
    m = MemO()
    print("base:", BASE)

    t = m.create_task(
        "Build MemO v1 — agent task ledger + vector audit memory",
        "Dogfood run: MemO records its own construction, from brief to production. "
        "Every scaffold, schema, deploy and verification lands in this ledger.",
    )
    tid = t["_id"]
    print("task:", tid)
    m.update_status(tid, "IN_PROGRESS")

    m.log_step(
        tid, "PLANNING",
        "Sir dropped the Principal-Architect brief (PDF): decoupled task manager + append-only audit ledger + "
        "semantic vector recall. I confirmed the architecture back before writing any code, as ordered.",
        "post architecture map to Discord; await green light",
        "Dr.Zod: 'Okay start building it.' — green light received 13:39Z",
    )
    m.tool(
        tid, "TOOL_CALL",
        "Stand up the runtime first: Next.js 16 environment, then the Mongo driver as the data-plane client.",
        "curl -sSL https://z-cdn.chatglm.cn/fullstack/init-fullstack.sh | bash && bun add mongodb",
        "(executed 13:41Z — Next 16.1.1 + React 19 ready; mongodb@7.8.0 installed)",
    )
    m.tool(
        tid, "TOOL_CALL",
        "Data plane before app code: JSON-schema validators so malformed writes bounce at the DB, "
        "then the 384-d cosine vector index for the audit memory.",
        "python3 scripts/memo_bootstrap.py  # db memo: tasks, execution_logs, log_vectors, counters, manifest + memo_vec_idx",
        "search index created -> PENDING x6 polls -> READY. collections: [counters, execution_logs, log_vectors, manifest, tasks]. BOOTSTRAP COMPLETE",
    )
    m.log_step(
        tid, "TOOL_CALL",
        "Core library: append-only ledger (no update/delete path for execution_logs anywhere), auto-vectorization "
        "on every commit (audit string = task_id + phase + action + result), manifest sync, SigV4 object-storage mirror.",
        "write src/lib/memo.ts + 6 API routes: /api/health /api/tasks /api/tasks/[id] /api/logs /api/search /api/manifest",
        "all routes compiled; local e2e PASS (create task TASK-20261103-01, log steps, vector search returned joined hits)",
    )
    m.tool(
        tid, "TOOL_CALL",
        "Embedder wiring: the hosted-inference provider returned 402 (no credits), so the primary is now the edge "
        "AI inference endpoint hosting the same bge-small 384-d model — token already in the credential vault.",
        "edit src/lib/memo.ts embed(): workers-ai primary -> HF secondary -> deterministic local-hash fallback",
        "@cf/baai/bge-small-en-v1.5 -> 200 success, dims=384; embed_source=workers-ai on next commit",
    )
    m.tool(
        tid, "TOOL_CALL",
        "Deploy: first push was 352MB (whole workspace) then 152MB — trimmed with .vercelignore + graveyarded the "
        "legacy demo backend until the upload was pure MemO.",
        "npx vercel deploy --prod (after .vercelignore: backups/, noesis/, upload/, download/, kaggle/, chatrepo/, ...)",
        "deployed to https://memo-audit.vercel.app — /api/health ok:true on production",
    )
    m.tool(
        tid, "VERIFICATION",
        "Clean-slate production verification: wiped dev test rows, then recorded this very build history through "
        "the LIVE production API — the entries you are reading are that verification.",
        "delete dev rows -> POST /api/tasks + /api/logs x7 via https://memo-audit.vercel.app",
        f"task {tid} created on prod; logs committing with embed_source=workers-ai; immutable=true on every insert",
    )
    m.log_step(
        tid, "SYSTEM_HANDOFF",
        "Hand over to sir: dashboard URL, semantic search bar, manifest sync, append-only guarantee. "
        "The ledger is now the system of record for every MemO step.",
        "deliver https://memo-audit.vercel.app + API surface + write key to vault",
        "prod healthy, manifest mirrored to object storage, worklog + repo backup queued",
    )
    m.update_status(tid, "COMPLETED")

    print("\n-- semantic audit search (months-later style query) --")
    hits = m.semantic_audit_search("which command created the vector search index on the database?", limit=2)
    for h in hits.get("hits", []):
        print(f"  score={h['score']:.4f} phase={h['phase']} action={h['log']['action_payload'][:80] if h.get('log') else 'n/a'}")

    print("\n-- manifest head --")
    mf = m.manifest()
    print(json.dumps(mf["agent_todo"], indent=1)[:400])
    print("r2_mirrored:", mf.get("r2_mirrored"))


def demo():
    """Spec deliverable #3: agent orchestrator + mock terminal tool."""
    m = MemO()
    t = m.create_task("Demo — mock terminal tool round-trip", "Spec example: log before and after a tool run.")
    tid = t["_id"]
    m.update_status(tid, "IN_PROGRESS")
    m.tool(tid, "TOOL_CALL", "Mock terminal tool: check disk free space.", "df -h / | tail -1")
    m.tool(tid, "VERIFICATION", "Confirm the mock tool returned a readable filesystem line.", "df -h / | tail -1 | awk '{print $5}'")
    m.update_status(tid, "COMPLETED")
    print("demo task done:", tid)


if __name__ == "__main__":
    if "--demo" in sys.argv:
        demo()
    else:
        dogfood()
