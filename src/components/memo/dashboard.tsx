"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------- types ---------------- */

type Status = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
type Phase = "PLANNING" | "TOOL_CALL" | "VERIFICATION" | "SYSTEM_HANDOFF";

interface Task {
  _id: string;
  title: string;
  description: string;
  status: Status;
  created_at: string;
  updated_at: string;
}

interface Log {
  _id: string;
  task_id: string;
  timestamp: string;
  phase: Phase;
  agent_reasoning: string;
  action_payload: string;
  execution_result: string;
}

interface Health {
  ok: boolean;
  tasks: number;
  logs: number;
  vectors: number;
}

interface Manifest {
  updated_at: string;
  r2_mirrored: boolean;
  agent_todo: Record<string, unknown>;
  agent_status_md: string;
}

interface SearchHit {
  score: number;
  task_id: string;
  phase: Phase;
  timestamp: string;
  log: Log | null;
}

/* ---------------- atoms ---------------- */

const statusColor: Record<Status, string> = {
  PENDING: "bg-zinc-700/60 text-zinc-300 border-zinc-600",
  IN_PROGRESS: "bg-amber-500/15 text-amber-300 border-amber-600/40",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-600/40",
  FAILED: "bg-red-500/15 text-red-300 border-red-600/40",
};

const phaseColor: Record<Phase, string> = {
  PLANNING: "bg-violet-500/15 text-violet-300 border-violet-600/40",
  TOOL_CALL: "bg-amber-500/15 text-amber-300 border-amber-600/40",
  VERIFICATION: "bg-emerald-500/15 text-emerald-300 border-emerald-600/40",
  SYSTEM_HANDOFF: "bg-teal-500/15 text-teal-300 border-teal-600/40",
};

function Chip({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${className}`}>
      {label}
    </span>
  );
}

function fmt(iso: string): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 19) + "Z";
}

/* ---------------- dashboard ---------------- */

export default function MemODashboard() {
  const [tab, setTab] = useState<"ledger" | "search" | "manifest">("ledger");
  const [health, setHealth] = useState<Health | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [lastSync, setLastSync] = useState<string>("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshTasks = useCallback(async () => {
    try {
      const [h, t] = await Promise.all([
        fetch("/api/health").then((r) => r.json()),
        fetch("/api/tasks").then((r) => r.json()),
      ]);
      setHealth(h);
      setTasks(t.tasks || []);
      setLastSync(new Date().toISOString());
    } catch {
      /* keep last state on hiccup */
    }
  }, []);

  const refreshManifest = useCallback(async () => {
    try {
      const r = await fetch("/api/manifest");
      if (r.ok) setManifest(await r.json());
    } catch {
      /* noop */
    }
  }, []);

  const loadLogs = useCallback(async (taskId: string) => {
    setLogsLoading(true);
    try {
      const r = await fetch(`/api/tasks/${taskId}`);
      const j = await r.json();
      setLogs(j.logs || []);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTasks();
    refreshManifest();
    timer.current = setInterval(() => {
      refreshTasks();
      refreshManifest();
    }, 10000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refreshTasks, refreshManifest]);

  const selectTask = (id: string) => {
    setSelected(id);
    setLogs([]);
    loadLogs(id);
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr("");
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "search failed");
      setHits(j.hits);
    } catch (e) {
      setSearchErr(String(e));
      setHits(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* header */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 border border-emerald-600/40 font-bold text-emerald-300 text-lg">
              M
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">MemO</h1>
              <p className="text-xs text-zinc-400 leading-tight">Agent Task Ledger · Vector Audit Memory</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`absolute inline-flex h-full w-full rounded-full ${health?.ok ? "animate-ping bg-emerald-400 opacity-60" : "bg-red-400 opacity-60"}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${health?.ok ? "bg-emerald-400" : "bg-red-400"}`} />
            </span>
            {health?.ok ? "live on Atlas" : "connecting…"}
          </div>
          <div className="ml-auto flex gap-4 text-xs">
            <Stat label="tasks" value={health?.tasks} />
            <Stat label="logs" value={health?.logs} />
            <Stat label="vectors" value={health?.vectors} />
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-4 sm:px-6 flex gap-1" aria-label="Sections">
          {(
            [
              ["ledger", "Ledger"],
              ["search", "Semantic Search"],
              ["manifest", "Manifest"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === k ? "border-emerald-400 text-emerald-300" : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto py-2.5 text-[11px] text-zinc-500">{lastSync && `synced ${fmt(lastSync).slice(11)}`}</span>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-6">
        {tab === "ledger" && (
          <section aria-label="Task ledger">
            <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
              {/* task list */}
              <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1 memo-scroll">
                {tasks.length === 0 && <EmptyCard text="No tasks yet — the ledger is empty." />}
                {tasks.map((t) => (
                  <button
                    key={t._id}
                    onClick={() => selectTask(t._id)}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      selected === t._id
                        ? "border-emerald-600/50 bg-emerald-500/5"
                        : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-zinc-400">{t._id}</span>
                      <Chip label={t.status} className={statusColor[t.status]} />
                    </div>
                    <p className="mt-1.5 text-sm font-semibold leading-snug">{t.title}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">updated {fmt(t.updated_at)}</p>
                  </button>
                ))}
              </div>

              {/* timeline */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6 min-h-[40vh]">
                {!selected && <EmptyCard text="Select a task to open its full audit timeline." />}
                {selected && (
                  <>
                    {(() => {
                      const t = tasks.find((x) => x._id === selected);
                      return t ? (
                        <div className="mb-5">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="font-mono text-xs text-zinc-400">{t._id}</span>
                            <Chip label={t.status} className={statusColor[t.status]} />
                          </div>
                          <h2 className="mt-1.5 text-lg font-bold">{t.title}</h2>
                          {t.description && <p className="mt-1 text-sm text-zinc-400">{t.description}</p>}
                        </div>
                      ) : null;
                    })()}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Audit timeline — {logs.length} {logs.length === 1 ? "entry" : "entries"}
                      </h3>
                      <button
                        onClick={() => loadLogs(selected)}
                        className="text-xs text-emerald-300 hover:text-emerald-200 border border-emerald-700/40 rounded-lg px-2.5 py-1"
                      >
                        refresh ↻
                      </button>
                    </div>
                    {logsLoading && <p className="text-sm text-zinc-500">loading…</p>}
                    <ol className="relative border-l border-zinc-800 ml-3 space-y-5">
                      {logs.map((l) => (
                        <li key={l._id} className="ml-4">
                          <span className="absolute -left-[5px] mt-2 h-2.5 w-2.5 rounded-full bg-zinc-600" />
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip label={l.phase} className={phaseColor[l.phase]} />
                            <time className="font-mono text-[11px] text-zinc-500">{fmt(l.timestamp)}</time>
                            <span className="font-mono text-[10px] text-zinc-600">{l._id.slice(0, 8)}</span>
                          </div>
                          <p className="mt-1.5 text-sm italic text-zinc-300">{l.agent_reasoning || "—"}</p>
                          {l.action_payload && (
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300 font-mono">
                              {l.action_payload}
                            </pre>
                          )}
                          {l.execution_result && (
                            <details className="group mt-2">
                              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 select-none">
                                execution result ▾
                              </summary>
                              <pre className="mt-1.5 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400 font-mono memo-scroll">
                                {l.execution_result}
                              </pre>
                            </details>
                          )}
                        </li>
                      ))}
                      {!logsLoading && logs.length === 0 && selected && <EmptyCard text="No log entries yet for this task." />}
                    </ol>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "search" && (
          <section aria-label="Semantic audit search" className="max-w-3xl mx-auto">
            <p className="text-sm text-zinc-400 mb-4">
              Ask the ledger anything — every logged step is embedded and searchable, months later.
            </p>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="e.g. exact bash command when the deploy crashed…"
                aria-label="Semantic query"
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-emerald-600 placeholder:text-zinc-600"
              />
              <button
                onClick={runSearch}
                disabled={searching}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
              >
                {searching ? "searching…" : "search"}
              </button>
            </div>
            {searchErr && <p className="mt-3 text-sm text-red-400">{searchErr}</p>}
            <div className="mt-5 space-y-4">
              {hits?.length === 0 && <EmptyCard text="No matches — try different wording." />}
              {hits?.map((h, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono text-emerald-300">score {h.score.toFixed(4)}</span>
                    <Chip label={h.phase} className={phaseColor[h.phase]} />
                    <span className="font-mono text-xs text-zinc-400">{h.task_id}</span>
                    <time className="font-mono text-[11px] text-zinc-500">{fmt(h.timestamp)}</time>
                  </div>
                  {h.log ? (
                    <>
                      <p className="mt-2 text-sm italic text-zinc-300">{h.log.agent_reasoning}</p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300 font-mono">
                        {h.log.action_payload}
                      </pre>
                      {h.log.execution_result && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">execution result ▾</summary>
                          <pre className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400 font-mono memo-scroll">
                            {h.log.execution_result}
                          </pre>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500">log body unavailable</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "manifest" && (
          <section aria-label="Agent manifest" className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">agent_todo.json</h3>
                {manifest && (
                  <Chip
                    label={manifest.r2_mirrored ? "mirrored to object storage" : "local only"}
                    className={manifest.r2_mirrored ? statusColor.COMPLETED : statusColor.PENDING}
                  />
                )}
              </div>
              {manifest ? (
                <pre className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300 font-mono memo-scroll">
                  {JSON.stringify(manifest.agent_todo, null, 2)}
                </pre>
              ) : (
                <EmptyCard text="Manifest appears after the first state change." />
              )}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">.agent_status.md</h3>
              {manifest ? (
                <pre className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300 font-mono memo-scroll">
                  {manifest.agent_status_md}
                </pre>
              ) : (
                <EmptyCard text="No manifest yet." />
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="mt-auto border-t border-zinc-800 bg-zinc-900/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>
            MemO v1 · append-only ledger · <span className="text-zinc-400">no update/delete path exists for execution_logs</span>
          </span>
          <span className="ml-auto">MongoDB Atlas · Atlas Vector Search · 384-d</span>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- small parts ---------------- */

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold leading-none text-zinc-100">{value ?? "–"}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
      {text}
    </div>
  );
}
