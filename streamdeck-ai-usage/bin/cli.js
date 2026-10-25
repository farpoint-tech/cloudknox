import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// src/format.ts
var pad = (n) => String(n).padStart(2, "0");
function localDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfToday(now = /* @__PURE__ */ new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function startOfWeek(now = /* @__PURE__ */ new Date()) {
  const d = startOfToday(now);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d;
}
function startOfMonth(now = /* @__PURE__ */ new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function isoWeek(now = /* @__PURE__ */ new Date()) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}
function lastSundaySlot(now = /* @__PURE__ */ new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 7);
  return d;
}
var comma = (s) => s.replace(".", ",");
function fmtTokens(n) {
  if (n < 1e3) return String(Math.round(n));
  if (n < 1e6) return comma((n / 1e3).toFixed(n < 1e4 ? 1 : 0)) + "k";
  if (n < 1e9) return comma((n / 1e6).toFixed(n < 1e7 ? 1 : 0)) + "M";
  return comma((n / 1e9).toFixed(1)) + "G";
}
function fmtUsd(n) {
  return "$ " + comma(n.toFixed(2));
}
function span(ms) {
  const m = Math.max(0, Math.round(ms / 6e4));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${pad(m % 60)}`;
  return `${Math.floor(h / 24)}d${h % 24}h`;
}
function fmtCountdown(resetIso, now = Date.now()) {
  const t = Date.parse(resetIso);
  if (!Number.isFinite(t)) return "";
  return "\u21BB " + span(t - now);
}
function fmtAge(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const m = Math.round((now - t) / 6e4);
  if (m < 1) return "jetzt";
  if (m < 60) return `vor ${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `vor ${h}h`;
  return `vor ${Math.round(h / 24)}d`;
}
function fmtWait(ms) {
  const m = Math.max(1, Math.ceil(ms / 6e4));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${pad(m % 60)}`;
}

// src/cost.ts
var COST_SOURCE = { claude: true, codex: true, copilot: true, gemini: false, grok: false };
var SYMBOL = { EUR: "\u20AC", USD: "$", GBP: "\xA3" };
function fmtNum(n) {
  const whole = Math.abs(n) >= 100 || Math.abs(n - Math.round(n)) < 5e-3;
  const s = whole ? String(Math.round(Math.abs(n))) : Math.abs(n).toFixed(2);
  const [int, dec] = s.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-" : "") + grouped + (dec ? "," + dec : "");
}
function currencySymbol(currency) {
  if (!currency) return "";
  return SYMBOL[currency.toUpperCase()] ?? currency.toUpperCase();
}
function costAmount(c) {
  if (c.unlimited && c.limit === void 0) return "\u221E";
  const sym = currencySymbol(c.currency);
  const used = c.used === void 0 ? "?" : fmtNum(c.used);
  const body = c.limit === void 0 ? used : `${used} / ${fmtNum(c.limit)}`;
  return sym ? `${body} ${sym}` : body;
}
function costCli(c, now = Date.now()) {
  const parts = [`${c.label} ${costAmount(c)}`];
  const flags = [c.state, c.note].filter(Boolean);
  if (flags.length) parts.push(`(${flags.join(", ")})`);
  else if (c.pct !== void 0) parts.push(`${Math.round(c.pct)}%`);
  if (c.resetAt) parts.push(fmtCountdown(c.resetAt, now));
  return parts.join(" ");
}

// src/doctor.ts
import fs9 from "node:fs/promises";

// src/lines.ts
import fs from "node:fs/promises";
var CHUNK = 1 << 20;
var yieldLoop = () => new Promise((r) => setImmediate(r));
async function readNewLines(file, offset, onLine) {
  const fh = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(CHUNK);
    let carry = Buffer.alloc(0);
    let pos = offset;
    let consumed = offset;
    let count = 0;
    for (; ; ) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, pos);
      if (bytesRead === 0) break;
      pos += bytesRead;
      const data = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
      let start = 0;
      let nl;
      while ((nl = data.indexOf(10, start)) !== -1) {
        if (nl > start) onLine(data.toString("utf8", start, nl));
        consumed += nl - start + 1;
        start = nl + 1;
        if (++count % 2e3 === 0) await yieldLoop();
      }
      carry = Buffer.from(data.subarray(start));
      await yieldLoop();
    }
    return consumed;
  } finally {
    await fh.close();
  }
}
async function listFiles(dir, pred) {
  try {
    const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
    return entries.filter((e) => e.isFile() && pred(e.name)).map((e) => `${e.parentPath}/${e.name}`);
  } catch {
    return [];
  }
}

// src/keychain.ts
import { execFile } from "node:child_process";

// src/paths.ts
import os from "node:os";
import path from "node:path";
var HOME = process.env.AI_USAGE_DECK_USER_HOME ?? os.homedir();
var USER = os.userInfo().username;
var CONFIG_DIR = process.env.AI_USAGE_DECK_HOME ?? path.join(HOME, ".config", "ai-usage-deck");
var STATE_FILE = path.join(CONFIG_DIR, "state.json");
var HISTORY_FILE = path.join(CONFIG_DIR, "history.jsonl");
var LOCK_FILE = path.join(CONFIG_DIR, "reconcile.lock");
var CLAUDE_PROJECTS = path.join(HOME, ".claude", "projects");
var CLAUDE_CRED_FILE = path.join(HOME, ".claude", ".credentials.json");
var CODEX_SESSIONS = path.join(HOME, ".codex", "sessions");
var CODEX_AUTH = path.join(HOME, ".codex", "auth.json");
var COPILOT_DB = path.join(HOME, ".copilot", "data.db");
var GEMINI_TMP = path.join(HOME, ".gemini", "tmp");
var GEMINI_OAUTH = path.join(HOME, ".gemini", "oauth_creds.json");
var GROK_AUTH = path.join(HOME, ".grok", "auth.json");
var SQLITE_BIN = "/usr/bin/sqlite3";
var SECURITY_BIN = "/usr/bin/security";
var GH_CANDIDATES = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"];

// src/keychain.ts
var FORBIDDEN = /* @__PURE__ */ new Set(["github-copilot-app"]);
function readSecret(service) {
  if (FORBIDDEN.has(service)) {
    return Promise.resolve({ status: "error", detail: `service ${service} is blocked` });
  }
  return new Promise((resolve) => {
    execFile(
      SECURITY_BIN,
      ["find-generic-password", "-s", service, "-a", USER, "-w"],
      { timeout: 5e3, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          const code = err.code;
          if (code === 44) return resolve({ status: "missing" });
          if (err.killed) return resolve({ status: "error", detail: "keychain timeout" });
          return resolve({ status: "error", detail: `security exit ${String(code)}` });
        }
        const value = stdout.replace(/\n$/, "");
        resolve(value ? { status: "found", value } : { status: "missing" });
      }
    );
  });
}

// src/providers/claude.ts
import fs5 from "node:fs/promises";

// src/http.ts
async function getJson(url, headers, init = {}) {
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { "User-Agent": "ai-usage-deck/1.0", Accept: "application/json", ...headers },
      body: init.body,
      signal: AbortSignal.timeout(init.timeoutMs ?? 1e4)
    });
    const text = await res.text();
    if (!res.ok) return { kind: "http", status: res.status, body: text.slice(0, 300), retryAfter: res.headers.get("retry-after") ?? void 0 };
    try {
      return { kind: "ok", status: res.status, json: JSON.parse(text) };
    } catch {
      return { kind: "http", status: res.status, body: "invalid JSON" };
    }
  } catch (e) {
    return { kind: "offline", detail: e instanceof Error ? e.name + ": " + e.message : String(e) };
  }
}
function pick(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur === null || typeof cur !== "object") return void 0;
    cur = cur[k];
  }
  return cur;
}
function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return void 0;
}
function parseRetryAfter(v, now = Date.now()) {
  if (v === null || v === void 0) return void 0;
  const t = v.trim();
  if (t === "") return void 0;
  if (/^\d+$/.test(t)) return Number(t) * 1e3;
  const d = Date.parse(t);
  if (!Number.isFinite(d)) return void 0;
  return Math.max(0, d - now);
}

// src/providers/types.ts
var PROVIDER_IDS = ["claude", "codex", "copilot", "gemini", "grok"];
var META = {
  claude: { name: "CLAUDE", abbr: "CL", color: "#D97757" },
  codex: { name: "CODEX", abbr: "CX", color: "#10A37F" },
  copilot: { name: "COPILOT", abbr: "CP", color: "#8957E5" },
  gemini: { name: "GEMINI", abbr: "GE", color: "#4285F4" },
  grok: { name: "GROK", abbr: "GK", color: "#E5E5E5" }
};
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function monthLabel(monthStartIso) {
  const d = new Date(monthStartIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function subOnly(provider, sub) {
  return { provider, sub, status: sub.status };
}
function tokensOnly(provider, tokens) {
  return { provider, tokens, status: tokens.status };
}
function apiOnly(provider, api) {
  return { provider, api, status: api.status };
}
async function guard(fn2, onError) {
  try {
    return await fn2();
  } catch (e) {
    return onError(e instanceof Error ? e.message : String(e));
  }
}

// src/resets.ts
var DEFAULT_BLINK_WINDOW_HOURS = 24;
var BLINK_MIN_EVENTS = 2;
var SHOWN_EVENTS = 2;
var PROVIDER_DISPLAY = {
  claude: "Claude",
  codex: "Codex",
  copilot: "Copilot",
  gemini: "Gemini",
  grok: "Grok"
};
var WEEKDAY = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
var pad2 = (n) => String(n).padStart(2, "0");
function resetWindowName(seconds) {
  if (!seconds) return "?";
  if (seconds <= 24 * 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds <= 8 * 86400) return "Woche";
  return "Monat";
}
function isoOrUndefined(v) {
  if (typeof v !== "string" || !v) return void 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : void 0;
}
function windowFromLabel(label) {
  if (/^\d+h$/.test(label)) return label;
  if (label === "Wo") return "Woche";
  return "Monat";
}
function resetsOf(provider, sub) {
  if (!sub) return [];
  if (sub.resets) return sub.resets;
  const out = [];
  for (const w of [sub.primary, sub.secondary]) {
    const at = isoOrUndefined(w?.resetAt);
    if (!w || !at) continue;
    const window = windowFromLabel(w.label);
    if (out.some((e) => e.window === window && e.resetsAt === at)) continue;
    out.push({ provider, window, resetsAt: at, pct: w.pct });
  }
  return out;
}
function upcomingResets(events, now = Date.now()) {
  return events.filter((e) => {
    const t = Date.parse(e.resetsAt);
    return Number.isFinite(t) && t > now;
  }).sort(
    (a, b) => Date.parse(a.resetsAt) - Date.parse(b.resetsAt) || PROVIDER_IDS.indexOf(a.provider) - PROVIDER_IDS.indexOf(b.provider) || a.window.localeCompare(b.window)
  );
}
function normalizeBlinkHours(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BLINK_WINDOW_HOURS;
  return Math.min(24 * 31, n);
}
function blinkInfo(events, now, windowHours) {
  const end = now + windowHours * 36e5;
  const inWindow = events.filter((e) => {
    const t = Date.parse(e.resetsAt);
    return t > now && t <= end;
  }).length;
  return { inWindow, blink: inWindow > BLINK_MIN_EVENTS };
}
function fmtResetCountdown(resetIso, now = Date.now()) {
  const t = Date.parse(resetIso);
  if (!Number.isFinite(t)) return "";
  const min = Math.floor((t - now) / 6e4);
  if (min < 1) return "in <1m";
  if (min < 60) return `in ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `in ${h}h ${min % 60}m`;
  return `in ${Math.floor(h / 24)}d ${h % 24}h`;
}
function fmtResetFull(resetIso) {
  const d = new Date(resetIso);
  return `${WEEKDAY[d.getDay()]} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}. ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// src/store.ts
import fs2 from "node:fs/promises";
import path2 from "node:path";
function emptyState() {
  return {
    version: 1,
    files: {},
    buckets: {},
    claudeSeen: {},
    geminiSeen: {},
    copilotSessions: {},
    initialized: {},
    lastSub: {},
    subGate: {}
  };
}
async function loadState() {
  try {
    const raw = JSON.parse(await fs2.readFile(STATE_FILE, "utf8"));
    return { ...emptyState(), ...raw, version: 1 };
  } catch {
    return emptyState();
  }
}
async function saveState(s) {
  await fs2.mkdir(CONFIG_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  await fs2.writeFile(tmp, JSON.stringify(s));
  await fs2.rename(tmp, STATE_FILE);
}
var chain = Promise.resolve();
function withState(fn2) {
  const run2 = chain.then(async () => {
    const s = await loadState();
    const result = await fn2(s);
    await saveState(s);
    return result;
  });
  chain = run2.catch(() => void 0);
  return run2;
}
async function appendHistory(lines) {
  await fs2.mkdir(CONFIG_DIR, { recursive: true });
  await fs2.appendFile(HISTORY_FILE, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}
async function tryLock() {
  await fs2.mkdir(path2.dirname(LOCK_FILE), { recursive: true });
  try {
    const st = await fs2.stat(LOCK_FILE);
    if (Date.now() - st.mtimeMs > 10 * 6e4) await fs2.rm(LOCK_FILE, { force: true });
  } catch {
  }
  try {
    const fh = await fs2.open(LOCK_FILE, "wx");
    await fh.writeFile(String(process.pid));
    await fh.close();
    return () => fs2.rm(LOCK_FILE, { force: true });
  } catch {
    return void 0;
  }
}
function addBucket(s, provider, day, b) {
  const days = s.buckets[provider] ??= {};
  const cur = days[day] ??= { in: 0, out: 0, cached: 0 };
  cur.in += b.in;
  cur.out += b.out;
  cur.cached += b.cached;
}
function sumBuckets(s, provider, sinceDay) {
  const out = { in: 0, out: 0, cached: 0 };
  for (const [day, b] of Object.entries(s.buckets[provider] ?? {})) {
    if (day < sinceDay) continue;
    out.in += b.in;
    out.out += b.out;
    out.cached += b.cached;
  }
  return out;
}
function prune(s, keepDay) {
  for (const days of Object.values(s.buckets)) {
    for (const day of Object.keys(days ?? {})) if (day < keepDay) delete days[day];
  }
  for (const map of [s.claudeSeen, s.geminiSeen]) {
    for (const [k, day] of Object.entries(map)) if (day < keepDay) delete map[k];
  }
}

// src/collectors/scan.ts
import fs3 from "node:fs/promises";
var FIRST_RUN_DAYS = 7;
var RETENTION_DAYS = 35;
function cutoffDay(s, provider, now = /* @__PURE__ */ new Date()) {
  const days = s.initialized[provider] ? RETENTION_DAYS : FIRST_RUN_DAYS;
  return localDay(new Date(now.getTime() - days * 864e5));
}
async function scanFiles(s, provider, files, onLine) {
  const firstRun = !s.initialized[provider];
  const firstCutoffMs = Date.now() - FIRST_RUN_DAYS * 864e5;
  let read = 0;
  let skipped = 0;
  for (const file of files) {
    let st;
    try {
      st = await fs3.stat(file);
    } catch {
      continue;
    }
    let fsState = s.files[file];
    if (!fsState) {
      if (firstRun && st.mtimeMs < firstCutoffMs) {
        s.files[file] = { offset: st.size, size: st.size, mtimeMs: st.mtimeMs };
        skipped++;
        continue;
      }
      fsState = s.files[file] = { offset: 0, size: 0, mtimeMs: 0 };
    }
    if (st.size === fsState.size && st.mtimeMs === fsState.mtimeMs) continue;
    if (st.size < fsState.offset) {
      fsState.offset = 0;
      delete fsState.extra;
    }
    try {
      fsState.offset = await readNewLines(file, fsState.offset, (line) => onLine(line, fsState));
    } catch {
      continue;
    }
    fsState.size = st.size;
    fsState.mtimeMs = st.mtimeMs;
    read++;
  }
  return { read, skipped };
}
function forgetMissing(s, prefix, existing) {
  const set = new Set(existing);
  for (const f of Object.keys(s.files)) if (f.startsWith(prefix) && !set.has(f)) delete s.files[f];
}

// src/collectors/claude-jsonl.ts
function parseClaudeLine(line) {
  if (!line.includes('"usage"')) return null;
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  const u = o?.message?.usage;
  if (!u || typeof u !== "object" || typeof o.timestamp !== "string") return null;
  const t = new Date(o.timestamp);
  if (Number.isNaN(t.getTime())) return null;
  const id = o.message?.id ?? o.uuid ?? "";
  const req = o.requestId ?? "";
  const n = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
  return {
    key: `${id}:${req}`,
    day: localDay(t),
    in: n(u.input_tokens) + n(u.cache_creation_input_tokens),
    cached: n(u.cache_read_input_tokens),
    out: n(u.output_tokens)
  };
}
async function collectClaude(s) {
  const files = await listFiles(CLAUDE_PROJECTS, (n) => n.endsWith(".jsonl"));
  const minDay = cutoffDay(s, "claude");
  await scanFiles(s, "claude", files, (line) => {
    const p = parseClaudeLine(line);
    if (!p || p.day < minDay) return;
    if (s.claudeSeen[p.key]) return;
    s.claudeSeen[p.key] = p.day;
    addBucket(s, "claude", p.day, p);
  });
  forgetMissing(s, CLAUDE_PROJECTS, files);
  s.initialized.claude ??= (/* @__PURE__ */ new Date()).toISOString();
}

// src/collectors/codex-jsonl.ts
function parseCodexLine(line) {
  if (!line.includes('"token_count"')) return null;
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  const p = o?.payload;
  const t = p?.type === "token_count" ? p?.info?.total_token_usage : void 0;
  if (!t || typeof o.timestamp !== "string") return null;
  const d = new Date(o.timestamp);
  if (Number.isNaN(d.getTime())) return null;
  const n = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
  return { day: localDay(d), total: { input: n(t.input_tokens), cached: n(t.cached_input_tokens), output: n(t.output_tokens) } };
}
function codexDelta(prev, cur) {
  const reset = !prev || cur.input < prev.input || cur.output < prev.output || cur.cached < prev.cached;
  const base = reset ? { input: 0, cached: 0, output: 0 } : prev;
  const dIn = cur.input - base.input;
  const dCached = cur.cached - base.cached;
  return { in: Math.max(0, dIn - dCached), cached: Math.max(0, dCached), out: Math.max(0, cur.output - base.output) };
}
async function collectCodex(s) {
  const files = await listFiles(CODEX_SESSIONS, (n) => n.endsWith(".jsonl"));
  const minDay = cutoffDay(s, "codex");
  await scanFiles(s, "codex", files, (line, fsState) => {
    const p = parseCodexLine(line);
    if (!p) return;
    const prev = fsState.extra ? { input: fsState.extra.i ?? 0, cached: fsState.extra.c ?? 0, output: fsState.extra.o ?? 0 } : void 0;
    const delta = codexDelta(prev, p.total);
    fsState.extra = { i: p.total.input, c: p.total.cached, o: p.total.output };
    if (p.day >= minDay) addBucket(s, "codex", p.day, delta);
  });
  forgetMissing(s, CODEX_SESSIONS, files);
  s.initialized.codex ??= (/* @__PURE__ */ new Date()).toISOString();
}

// src/collectors/copilot-sqlite.ts
import { execFile as execFile2 } from "node:child_process";
import fs4 from "node:fs/promises";
function sqliteJson(db, sql) {
  return new Promise((resolve, reject) => {
    execFile2(SQLITE_BIN, ["-readonly", "-json", db, sql], { timeout: 1e4, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`sqlite3: ${err.message.split("\n")[0]}`));
      const text = stdout.trim();
      resolve(text ? JSON.parse(text) : []);
    });
  });
}
function copilotDelta(prev, row) {
  const p = prev ?? { in: 0, out: 0, cached: 0 };
  const reset = row.i < p.in || row.o < p.out || row.c < p.cached;
  const base = reset ? { in: 0, out: 0, cached: 0 } : p;
  const dIn = row.i - base.in;
  const dCached = row.c - base.cached;
  return { in: Math.max(0, dIn - dCached), cached: Math.max(0, dCached), out: Math.max(0, row.o - base.out) };
}
async function collectCopilot(s) {
  try {
    await fs4.access(COPILOT_DB);
  } catch {
    return false;
  }
  const minDay = cutoffDay(s, "copilot");
  const firstRun = !s.initialized.copilot;
  const sinceIso = new Date(Date.now() - 35 * 864e5).toISOString();
  const rows = await sqliteJson(
    COPILOT_DB,
    `SELECT id, total_input_tokens AS i, total_output_tokens AS o, total_cached_tokens AS c, updated_at AS u FROM sessions WHERE updated_at >= '${sinceIso}'`
  );
  for (const row of rows) {
    const prev = s.copilotSessions[row.id];
    const delta = copilotDelta(prev, row);
    s.copilotSessions[row.id] = { in: row.i, out: row.o, cached: row.c };
    const d = new Date(row.u);
    if (Number.isNaN(d.getTime())) continue;
    const day = localDay(d);
    if (day < minDay && (firstRun || !prev)) continue;
    addBucket(s, "copilot", day < minDay ? localDay(/* @__PURE__ */ new Date()) : day, delta);
  }
  s.initialized.copilot ??= (/* @__PURE__ */ new Date()).toISOString();
  return true;
}

// src/collectors/gemini-jsonl.ts
function parseGeminiLine(line) {
  if (!line.includes('"tokens"')) return null;
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  const t = o?.tokens;
  if (o?.type !== "gemini" || !t || typeof t !== "object" || typeof o.id !== "string") return null;
  const d = new Date(o.timestamp);
  if (Number.isNaN(d.getTime())) return null;
  const n = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
  const cached = n(t.cached);
  return { id: o.id, day: localDay(d), in: Math.max(0, n(t.input) - cached), cached, out: n(t.output) + n(t.thoughts) };
}
async function collectGemini(s) {
  const files = await listFiles(GEMINI_TMP, (n) => n.startsWith("session-") && n.endsWith(".jsonl"));
  const minDay = cutoffDay(s, "gemini");
  await scanFiles(s, "gemini", files, (line) => {
    const p = parseGeminiLine(line);
    if (!p) return;
    s.geminiHasUsage = true;
    if (p.day < minDay || s.geminiSeen[p.id]) return;
    s.geminiSeen[p.id] = p.day;
    addBucket(s, "gemini", p.day, p);
  });
  forgetMissing(s, GEMINI_TMP, files);
  s.initialized.gemini ??= (/* @__PURE__ */ new Date()).toISOString();
}

// src/collectors/index.ts
var lastRun = /* @__PURE__ */ new Map();
var lastAvail = /* @__PURE__ */ new Map();
var MIN_GAP_MS = 1e4;
async function collectAndSum(provider, sinceIso) {
  return withState(async (s) => {
    let available = true;
    let detail;
    const fresh = Date.now() - (lastRun.get(provider) ?? 0) < MIN_GAP_MS;
    if (!fresh) {
      switch (provider) {
        case "claude":
          await collectClaude(s);
          break;
        case "codex":
          await collectCodex(s);
          break;
        case "copilot":
          available = await collectCopilot(s);
          if (!available) detail = "~/.copilot/data.db fehlt";
          break;
        case "gemini":
          await collectGemini(s);
          break;
        case "grok":
          available = false;
          detail = "keine lokalen Logs";
          break;
      }
      lastRun.set(provider, Date.now());
      lastAvail.set(provider, { available, detail });
      prune(s, localDay(new Date(Date.now() - RETENTION_DAYS * 864e5)));
      s.lastTokensRun = (/* @__PURE__ */ new Date()).toISOString();
    }
    if (fresh && lastAvail.has(provider)) ({ available, detail } = lastAvail.get(provider));
    if (provider === "gemini" && !s.geminiHasUsage) {
      available = false;
      detail = "keine Usage-Felder in Gemini-Logs";
    }
    if (provider === "grok") available = false;
    return { available, detail, ...sumBuckets(s, provider, localDay(new Date(sinceIso))) };
  });
}

// src/providers/common.ts
function httpStatus(r) {
  if (r.kind === "offline") return { status: "offline", detail: r.detail };
  if (r.status === 401 || r.status === 403) return { status: "login", detail: `HTTP ${r.status}`, httpCode: r.status };
  const out = { status: "error", detail: `HTTP ${r.status}`, httpCode: r.status };
  const ra = parseRetryAfter(r.retryAfter);
  if (ra !== void 0) out.retryAfterMs = ra;
  return out;
}
async function localTokensFor(provider, sinceIso) {
  try {
    const c = await collectAndSum(provider, sinceIso);
    return tokensOnly(provider, {
      status: c.available ? "ok" : "na",
      since: sinceIso,
      in: c.in,
      out: c.out,
      cached: c.cached,
      detail: c.detail,
      fetchedAt: nowIso()
    });
  } catch (e) {
    return tokensOnly(provider, {
      status: "error",
      since: sinceIso,
      in: 0,
      out: 0,
      cached: 0,
      detail: e instanceof Error ? e.message : String(e),
      fetchedAt: nowIso()
    });
  }
}
function windowLabel(seconds) {
  if (!seconds) return "";
  if (seconds <= 6 * 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds <= 8 * 86400) return "Wo";
  return "Mo";
}

// src/providers/claude.ts
var CLAUDE_KEYCHAIN = "Claude Code-credentials";
var ANTHROPIC_ADMIN = "anthropic-admin";
async function readClaudeCred() {
  let raw;
  const k = await readSecret(CLAUDE_KEYCHAIN);
  if (k.status === "found") raw = k.value;
  else {
    try {
      raw = await fs5.readFile(CLAUDE_CRED_FILE, "utf8");
    } catch {
      return { status: "missing", detail: k.status === "error" ? k.detail : "kein Keychain-Eintrag, keine Datei" };
    }
  }
  try {
    const o = JSON.parse(raw);
    const token = o?.claudeAiOauth?.accessToken;
    if (typeof token !== "string" || !token) return { status: "invalid", detail: "accessToken fehlt" };
    return { status: "found", token, expiresAt: num(o.claudeAiOauth.expiresAt), plan: o.claudeAiOauth.subscriptionType };
  } catch {
    return { status: "invalid", detail: "kein JSON" };
  }
}
function mapClaudeUsage(json) {
  const win = (key, label) => {
    const pct = num(pick(json, key, "utilization"));
    if (pct === void 0) return void 0;
    const r = pick(json, key, "resets_at");
    return { label, pct, resetAt: typeof r === "string" ? r : void 0 };
  };
  return { primary: win("five_hour", "5h"), secondary: win("seven_day", "Wo") };
}
function claudeResets(json) {
  const out = [];
  for (const [key, window] of [["five_hour", "5h"], ["seven_day", "Woche"]]) {
    const at = isoOrUndefined(pick(json, key, "resets_at"));
    if (at) out.push({ provider: "claude", window, resetsAt: at, pct: num(pick(json, key, "utilization")) });
  }
  const extra = pick(json, "extra_usage");
  const extraAt = isoOrUndefined(pick(extra, "resets_at") ?? pick(extra, "reset_at") ?? pick(extra, "next_reset_at") ?? pick(extra, "period_end"));
  if (extraAt) out.push({ provider: "claude", window: "Extra", resetsAt: extraAt, pct: num(pick(extra, "utilization")) });
  for (const b of claudeBudgets(json)) {
    if (b.resetAt) out.push({ provider: "claude", window: "Budget", resetsAt: b.resetAt, pct: b.pct });
  }
  return out;
}
function claudeBudgets(json) {
  const out = [];
  if (!json || typeof json !== "object") return out;
  for (const v of Object.values(json)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const limit = num(pick(v, "limit_dollars"));
    if (limit === void 0 || limit <= 0) continue;
    const used = num(pick(v, "used_dollars"));
    const remaining = num(pick(v, "remaining_dollars"));
    const pct = num(pick(v, "utilization")) ?? (used !== void 0 ? used / limit * 100 : void 0);
    const item = { label: "Budget", used, limit, currency: "USD", pct, resetAt: isoOrUndefined(pick(v, "resets_at")) };
    item.reached = used !== void 0 && used >= limit || remaining === 0;
    out.push(item);
  }
  return out;
}
function claudeCost(json) {
  const out = [];
  const extra = pick(json, "extra_usage");
  if (extra && typeof extra === "object") {
    const dp = num(pick(extra, "decimal_places")) ?? 0;
    const scale = (v) => {
      const n = num(v);
      return n === void 0 ? void 0 : n / 10 ** dp;
    };
    const enabled = pick(extra, "is_enabled") === true;
    const reached = pick(extra, "spend_limit_reached") === true;
    const currency = pick(extra, "currency");
    const item = {
      label: "Extra",
      used: scale(pick(extra, "used_credits")),
      limit: scale(pick(extra, "monthly_limit")),
      currency: typeof currency === "string" ? currency : void 0,
      pct: num(pick(extra, "utilization")),
      reached,
      resetAt: isoOrUndefined(pick(extra, "resets_at") ?? pick(extra, "reset_at") ?? pick(extra, "next_reset_at") ?? pick(extra, "period_end"))
    };
    if (reached) item.state = "Limit erreicht";
    else if (!enabled) item.state = "aus";
    const reason = pick(extra, "disabled_reason");
    if (!enabled && typeof reason === "string") item.note = reason;
    out.push(item);
  }
  out.push(...claudeBudgets(json));
  return out;
}
function sumAnthropicCost(json) {
  let cents = 0;
  const data = pick(json, "data");
  if (!Array.isArray(data)) return 0;
  for (const bucket of data) {
    const results = pick(bucket, "results");
    if (!Array.isArray(results)) continue;
    for (const r of results) cents += num(pick(r, "amount")) ?? 0;
  }
  return cents / 100;
}
var claude = {
  id: "claude",
  subscription: () => guard(async () => {
    const fetchedAt = nowIso();
    const cred = await readClaudeCred();
    if (cred.status !== "found") return subOnly("claude", { status: "login", detail: cred.detail, fetchedAt });
    if (cred.expiresAt && cred.expiresAt < Date.now()) {
      return subOnly("claude", { status: "login", detail: "Token abgelaufen \u2013 Claude Code \xF6ffnen", plan: cred.plan, fetchedAt });
    }
    const r = await getJson("https://api.anthropic.com/api/oauth/usage", {
      Authorization: `Bearer ${cred.token}`,
      "anthropic-beta": "oauth-2025-04-20"
    });
    if (r.kind !== "ok") {
      const h = httpStatus(r);
      return subOnly("claude", { ...h, detail: h.status === "login" ? "Claude Code \xF6ffnen" : h.detail, plan: cred.plan, fetchedAt });
    }
    const w = mapClaudeUsage(r.json);
    const sub = { status: w.primary ? "ok" : "error", ...w, plan: cred.plan, resets: claudeResets(r.json), cost: claudeCost(r.json), fetchedAt };
    if (!w.primary) sub.detail = "five_hour fehlt";
    return subOnly("claude", sub);
  }, (detail) => subOnly("claude", { status: "error", detail, fetchedAt: nowIso() })),
  localTokens: (sinceIso) => localTokensFor("claude", sinceIso),
  apiCost: (monthStartIso) => guard(async () => {
    const month = monthLabel(monthStartIso);
    const fetchedAt = nowIso();
    const key = await readSecret(ANTHROPIC_ADMIN);
    if (key.status === "missing") return apiOnly("claude", { status: "key_missing", month, fetchedAt });
    if (key.status === "error") return apiOnly("claude", { status: "error", month, detail: key.detail, fetchedAt });
    let usd = 0;
    let page;
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({
        starting_at: new Date(monthStartIso).toISOString(),
        ending_at: (/* @__PURE__ */ new Date()).toISOString(),
        bucket_width: "1d",
        limit: "31"
      });
      if (page) q.set("page", page);
      const r = await getJson(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, {
        "x-api-key": key.value,
        "anthropic-version": "2023-06-01"
      });
      if (r.kind !== "ok") return apiOnly("claude", { ...httpStatus(r), month, fetchedAt });
      usd += sumAnthropicCost(r.json);
      const next = pick(r.json, "next_page");
      if (pick(r.json, "has_more") !== true || typeof next !== "string") break;
      page = next;
    }
    return apiOnly("claude", { status: "ok", usd, month, fetchedAt });
  }, (detail) => apiOnly("claude", { status: "error", month: monthLabel(monthStartIso), detail, fetchedAt: nowIso() }))
};

// src/providers/codex.ts
import fs6 from "node:fs/promises";
var OPENAI_ADMIN = "openai-admin";
async function readCodexCred() {
  let raw;
  try {
    raw = await fs6.readFile(CODEX_AUTH, "utf8");
  } catch {
    return { status: "missing", detail: "~/.codex/auth.json fehlt" };
  }
  try {
    const o = JSON.parse(raw);
    const token = o?.tokens?.access_token;
    if (typeof token !== "string" || !token) return { status: "invalid", detail: "tokens.access_token fehlt" };
    return { status: "found", token, accountId: o.tokens.account_id };
  } catch {
    return { status: "invalid", detail: "kein JSON" };
  }
}
function toIso(v) {
  const n = num(v);
  if (n !== void 0) return new Date(n < 1e12 ? n * 1e3 : n).toISOString();
  return typeof v === "string" ? v : void 0;
}
function mapCodexUsage(json) {
  const win = (key) => {
    const w = pick(json, "rate_limit", key);
    const pct = num(pick(w, "used_percent"));
    if (!w || pct === void 0) return void 0;
    return { label: windowLabel(num(pick(w, "limit_window_seconds"))), pct, resetAt: toIso(pick(w, "reset_at")) };
  };
  const plan = pick(json, "plan_type");
  return { primary: win("primary_window"), secondary: win("secondary_window"), plan: typeof plan === "string" ? plan : void 0 };
}
function codexResets(json) {
  const out = [];
  for (const key of ["primary_window", "secondary_window"]) {
    const w = pick(json, "rate_limit", key);
    const at = w ? toIso(pick(w, "reset_at")) : void 0;
    if (!at || !Number.isFinite(Date.parse(at))) continue;
    out.push({ provider: "codex", window: resetWindowName(num(pick(w, "limit_window_seconds"))), resetsAt: new Date(at).toISOString(), pct: num(pick(w, "used_percent")) });
  }
  return out;
}
function codexCost(json) {
  const credits = pick(json, "credits");
  const spend = pick(json, "spend_control");
  if (!credits && !spend) return [];
  const unlimited = pick(credits, "unlimited") === true;
  const reached = pick(spend, "reached") === true || pick(credits, "overage_limit_reached") === true;
  const item = { label: "Credits", used: num(pick(credits, "balance")), limit: num(pick(spend, "individual_limit")), unlimited, reached };
  if (reached) item.state = "Limit erreicht";
  else if (unlimited) item.state = "unbegrenzt";
  const out = [item];
  const resetCredits = num(pick(json, "rate_limit_reset_credits", "available_count"));
  if (resetCredits !== void 0 && resetCredits > 0) out.push({ label: "Reset-Credits", used: resetCredits });
  return out;
}
function sumOpenAICost(json) {
  let usd = 0;
  const data = pick(json, "data");
  if (!Array.isArray(data)) return 0;
  for (const bucket of data) {
    const results = pick(bucket, "results");
    if (!Array.isArray(results)) continue;
    for (const r of results) usd += num(pick(r, "amount", "value")) ?? 0;
  }
  return usd;
}
var codex = {
  id: "codex",
  subscription: () => guard(async () => {
    const fetchedAt = nowIso();
    const cred = await readCodexCred();
    if (cred.status !== "found") return subOnly("codex", { status: "login", detail: cred.detail, fetchedAt });
    const headers = { Authorization: `Bearer ${cred.token}` };
    if (cred.accountId) headers["ChatGPT-Account-Id"] = cred.accountId;
    const r = await getJson("https://chatgpt.com/backend-api/wham/usage", headers);
    if (r.kind !== "ok") return subOnly("codex", { ...httpStatus(r), fetchedAt });
    const m = mapCodexUsage(r.json);
    if (!m.primary) return subOnly("codex", { status: "error", detail: "rate_limit fehlt", plan: m.plan, fetchedAt });
    if (m.secondary && m.secondary.pct > m.primary.pct) [m.primary, m.secondary] = [m.secondary, m.primary];
    return subOnly("codex", { status: "ok", ...m, resets: codexResets(r.json), cost: codexCost(r.json), fetchedAt });
  }, (detail) => subOnly("codex", { status: "error", detail, fetchedAt: nowIso() })),
  localTokens: (sinceIso) => localTokensFor("codex", sinceIso),
  apiCost: (monthStartIso) => guard(async () => {
    const month = monthLabel(monthStartIso);
    const fetchedAt = nowIso();
    const key = await readSecret(OPENAI_ADMIN);
    if (key.status === "missing") return apiOnly("codex", { status: "key_missing", month, fetchedAt });
    if (key.status === "error") return apiOnly("codex", { status: "error", month, detail: key.detail, fetchedAt });
    let usd = 0;
    let page;
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({
        start_time: String(Math.floor(new Date(monthStartIso).getTime() / 1e3)),
        bucket_width: "1d",
        limit: "31"
      });
      if (page) q.set("page", page);
      const r = await getJson(`https://api.openai.com/v1/organization/costs?${q}`, { Authorization: `Bearer ${key.value}` });
      if (r.kind !== "ok") return apiOnly("codex", { ...httpStatus(r), month, fetchedAt });
      usd += sumOpenAICost(r.json);
      const next = pick(r.json, "next_page");
      if (pick(r.json, "has_more") !== true || typeof next !== "string") break;
      page = next;
    }
    return apiOnly("codex", { status: "ok", usd, month, fetchedAt });
  }, (detail) => apiOnly("codex", { status: "error", month: monthLabel(monthStartIso), detail, fetchedAt: nowIso() }))
};

// src/providers/copilot.ts
import { execFile as execFile3 } from "node:child_process";
import fs7 from "node:fs";
var GITHUB_BILLING_PAT = "github-billing-pat";
function readGhToken() {
  const gh = GH_CANDIDATES.find((p) => fs7.existsSync(p));
  if (!gh) return Promise.resolve({ status: "missing", detail: "gh nicht installiert" });
  return new Promise((resolve) => {
    execFile3(gh, ["auth", "token", "-h", "github.com"], { timeout: 5e3 }, (err, stdout) => {
      const token = stdout.trim();
      if (err || !token) return resolve({ status: "invalid", detail: "gh auth refresh -h github.com" });
      resolve({ status: "found", token });
    });
  });
}
var COPILOT_HEADERS = {
  "Editor-Version": "vscode/1.99.0",
  "Editor-Plugin-Version": "copilot-chat/0.26.0",
  "Copilot-Integration-Id": "vscode-chat",
  "User-Agent": "GitHubCopilotChat/0.26.0"
};
function mapCopilotUser(json) {
  const plan = pick(json, "copilot_plan");
  const reset = pick(json, "quota_reset_date");
  const resetAt = typeof reset === "string" ? new Date(reset).toISOString() : void 0;
  const planStr = typeof plan === "string" ? plan : void 0;
  const win = (key, label) => {
    const q = pick(json, "quota_snapshots", key);
    if (!q) return void 0;
    if (pick(q, "unlimited") === true) return { label: `${label} \u221E`, pct: 0, resetAt };
    const entitlement = num(pick(q, "entitlement"));
    if (entitlement === 0) return void 0;
    const remaining = num(pick(q, "percent_remaining"));
    if (remaining === void 0) return void 0;
    return { label, pct: Math.min(100, Math.max(0, 100 - remaining)), resetAt };
  };
  const premium = win("premium_interactions", "Prem");
  const chat = win("chat", "Chat");
  const completions = win("completions", "Code");
  const ordered = [premium, chat, completions].filter((w) => !!w);
  return { primary: ordered[0], secondary: ordered[1], plan: planStr };
}
function copilotResets(json) {
  const at = isoOrUndefined(pick(json, "quota_reset_date"));
  if (!at) return [];
  return [{ provider: "copilot", window: "Monat", resetsAt: at, pct: mapCopilotUser(json).primary?.pct }];
}
function copilotCost(json) {
  const q = pick(json, "quota_snapshots", "premium_interactions");
  const count = num(pick(q, "overage_count"));
  if (!q || count === void 0) return [];
  const permitted = pick(q, "overage_permitted") === true;
  const item = { label: "Overage", used: count, reached: false };
  if (!permitted) item.state = "aus";
  return [item];
}
function sumCopilotBilling(json) {
  const items = pick(json, "usageItems");
  if (!Array.isArray(items)) return 0;
  return items.reduce((a, it) => a + (num(pick(it, "netAmount")) ?? 0), 0);
}
var copilot = {
  id: "copilot",
  subscription: () => guard(async () => {
    const fetchedAt = nowIso();
    const t = await readGhToken();
    if (t.status !== "found") return subOnly("copilot", { status: "login", detail: t.detail, fetchedAt });
    const r = await getJson("https://api.github.com/copilot_internal/user", { Authorization: `Bearer ${t.token}`, ...COPILOT_HEADERS });
    if (r.kind !== "ok") {
      const h = httpStatus(r);
      return subOnly("copilot", { ...h, detail: h.status === "login" ? "gh auth refresh -h github.com" : h.detail, fetchedAt });
    }
    const m = mapCopilotUser(r.json);
    if (!m.primary) return subOnly("copilot", { status: "error", detail: "quota_snapshots fehlt", plan: m.plan, fetchedAt });
    return subOnly("copilot", { status: "ok", ...m, resets: copilotResets(r.json), cost: copilotCost(r.json), fetchedAt });
  }, (detail) => subOnly("copilot", { status: "error", detail, fetchedAt: nowIso() })),
  localTokens: (sinceIso) => localTokensFor("copilot", sinceIso),
  apiCost: (monthStartIso) => guard(async () => {
    const month = monthLabel(monthStartIso);
    const fetchedAt = nowIso();
    const key = await readSecret(GITHUB_BILLING_PAT);
    if (key.status === "missing") return apiOnly("copilot", { status: "key_missing", month, fetchedAt });
    if (key.status === "error") return apiOnly("copilot", { status: "error", month, detail: key.detail, fetchedAt });
    const h = { Authorization: `Bearer ${key.value}`, "X-GitHub-Api-Version": "2026-03-10" };
    const me = await getJson("https://api.github.com/user", h);
    if (me.kind !== "ok") return apiOnly("copilot", { ...httpStatus(me), month, fetchedAt });
    const login = pick(me.json, "login");
    if (typeof login !== "string") return apiOnly("copilot", { status: "error", month, detail: "login fehlt", fetchedAt });
    const d = new Date(monthStartIso);
    const q = new URLSearchParams({ year: String(d.getFullYear()), month: String(d.getMonth() + 1) });
    const r = await getJson(`https://api.github.com/users/${encodeURIComponent(login)}/settings/billing/premium_request/usage?${q}`, h);
    if (r.kind !== "ok") return apiOnly("copilot", { ...httpStatus(r), month, fetchedAt });
    return apiOnly("copilot", { status: "ok", usd: sumCopilotBilling(r.json), month, fetchedAt });
  }, (detail) => apiOnly("copilot", { status: "error", month: monthLabel(monthStartIso), detail, fetchedAt: nowIso() }))
};

// src/providers/grok.ts
import fs8 from "node:fs/promises";
var XAI_MANAGEMENT = "xai-management";
var XAI_TEAM_ID = "xai-team-id";
async function readGrokCred() {
  let raw;
  try {
    raw = await fs8.readFile(GROK_AUTH, "utf8");
  } catch {
    return { status: "missing", detail: "~/.grok/auth.json fehlt (grok login)" };
  }
  try {
    const o = JSON.parse(raw);
    const token = o?.access_token ?? o?.accessToken ?? o?.tokens?.access_token ?? o?.id_token;
    if (typeof token !== "string" || !token) return { status: "invalid", detail: "kein access_token" };
    const exp = num(o?.expires_at ?? o?.expiresAt ?? o?.expiry);
    return { status: "found", token, expiresAt: exp === void 0 ? void 0 : exp < 1e12 ? exp * 1e3 : exp };
  } catch {
    return { status: "invalid", detail: "kein JSON" };
  }
}
function centsOf(v) {
  return num(v) ?? num(pick(v, "val"));
}
var grok = {
  id: "grok",
  subscription: () => guard(async () => {
    const fetchedAt = nowIso();
    const cred = await readGrokCred();
    if (cred.status !== "found") return subOnly("grok", { status: "login", detail: cred.detail, fetchedAt });
    if (cred.expiresAt && cred.expiresAt < Date.now()) return subOnly("grok", { status: "login", detail: "Token abgelaufen (grok login)", fetchedAt });
    const r = await getJson("https://cli-chat-proxy.grok.com/v1/billing?format=credits", { Authorization: `Bearer ${cred.token}` });
    if (r.kind !== "ok") return subOnly("grok", { ...httpStatus(r), fetchedAt });
    const pct = num(pick(r.json, "creditUsagePercent"));
    const end = pick(r.json, "currentPeriod", "end") ?? pick(r.json, "currentPeriod", "endTime");
    if (pct === void 0) return subOnly("grok", { status: "error", detail: "creditUsagePercent fehlt", fetchedAt });
    const resetAt = isoOrUndefined(end);
    return subOnly("grok", {
      status: "ok",
      primary: { label: "Mo", pct, resetAt },
      resets: resetAt ? [{ provider: "grok", window: "Monat", resetsAt: resetAt, pct }] : [],
      fetchedAt
    });
  }, (detail) => subOnly("grok", { status: "error", detail, fetchedAt: nowIso() })),
  localTokens: async (sinceIso) => tokensOnly("grok", { status: "na", since: sinceIso, in: 0, out: 0, cached: 0, detail: "keine lokalen Logs", fetchedAt: nowIso() }),
  apiCost: (monthStartIso) => guard(async () => {
    const month = monthLabel(monthStartIso);
    const fetchedAt = nowIso();
    const [key, team] = await Promise.all([readSecret(XAI_MANAGEMENT), readSecret(XAI_TEAM_ID)]);
    if (key.status === "missing" || team.status === "missing") return apiOnly("grok", { status: "key_missing", month, fetchedAt });
    if (key.status === "error" || team.status === "error") return apiOnly("grok", { status: "error", month, detail: "keychain", fetchedAt });
    const r = await getJson(
      `https://management-api.x.ai/v1/billing/teams/${encodeURIComponent(team.value)}/postpaid/invoice/preview`,
      { Authorization: `Bearer ${key.value}` }
    );
    if (r.kind !== "ok") return apiOnly("grok", { ...httpStatus(r), month, fetchedAt });
    const cents = centsOf(pick(r.json, "coreInvoice", "amountBeforeVat"));
    if (cents === void 0) return apiOnly("grok", { status: "error", month, detail: "amountBeforeVat fehlt", fetchedAt });
    return apiOnly("grok", { status: "ok", usd: cents / 100, month, fetchedAt });
  }, (detail) => apiOnly("grok", { status: "error", month: monthLabel(monthStartIso), detail, fetchedAt: nowIso() }))
};

// src/providers/gemini.ts
var gemini = {
  id: "gemini",
  subscription: async () => subOnly("gemini", { status: "na", detail: "Quota n/v (Antigravity-Login, Phase 2)", fetchedAt: nowIso() }),
  localTokens: (sinceIso) => localTokensFor("gemini", sinceIso),
  apiCost: async (monthStartIso) => apiOnly("gemini", { status: "na", month: monthLabel(monthStartIso), detail: "kein Kosten-Endpunkt (BigQuery-Export)", fetchedAt: nowIso() })
};

// src/providers/index.ts
var PROVIDERS = { claude, codex, copilot, gemini, grok };

// src/subgate.ts
var FRESH_MS = 55e3;
var FORCE_MIN_MS = 3e4;
var MIN = 6e4;
var COOLDOWN_429 = { baseMs: 5 * MIN, maxMs: 30 * MIN };
var COOLDOWN_5XX = { baseMs: 1 * MIN, maxMs: 8 * MIN };
var RETRY_AFTER_MAX_MS = 6 * 36e5;
function failKind(httpCode) {
  if (httpCode === 429) return "429";
  if (httpCode !== void 0 && httpCode >= 500 && httpCode <= 599) return "5xx";
  return void 0;
}
function cooldownMs(kind, strikes, retryAfterMs) {
  if (retryAfterMs !== void 0) return Math.min(RETRY_AFTER_MAX_MS, Math.max(0, retryAfterMs));
  const c = kind === "429" ? COOLDOWN_429 : COOLDOWN_5XX;
  return Math.min(c.maxMs, c.baseMs * 2 ** Math.max(0, strikes - 1));
}
function causeText(e, now) {
  const until = e.cooldownUntil ?? now;
  const code = e.kind === "429" ? "429" : `HTTP ${e.lastCode ?? "5xx"}`;
  return `${code}, erneut in ${fmtWait(until - now)}`;
}
function staleFrom(lastGood, cause, now, extra = {}) {
  if (lastGood?.primary) {
    return { ...lastGood, ...extra, status: "stale", source: "stale", detail: `${cause} \xB7 Wert ${fmtAge(lastGood.fetchedAt, now)}` };
  }
  return { status: "error", detail: cause, fetchedAt: new Date(now).toISOString(), ...extra, source: "stale" };
}
function planFetch(entry, lastGood, now, force) {
  if (entry?.cooldownUntil && entry.cooldownUntil > now) {
    return {
      action: "cooldown",
      sub: staleFrom(lastGood, causeText(entry, now), now, {
        httpCode: entry.kind === "429" ? 429 : entry.lastCode,
        cooldownUntil: new Date(entry.cooldownUntil).toISOString()
      })
    };
  }
  if (!force && lastGood?.status === "ok" && lastGood.primary) {
    const age = now - Date.parse(lastGood.fetchedAt);
    if (age >= 0 && age < FRESH_MS) return { action: "cache", sub: { ...lastGood, source: "cache" } };
  }
  return { action: "fetch" };
}
function applyResult(entry, lastGood, res, now) {
  if (res.status === "ok" && res.primary) {
    const good = { ...res, source: "net" };
    delete good.httpCode;
    delete good.retryAfterMs;
    delete good.cooldownUntil;
    return { entry: void 0, lastGood: good, out: good };
  }
  const kind = failKind(res.httpCode);
  if (kind) {
    const strikes = entry?.kind === kind ? (entry.strikes ?? 0) + 1 : 1;
    const until = now + cooldownMs(kind, strikes, res.retryAfterMs);
    const next = { kind, strikes, cooldownUntil: until, lastCode: res.httpCode, since: entry?.kind === kind ? entry.since : new Date(now).toISOString() };
    return {
      entry: next,
      lastGood,
      out: staleFrom(lastGood, causeText(next, now), now, { httpCode: res.httpCode, retryAfterMs: res.retryAfterMs, cooldownUntil: new Date(until).toISOString() })
    };
  }
  if ((res.status === "offline" || res.status === "error") && lastGood?.primary) {
    return { entry, lastGood, out: staleFrom(lastGood, `${res.status}: ${res.detail ?? ""}`.trim(), now, { httpCode: res.httpCode }) };
  }
  return { entry, lastGood, out: { ...res, source: "net" } };
}
function allowForce(lastForcedAt, now) {
  return lastForcedAt === void 0 || now - lastForcedAt >= FORCE_MIN_MS;
}
var inflight = /* @__PURE__ */ new Map();
var lastForced = /* @__PURE__ */ new Map();
function gatedSub(id, opts = {}) {
  const running = inflight.get(id);
  if (running) return running;
  const p = run(id, opts).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
async function run(id, opts) {
  const clock = opts.now ?? Date.now;
  const fetcher = opts.fetcher ?? (async () => (await PROVIDERS[id].subscription()).sub);
  let force = !!opts.force;
  if (force) {
    if (allowForce(lastForced.get(id), clock())) lastForced.set(id, clock());
    else force = false;
  }
  const s = await loadState();
  const plan = planFetch(s.subGate[id], s.lastSub[id], clock(), force);
  if (plan.action !== "fetch") return plan.sub;
  const res = await fetcher();
  return withState((st) => {
    const r = applyResult(st.subGate[id], st.lastSub[id], res, clock());
    if (r.entry) st.subGate[id] = r.entry;
    else delete st.subGate[id];
    if (r.lastGood) st.lastSub[id] = r.lastGood;
    return r.out;
  }).catch(() => applyResult(s.subGate[id], s.lastSub[id], res, clock()).out);
}

// src/doctor.ts
var RATE_LIMIT_NOTE = "rate-limited (andere Plugins pollen denselben Endpunkt)";
function subCheck(provider, source, sub) {
  if (sub.status === "ok") return { provider, source, result: "ok", note: sub.source === "cache" ? "aus Cache (< 55 s)" : void 0 };
  if (sub.httpCode === 429) return { provider, source, result: "warn", note: `${RATE_LIMIT_NOTE}; ${sub.detail ?? ""}`.trim() };
  if (sub.status === "stale") return { provider, source, result: "warn", note: sub.detail };
  return { provider, source, result: "invalid", note: `${sub.status}: ${sub.detail ?? ""}` };
}
var probe = (id) => gatedSub(id, { force: true });
async function exists(p) {
  try {
    await fs9.access(p);
    return true;
  } catch {
    return false;
  }
}
var OPTIONAL_NOTE = "optional (nur Enterprise/Teams)";
async function keyCheck(provider, service, probe2, prefix) {
  const source = `Keychain "${service}"`;
  const base = { provider, source, group: "optional" };
  if (!probe2) return { ...base, result: "info", note: "nicht gepr\xFCft (doctor --api pr\xFCft)" };
  const r = await readSecret(service);
  if (r.status === "missing") return { ...base, result: "info", note: `nicht angelegt \u2013 nur n\xF6tig mit showApiCost: bash tools/apikey_setzen.sh ${service}` };
  if (r.status === "error") return { ...base, result: "invalid", note: r.detail };
  if (prefix && !r.value.startsWith(prefix)) return { ...base, result: "invalid", note: `erwartet Pr\xE4fix ${prefix}\u2026` };
  return { ...base, result: "found" };
}
async function doctor(opts = {}) {
  const out = [];
  const api = !!opts.api;
  const cc = await readClaudeCred();
  if (cc.status === "found") {
    const left = cc.expiresAt ? Math.round((cc.expiresAt - Date.now()) / 6e4) : void 0;
    out.push({
      provider: "claude",
      source: `Keychain "${CLAUDE_KEYCHAIN}"`,
      result: left !== void 0 && left < 0 ? "invalid" : "found",
      note: [cc.plan && `Plan ${cc.plan}`, left !== void 0 && (left < 0 ? "abgelaufen \u2013 Claude Code \xF6ffnen" : `g\xFCltig noch ${left} min`)].filter(Boolean).join(", ")
    });
  } else out.push({ provider: "claude", source: `Keychain "${CLAUDE_KEYCHAIN}"`, result: cc.status, note: cc.detail });
  out.push(subCheck("claude", "GET api.anthropic.com/api/oauth/usage", await probe("claude")));
  out.push(await keyCheck("claude", ANTHROPIC_ADMIN, api, "sk-ant-admin"));
  const xc = await readCodexCred();
  out.push({ provider: "codex", source: "~/.codex/auth.json", result: xc.status, note: xc.status === "found" ? xc.accountId ? "account_id vorhanden" : "account_id fehlt" : xc.detail });
  out.push(subCheck("codex", "GET chatgpt.com/backend-api/wham/usage", await probe("codex")));
  out.push(await keyCheck("codex", OPENAI_ADMIN, api, "sk-admin-"));
  const gt = await readGhToken();
  out.push({ provider: "copilot", source: "gh auth token", result: gt.status, note: gt.status === "found" ? void 0 : gt.detail });
  if (gt.status === "found") {
    out.push(subCheck("copilot", "GET api.github.com/copilot_internal/user", await probe("copilot")));
  }
  out.push({ provider: "copilot", source: "~/.copilot/data.db", result: await exists(COPILOT_DB) ? "found" : "missing" });
  out.push({ provider: "copilot", source: SQLITE_BIN, result: await exists(SQLITE_BIN) ? "found" : "missing" });
  out.push(await keyCheck("copilot", GITHUB_BILLING_PAT, api));
  out.push({ provider: "gemini", source: "~/.gemini/oauth_creds.json", result: await exists(GEMINI_OAUTH) ? "found" : "missing", note: "Abo-Quota in v1 n/v" });
  const chats = await listFiles(GEMINI_TMP, (n) => n.startsWith("session-") && n.endsWith(".jsonl"));
  let withUsage = 0;
  for (const f of chats.slice(-20)) {
    const text = await fs9.readFile(f, "utf8").catch(() => "");
    if (text.split("\n").some((l) => parseGeminiLine(l))) withUsage++;
  }
  out.push({ provider: "gemini", source: "~/.gemini/tmp/*/chats/session-*.jsonl", result: "info", note: `${chats.length} Dateien, ${withUsage} mit tokens-Feldern (letzte 20 gepr\xFCft)` });
  const gk = await readGrokCred();
  out.push({ provider: "grok", source: "~/.grok/auth.json", result: gk.status, note: gk.status === "found" ? void 0 : gk.detail });
  if (gk.status === "found") out.push(subCheck("grok", "GET cli-chat-proxy.grok.com/v1/billing", await probe("grok")));
  out.push(await keyCheck("grok", XAI_MANAGEMENT, api));
  out.push(await keyCheck("grok", XAI_TEAM_ID, api));
  let writable = true;
  try {
    await fs9.mkdir(CONFIG_DIR, { recursive: true });
    await fs9.access(CONFIG_DIR, fs9.constants.W_OK);
  } catch {
    writable = false;
  }
  out.push({ provider: "-", source: CONFIG_DIR, result: writable ? "ok" : "invalid", note: writable ? "beschreibbar" : "nicht beschreibbar" });
  return out;
}

// src/hub.ts
var Hub = class {
  views = new Map(PROVIDER_IDS.map((id) => [id, {}]));
  listeners = /* @__PURE__ */ new Set();
  lastSubRefresh = 0;
  /**
   * Last known resets per provider. Kept when a later fetch has no value (login, 429 without a value),
   * because a known reset time stays true until it has passed; passed ones are dropped by allResets().
   */
  resetsBy = /* @__PURE__ */ new Map();
  /**
   * Providers whose API-key costs are fetched (setting showApiCost, CLI --api). Empty by default: personal
   * subscriptions have no admin keys, and keychain services are only probed for providers in this set.
   */
  apiProviders = /* @__PURE__ */ new Set();
  /**
   * Replaces the set of API-cost providers. Providers switched off lose their API value; newly switched-on ones
   * are fetched. `persist` stores the set in state.json for the weekly reconcile (plugin only).
   */
  async setApiProviders(ids, opts = {}) {
    const next = new Set(ids);
    const added = [...next].filter((id) => !this.apiProviders.has(id));
    const changed = added.length > 0 || [...this.apiProviders].some((id) => !next.has(id));
    this.apiProviders = next;
    if (!changed) return;
    for (const id of PROVIDER_IDS) if (!next.has(id)) delete this.views.get(id).api;
    this.emit();
    if (opts.persist) {
      await withState((s) => {
        s.apiProviders = PROVIDER_IDS.filter((id) => next.has(id));
      }).catch(() => void 0);
    }
    if (added.length) await this.refreshApi(added);
  }
  /** Remembers the resets of a SubPart that carries a value. */
  noteResets(id, sub) {
    if (sub?.primary) this.resetsBy.set(id, resetsOf(id, sub));
  }
  /** All future resets of all providers, soonest first. */
  allResets(now = Date.now()) {
    return upcomingResets([...this.resetsBy.values()].flat(), now);
  }
  onChange(fn2) {
    this.listeners.add(fn2);
    return () => this.listeners.delete(fn2);
  }
  emit() {
    for (const fn2 of this.listeners) {
      try {
        fn2();
      } catch {
      }
    }
  }
  /** Seeds subscription values persisted by an earlier run (shown as stale with age). */
  async init() {
    const s = await loadState();
    for (const id of PROVIDER_IDS) {
      const last = s.lastSub[id];
      if (last) this.views.get(id).sub = { ...last, status: "stale", source: "stale", detail: "letzter bekannter Wert" };
      this.noteResets(id, last);
    }
    this.emit();
  }
  /**
   * Subscription refresh through the shared gate (55 s cache, cooldown after 429/5xx, last-good fallback).
   * `force` skips the 55 s cache (rate-limited to one forced fetch per 30 s per provider), never a cooldown.
   */
  async refreshSub(ids = PROVIDER_IDS, opts = {}) {
    this.lastSubRefresh = Date.now();
    await Promise.all(
      ids.map(async (id) => {
        const res = await gatedSub(id, { force: opts.force });
        const view = this.views.get(id);
        const prev = view.sub;
        if (!res.primary && prev?.primary && (res.status === "error" || res.status === "offline")) {
          view.sub = { ...prev, status: "stale", source: "stale", detail: res.detail, httpCode: res.httpCode, cooldownUntil: res.cooldownUntil };
        } else {
          view.sub = res;
        }
        this.noteResets(id, view.sub);
        this.emit();
      })
    );
  }
  /** Collectors run sequentially (they share state.json and the disk). */
  async refreshTokens(ids = PROVIDER_IDS) {
    for (const id of ids) {
      const view = this.views.get(id);
      view.today = (await PROVIDERS[id].localTokens(startOfToday().toISOString())).tokens;
      view.week = (await PROVIDERS[id].localTokens(startOfWeek().toISOString())).tokens;
      this.emit();
    }
  }
  /** API-key costs, only for providers in apiProviders (no keychain access otherwise). */
  async refreshApi(ids = PROVIDER_IDS) {
    const enabled = ids.filter((id) => this.apiProviders.has(id));
    if (enabled.length === 0) return;
    await Promise.all(
      enabled.map(async (id) => {
        const res = (await PROVIDERS[id].apiCost(startOfMonth().toISOString())).api;
        const view = this.views.get(id);
        const prev = view.api;
        view.api = (res.status === "offline" || res.status === "error") && prev?.usd !== void 0 ? { ...prev, status: res.status, detail: res.detail } : res;
        this.emit();
      })
    );
    await withState((s) => {
      s.lastApiRun = (/* @__PURE__ */ new Date()).toISOString();
    }).catch(() => void 0);
  }
  async refreshAll(ids = PROVIDER_IDS, opts = {}) {
    await Promise.all([this.refreshSub(ids, opts), this.refreshApi(ids), this.refreshTokens(ids)]);
  }
};

// src/reconcile.ts
async function reconcile(opts = {}) {
  const release = await tryLock();
  if (!release) return { ran: false, reason: "anderer Abgleich l\xE4uft (Lock)" };
  try {
    if (opts.scheduled) {
      const s = await loadState();
      if (s.lastReconcile && Date.parse(s.lastReconcile) >= lastSundaySlot().getTime()) {
        return { ran: false, reason: "dieser Sonntag-Slot ist bereits abgeglichen" };
      }
    }
    const apiIds = new Set(opts.api ?? (await loadState()).apiProviders ?? []);
    const now = /* @__PURE__ */ new Date();
    const weekIso = startOfWeek(now).toISOString();
    const monthIso = startOfMonth(now).toISOString();
    const lines = [];
    for (const id of PROVIDER_IDS) {
      const p = PROVIDERS[id];
      const [sub, api] = await Promise.all([p.subscription(), apiIds.has(id) ? p.apiCost(monthIso) : void 0]);
      const tok = await p.localTokens(weekIso);
      const s = sub.sub;
      const t = tok.tokens;
      const a = api?.api;
      const tOk = t.status === "ok";
      lines.push({
        ts: now.toISOString(),
        week: isoWeek(now),
        provider: id,
        sub_pct: s.primary?.pct ?? null,
        sub_reset: s.primary?.resetAt ?? null,
        tokens_week_in: tOk ? t.in : null,
        tokens_week_out: tOk ? t.out : null,
        tokens_week_cached: tOk ? t.cached : null,
        api_usd_mtd: a?.usd ?? null,
        status: `sub:${s.status} tokens:${t.status} api:${a ? a.status : "aus"}`
      });
    }
    await appendHistory(lines);
    await withState((s) => {
      s.lastReconcile = now.toISOString();
    });
    return { ran: true, lines };
  } finally {
    await release();
  }
}

// src/render.ts
var STATUS_TEXT = {
  ok: "ok",
  login: "login",
  key_missing: "Key fehlt",
  offline: "offline",
  na: "n/v",
  error: "Fehler",
  stale: "veraltet"
};

// src/cli.ts
function table(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => [...r[i] ?? ""].length)));
  return rows.map((r) => r.map((c, i) => c + " ".repeat(w[i] - [...c].length)).join("  ").trimEnd()).join("\n");
}
function subCell(v) {
  const s = v.sub;
  if (!s) return "\u2026";
  if (!s.primary) return STATUS_TEXT[s.status];
  const parts = [`${s.primary.label} ${Math.round(s.primary.pct)}%`];
  if (s.secondary) parts.push(`${s.secondary.label} ${Math.round(s.secondary.pct)}%`);
  return parts.join(" \xB7 ") + (s.status === "ok" ? "" : ` (${STATUS_TEXT[s.status]})`);
}
function sourceCell(v, now) {
  const s = v.sub;
  if (!s?.source) return "";
  const age = Math.max(0, Math.round((now - Date.parse(s.fetchedAt)) / 1e3));
  if (s.source === "cache") return `Cache (${age} s alt)`;
  if (s.source === "stale") return s.primary ? `letzter Wert (${fmtAgeShort(age)})` : "kein Wert";
  return s.primary ? "Netz" : "\u2013";
}
function fmtAgeShort(sec) {
  if (sec < 120) return `${sec} s`;
  if (sec < 7200) return `${Math.round(sec / 60)} min`;
  return `${Math.round(sec / 3600)} h`;
}
function tokCell(t) {
  if (!t) return "\u2026";
  if (t.status !== "ok") return STATUS_TEXT[t.status];
  return `${fmtTokens(t.in + t.out)} +${fmtTokens(t.cached)} cache`;
}
function costCell(id, v, now) {
  if (!COST_SOURCE[id]) return "n/v";
  const s = v.sub;
  if (!s) return "\u2026";
  if (!s.cost) return s.primary ? "n/v" : STATUS_TEXT[s.status];
  if (s.cost.length === 0) return "keine";
  return (s.status === "ok" ? "" : "~ ") + s.cost.map((c) => costCli(c, now)).join(" \xB7 ");
}
function notes(v) {
  const n = [];
  if (v.sub && v.sub.status !== "ok" && v.sub.detail) n.push(`Abo: ${v.sub.detail}`);
  if (v.today && v.today.status !== "ok" && v.today.detail) n.push(`Tokens: ${v.today.detail}`);
  if (v.api && v.api.status !== "ok" && v.api.detail) n.push(`API: ${v.api.detail}`);
  return n.join("; ");
}
async function status(fresh, api) {
  const hub = new Hub();
  if (api) hub.apiProviders = new Set(PROVIDER_IDS);
  const t0 = Date.now();
  await hub.refreshAll(void 0, { force: fresh });
  const head = ["Anbieter", "Abo", "Abo-Quelle", "Reset", "Tokens heute", "Tokens Woche", "Kosten"];
  const rows = [api ? [...head, "API Monat", "Hinweise"] : [...head, "Hinweise"]];
  for (const id of PROVIDER_IDS) {
    const v = hub.views.get(id);
    const row = [
      META[id].name,
      subCell(v),
      sourceCell(v, Date.now()),
      v.sub?.status === "ok" && v.sub.primary?.resetAt ? fmtCountdown(v.sub.primary.resetAt) : "",
      tokCell(v.today),
      tokCell(v.week),
      costCell(id, v, Date.now())
    ];
    if (api) row.push(v.api ? v.api.usd !== void 0 ? fmtUsd(v.api.usd) : STATUS_TEXT[v.api.status] : "\u2026");
    row.push(notes(v));
    rows.push(row);
  }
  console.log(table(rows));
  const reused = PROVIDER_IDS.filter((id) => hub.views.get(id).sub?.source === "cache");
  if (reused.length) {
    console.log(`
Abo-Cache wiederverwendet (j\xFCnger als ${FRESH_MS / 1e3} s, kein Netzaufruf): ${reused.join(", ")}. Erzwingen mit --fresh.`);
  }
  console.log(`
Tokens = Input + Cache-Write + Output (Cache-Reads separat). Laufzeit ${((Date.now() - t0) / 1e3).toFixed(1)} s. State: ${STATE_FILE}`);
}
async function resets(windowArg) {
  const hours = windowArg === void 0 ? DEFAULT_BLINK_WINDOW_HOURS : normalizeBlinkHours(windowArg);
  const hub = new Hub();
  await hub.init();
  await hub.refreshSub();
  const now = Date.now();
  const list = hub.allResets(now);
  const end = now + hours * 36e5;
  const rows = [["#", "Anbieter", "Fenster", "Reset (lokal)", "Countdown", "Verbrauch", "Abo-Quelle", "im Fenster"]];
  list.forEach((e, i) => {
    const v = hub.views.get(e.provider);
    rows.push([
      String(i + 1),
      PROVIDER_DISPLAY[e.provider],
      e.window,
      fmtResetFull(e.resetsAt),
      fmtResetCountdown(e.resetsAt, now),
      e.pct === void 0 ? "\u2013" : `${Math.round(e.pct)}%`,
      sourceCell(v, now) || "\u2013",
      Date.parse(e.resetsAt) <= end ? "ja" : ""
    ]);
  });
  if (list.length === 0) console.log("keine Resets");
  else console.log(table(rows));
  const b = blinkInfo(list, now, hours);
  console.log(
    `
Blink-Bedingung (> ${BLINK_MIN_EVENTS} Resets in den n\xE4chsten ${hours} h): ${b.inWindow} im Fenster \u2192 ${b.blink ? "Taste BLINKT" : "kein Blinken"}.`
  );
  console.log(`Taste zeigt die ${SHOWN_EVENTS} n\xE4chsten${list.length > SHOWN_EVENTS ? `, Badge +${list.length - SHOWN_EVENTS}` : ""}.`);
  const without = PROVIDER_IDS.filter((id) => !hub.resetsBy.get(id)?.length).map((id) => {
    const s = hub.views.get(id).sub;
    return `${PROVIDER_DISPLAY[id]} (${s ? s.detail ?? STATUS_TEXT[s.status] : "kein Wert"})`;
  });
  if (without.length) console.log(`Ohne Reset-Daten: ${without.join(", ")}.`);
}
async function sync(scheduled, api) {
  const r = await reconcile({ scheduled, api: api ? PROVIDER_IDS : void 0 });
  if (!r.ran) {
    console.log(`sync \xFCbersprungen: ${r.reason}`);
    return;
  }
  for (const l of r.lines) console.log(JSON.stringify(l));
  console.log(`
${r.lines.length} Zeilen an ${HISTORY_FILE} angeh\xE4ngt.`);
}
async function runDoctor(api) {
  const checks = await doctor({ api });
  const head = ["Anbieter", "Quelle", "Ergebnis", "Hinweis"];
  const rowOf = (c) => [c.provider, c.source, c.result, c.note ?? ""];
  console.log(table([head, ...checks.filter((c) => !c.group).map(rowOf)]));
  console.log(`
API-Kosten-Schl\xFCssel \u2013 ${OPTIONAL_NOTE}, f\xFCr pers\xF6nliche Abos nicht n\xF6tig (Taste: Einstellung showApiCost):`);
  console.log(table([head, ...checks.filter((c) => c.group === "optional").map(rowOf)]));
}
var [cmd, ...args] = process.argv.slice(2);
var commands = {
  status: () => status(args.includes("--fresh"), args.includes("--api")),
  sync: () => sync(args.includes("--scheduled"), args.includes("--api")),
  doctor: () => runDoctor(args.includes("--api")),
  resets: () => {
    const i = args.indexOf("--window");
    return resets(i >= 0 ? args[i + 1] : void 0);
  }
};
var fn = commands[cmd ?? ""];
if (!fn) {
  console.log("Usage: node bin/cli.js <status [--fresh] [--api]|sync [--scheduled] [--api]|doctor [--api]|resets [--window <h>]>");
  process.exitCode = cmd ? 2 : 0;
} else {
  fn().catch((e) => {
    console.error(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
