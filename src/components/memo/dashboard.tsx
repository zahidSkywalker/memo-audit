"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const PHASES: Phase[] = ["PLANNING", "TOOL_CALL", "VERIFICATION", "SYSTEM_HANDOFF"];

const statusColor: Record<Status, string> = {
  PENDING: "bg-zinc-700/50 text-zinc-300 border-zinc-600/60",
  IN_PROGRESS: "bg-amber-500/15 text-amber-300 border-amber-600/40",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-600/40",
  FAILED: "bg-red-500/15 text-red-300 border-red-600/40",
};

const phaseColor: Record<Phase, string> = {
  PLANNING: "bg-violet-500/15 text-violet-300 border-violet-600/40",
  TOOL_CALL: "bg-amber-500/15 text-amber-300 border-amber-600/40",
  VERIFICATION: "bg-emerald-500/15 text-emerald-300 border-emerald-600/40",
  SYSTEM_HANDOFF: "bg-cyan-500/15 text-cyan-300 border-cyan-600/40",
};

const phaseDot: Record<Phase, string> = {
  PLANNING: "bg-violet-400",
  TOOL_CALL: "bg-amber-400",
  VERIFICATION: "bg-emerald-400",
  SYSTEM_HANDOFF: "bg-cyan-400",
};

const filterTabs: Array<{ k: "ALL" | Status; label: string }> = [
  { k: "ALL", label: "All" },
  { k: "IN_PROGRESS", label: "In progress" },
  { k: "COMPLETED", label: "Done" },
  { k: "FAILED", label: "Failed" },
  { k: "PENDING", label: "Pending" },
];

function Chip({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${className}`}>
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
  const [logs, setLogs] = useState<Log[]>([]);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, t, l] = await Promise.all([
        fetch("/api/health").then((r) => r.json()),
        fetch("/api/tasks").then((r) => r.json()),
        fetch("/api/logs").then((r) => r.json()),
      ]);
      setHealth(h);
      setTasks(t.tasks || []);
      setLogs(l.logs || []);
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

  useEffect(() => {
    refresh();
    refreshManifest();
    timer.current = setInterval(() => {
      refresh();
      refreshManifest();
    }, 10000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh, refreshManifest]);

  /* auto-open the newest task on first load so the ledger never looks dead */
  useEffect(() => {
    if (!bootstrapped && tasks.length > 0) {
      setExpanded(new Set([tasks[0]._id]));
      setBootstrapped(true);
    }
  }, [tasks, bootstrapped]);

  const logsByTask = useMemo(() => {
    const m = new Map<string, Log[]>();
    for (const l of logs) {
      const arr = m.get(l.task_id) ?? [];
      arr.push(l);
      m.set(l.task_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    return m;
  }, [logs]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const jumpToTask = (taskId: string) => {
    setFilter("ALL");
    setTab("ledger");
    setExpanded((prev) => new Set(prev).add(taskId));
    setTimeout(() => {
      document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
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

  const filtered = filter === "ALL" ? tasks : tasks.filter((t) => t.status === filter);
  const counts = useMemo(() => {
    const c = { TOTAL: tasks.length, COMPLETED: 0, IN_PROGRESS: 0, FAILED: 0, PENDING: 0 } as Record<string, number>;
    for (const t of tasks) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [tasks]);

  return (
    <div className="memo-dotgrid min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3.5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-zinc-950 font-black text-base shadow-lg shadow-emerald-500/20">
              M
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-black tracking-tight">
                MEMO<span className="font-mono text-emerald-400/80 text-sm">//</span>
                <span className="font-mono text-sm text-zinc-400">audit-ledger</span>
              </h1>
              <p className="text-[10px] text-zinc-500">Diana&rsquo;s every step · append-only · vectorized</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
            <span className="relative flex h-2 w-2">
              {health?.ok && <span className="absolute inline-flex h-full w-full rounded-full animate-ping bg-emerald-400 opacity-60" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${health?.ok ? "bg-emerald-400" : "bg-red-400"}`} />
            </span>
            {health?.ok ? "LIVE" : "OFFLINE"}
          </div>
          <div className="ml-auto flex items-center gap-4 font-mono text-[11px] text-zinc-500">
            <span><b className="text-zinc-200">{health?.tasks ?? "–"}</b> tasks</span>
            <span className="text-zinc-700">·</span>
            <span><b className="text-zinc-200">{health?.logs ?? "–"}</b> logs</span>
            <span className="text-zinc-700">·</span>
            <span><b className="text-zinc-200">{health?.vectors ?? "–"}</b> vectors</span>
            {lastSync && <span className="hidden sm:inline text-zinc-600">sync {fmt(lastSync).slice(11, 19)}</span>}
          </div>
        </div>
      </header>

      {/* stat tiles */}
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(
            [
              ["total tasks", counts.TOTAL, "text-zinc-100"],
              ["in progress", counts.IN_PROGRESS, "text-amber-300"],
              ["completed", counts.COMPLETED, "text-emerald-300"],
              ["failed", counts.FAILED, "text-red-300"],
            ] as Array<[string, number, string]>
          ).map(([label, val, cls]) => (
            <div key={label} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
              <div className={`text-2xl font-black leading-none ${cls}`}>{val}</div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <nav className="mt-5 flex items-center gap-2" aria-label="Sections">
          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
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
                className={`px-3.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === k ? "bg-emerald-500/15 text-emerald-300 border border-emerald-700/40" : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 py-5">
        {tab === "ledger" && (
          <section aria-label="Task ledger">
            {/* status filters */}
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              {filterTabs.map(({ k, label }) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                    filter === k
                      ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  {label}
                  <span className="ml-1.5 font-mono text-[10px] text-zinc-500">
                    {k === "ALL" ? counts.TOTAL : counts[k] ?? 0}
                  </span>
                </button>
              ))}
              <span className="ml-auto text-[10px] text-zinc-600 hidden sm:inline">tap a card to drop down its full work history</span>
            </div>

            {/* task accordion cards */}
            <div className="space-y-3">
              {filtered.length === 0 && <EmptyCard text="No tasks match this filter." />}
              {filtered.map((t) => {
                const isOpen = expanded.has(t._id);
                const tl = logsByTask.get(t._id) ?? [];
                const phaseCounts: Record<Phase, number> = { PLANNING: 0, TOOL_CALL: 0, VERIFICATION: 0, SYSTEM_HANDOFF: 0 };
                for (const l of tl) phaseCounts[l.phase]++;
                return (
                  <article
                    key={t._id}
                    id={`task-${t._id}`}
                    className={`rounded-2xl border bg-zinc-900/50 overflow-hidden transition-colors scroll-mt-24 ${
                      isOpen ? "border-emerald-700/40 memo-glow" : "border-zinc-800/80 hover:border-zinc-700"
                    }`}
                  >
                    {/* card header = the tap target */}
                    <button
                      onClick={() => toggle(t._id)}
                      aria-expanded={isOpen}
                      className="w-full text-left px-4 sm:px-5 py-4 flex items-start gap-3 hover:bg-zinc-800/25 transition-colors"
                    >
                      <span
                        className={`mt-1 inline-block text-[10px] text-emerald-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden
                      >
                        ▼
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-zinc-500">{t._id}</span>
                          <Chip label={t.status} className={statusColor[t.status]} />
                          <span className="ml-auto font-mono text-[10px] text-zinc-500">
                            {tl.length} {tl.length === 1 ? "step" : "steps"}
                          </span>
                        </span>
                        <span className="block mt-1 text-sm font-semibold leading-snug text-zinc-100">{t.title}</span>
                        <span className="block mt-0.5 text-[11px] text-zinc-500">updated {fmt(t.updated_at)}</span>
                      </span>
                    </button>

                    {/* dropdown body */}
                    <div className={`memo-acc ${isOpen ? "memo-acc-open" : ""}`}>
                      <div>
                        <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-zinc-800/70">
                          {t.description && <p className="mt-3 text-xs leading-relaxed text-zinc-400">{t.description}</p>}

                          {/* phase summary */}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {PHASES.filter((p) => phaseCounts[p] > 0).map((p) => (
                              <span key={p} className={`rounded-md border px-2 py-0.5 font-mono text-[10px] ${phaseColor[p]}`}>
                                {phaseCounts[p]}× {p}
                              </span>
                            ))}
                            {tl.length === 0 && <span className="text-[11px] text-zinc-500">no entries yet</span>}
                          </div>

                          {/* timeline */}
                          <ol className="mt-4 ml-1 space-y-4 border-l border-zinc-800">
                            {tl.map((l) => (
                              <li key={l._id} className="relative ml-4 pl-3">
                                <span className={`absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-zinc-900 ${phaseDot[l.phase]}`} />
                                <div className="flex flex-wrap items-center gap-2">
                                  <Chip label={l.phase} className={phaseColor[l.phase]} />
                                  <time className="font-mono text-[10px] text-zinc-500">{fmt(l.timestamp)}</time>
                                  <span className="font-mono text-[10px] text-zinc-600">#{l._id.slice(0, 8)}</span>
                                </div>
                                {l.agent_reasoning && <p className="mt-1.5 text-[13px] italic leading-relaxed text-zinc-300">{l.agent_reasoning}</p>}
                                {l.action_payload && (
                                  <pre className="memo-scroll mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                                    {l.action_payload}
                                  </pre>
                                )}
                                {l.execution_result && (
                                  <details className="memo-result mt-2">
                                    <summary className="text-[11px] text-zinc-500 hover:text-zinc-300">
                                      <span className="memo-caret mr-1 text-emerald-400">▶</span>execution result
                                    </summary>
                                    <pre className="memo-scroll mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
                                      {l.execution_result}
                                    </pre>
                                  </details>
                                )}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
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
                    <span className="font-mono text-xs text-emerald-300">{h.score.toFixed(4)}</span>
                    <div className="h-1 w-24 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                        style={{ width: `${Math.max(4, Math.min(100, h.score * 100))}%` }}
                      />
                    </div>
                    <Chip label={h.phase} className={phaseColor[h.phase]} />
                    <span className="font-mono text-xs text-zinc-400">{h.task_id}</span>
                    <button
                      onClick={() => jumpToTask(h.task_id)}
                      className="ml-auto rounded-lg border border-emerald-700/40 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                    >
                      open in ledger →
                    </button>
                  </div>
                  {h.log ? (
                    <>
                      {h.log.agent_reasoning && <p className="mt-2 text-sm italic text-zinc-300">{h.log.agent_reasoning}</p>}
                      {h.log.action_payload && (
                        <pre className="memo-scroll mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                          {h.log.action_payload}
                        </pre>
                      )}
                      {h.log.execution_result && (
                        <details className="memo-result mt-2">
                          <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
                            <span className="memo-caret mr-1 text-emerald-400">▶</span>execution result
                          </summary>
                          <pre className="memo-scroll mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
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
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-mono text-xs uppercase tracking-wider text-zinc-500">agent_todo.json</h3>
                {manifest && (
                  <Chip
                    label={manifest.r2_mirrored ? "mirrored to object storage" : "local only"}
                    className={manifest.r2_mirrored ? statusColor.COMPLETED : statusColor.PENDING}
                  />
                )}
              </div>
              {manifest ? (
                <pre className="memo-scroll max-h-[62vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                  {JSON.stringify(manifest.agent_todo, null, 2)}
                </pre>
              ) : (
                <EmptyCard text="Manifest appears after the first state change." />
              )}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-zinc-500">.agent_status.md</h3>
              {manifest ? (
                <pre className="memo-scroll max-h-[62vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                  {manifest.agent_status_md}
                </pre>
              ) : (
                <EmptyCard text="No manifest yet." />
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950/80">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span>
            MemO v2 · <span className="text-zinc-400">append-only ledger</span> · no update/delete path exists for execution_logs
          </span>
          <span className="ml-auto font-mono">MongoDB Atlas · Vector Search · 384-d cosine</span>
        </div>
      </footer>
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
