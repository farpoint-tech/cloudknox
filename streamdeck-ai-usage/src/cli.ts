import { COST_SOURCE, costCli } from "./cost.js";
import { doctor, OPTIONAL_NOTE } from "./doctor.js";
import { fmtCountdown, fmtTokens, fmtUsd } from "./format.js";
import { Hub, type View } from "./hub.js";
import { STATE_FILE, HISTORY_FILE } from "./paths.js";
import { META, PROVIDER_IDS, type ProviderId } from "./providers/types.js";
import { reconcile } from "./reconcile.js";
import { FRESH_MS } from "./subgate.js";
import { STATUS_TEXT } from "./render.js";
import { blinkInfo, BLINK_MIN_EVENTS, DEFAULT_BLINK_WINDOW_HOURS, fmtResetCountdown, fmtResetFull, normalizeBlinkHours, PROVIDER_DISPLAY, SHOWN_EVENTS } from "./resets.js";

function table(rows: string[][]): string {
	const w = rows[0].map((_, i) => Math.max(...rows.map((r) => [...(r[i] ?? "")].length)));
	return rows.map((r) => r.map((c, i) => c + " ".repeat(w[i] - [...c].length)).join("  ").trimEnd()).join("\n");
}

function subCell(v: View): string {
	const s = v.sub;
	if (!s) return "…";
	if (!s.primary) return STATUS_TEXT[s.status];
	const parts = [`${s.primary.label} ${Math.round(s.primary.pct)}%`];
	if (s.secondary) parts.push(`${s.secondary.label} ${Math.round(s.secondary.pct)}%`);
	return parts.join(" · ") + (s.status === "ok" ? "" : ` (${STATUS_TEXT[s.status]})`);
}

function sourceCell(v: View, now: number): string {
	const s = v.sub;
	if (!s?.source) return "";
	const age = Math.max(0, Math.round((now - Date.parse(s.fetchedAt)) / 1000));
	if (s.source === "cache") return `Cache (${age} s alt)`;
	if (s.source === "stale") return s.primary ? `letzter Wert (${fmtAgeShort(age)})` : "kein Wert";
	// No value (n/v, login): nothing was fetched over the network worth naming.
	return s.primary ? "Netz" : "–";
}

function fmtAgeShort(sec: number): string {
	if (sec < 120) return `${sec} s`;
	if (sec < 7200) return `${Math.round(sec / 60)} min`;
	return `${Math.round(sec / 3600)} h`;
}

function tokCell(t: View["today"]): string {
	if (!t) return "…";
	if (t.status !== "ok") return STATUS_TEXT[t.status];
	return `${fmtTokens(t.in + t.out)} +${fmtTokens(t.cached)} cache`;
}

/** "Kosten" column: subscription costs/budgets from the last subscription value (stale ones marked "~"). */
function costCell(id: ProviderId, v: View, now: number): string {
	if (!COST_SOURCE[id]) return "n/v";
	const s = v.sub;
	if (!s) return "…";
	if (!s.cost) return s.primary ? "n/v" : STATUS_TEXT[s.status];
	if (s.cost.length === 0) return "keine";
	return (s.status === "ok" ? "" : "~ ") + s.cost.map((c) => costCli(c, now)).join(" · ");
}

function notes(v: View): string {
	const n: string[] = [];
	if (v.sub && v.sub.status !== "ok" && v.sub.detail) n.push(`Abo: ${v.sub.detail}`);
	if (v.today && v.today.status !== "ok" && v.today.detail) n.push(`Tokens: ${v.today.detail}`);
	if (v.api && v.api.status !== "ok" && v.api.detail) n.push(`API: ${v.api.detail}`);
	return n.join("; ");
}

async function status(fresh: boolean, api: boolean): Promise<void> {
	const hub = new Hub();
	// API-key costs (admin keys, Enterprise/Teams) only with --api; without it no API-key keychain entry is read.
	if (api) hub.apiProviders = new Set(PROVIDER_IDS);
	const t0 = Date.now();
	await hub.refreshAll(undefined, { force: fresh });
	const head = ["Anbieter", "Abo", "Abo-Quelle", "Reset", "Tokens heute", "Tokens Woche", "Kosten"];
	const rows = [api ? [...head, "API Monat", "Hinweise"] : [...head, "Hinweise"]];
	for (const id of PROVIDER_IDS) {
		const v = hub.views.get(id)!;
		const row = [
			META[id].name,
			subCell(v),
			sourceCell(v, Date.now()),
			v.sub?.status === "ok" && v.sub.primary?.resetAt ? fmtCountdown(v.sub.primary.resetAt) : "",
			tokCell(v.today),
			tokCell(v.week),
			costCell(id, v, Date.now()),
		];
		if (api) row.push(v.api ? (v.api.usd !== undefined ? fmtUsd(v.api.usd) : STATUS_TEXT[v.api.status]) : "…");
		row.push(notes(v));
		rows.push(row);
	}
	console.log(table(rows));
	const reused = PROVIDER_IDS.filter((id) => hub.views.get(id)!.sub?.source === "cache");
	if (reused.length) {
		console.log(`\nAbo-Cache wiederverwendet (jünger als ${FRESH_MS / 1000} s, kein Netzaufruf): ${reused.join(", ")}. Erzwingen mit --fresh.`);
	}
	console.log(`\nTokens = Input + Cache-Write + Output (Cache-Reads separat). Laufzeit ${((Date.now() - t0) / 1000).toFixed(1)} s. State: ${STATE_FILE}`);
}

/** `resets [--window <h>]`: all upcoming resets, soonest first, and whether the resets key would blink. */
async function resets(windowArg: string | undefined): Promise<void> {
	const hours = windowArg === undefined ? DEFAULT_BLINK_WINDOW_HOURS : normalizeBlinkHours(windowArg);
	const hub = new Hub();
	await hub.init(); // last good values from state.json, so providers without a current value still contribute
	await hub.refreshSub();
	const now = Date.now();
	const list = hub.allResets(now);
	const end = now + hours * 3600_000;
	const rows = [["#", "Anbieter", "Fenster", "Reset (lokal)", "Countdown", "Verbrauch", "Abo-Quelle", "im Fenster"]];
	list.forEach((e, i) => {
		const v = hub.views.get(e.provider)!;
		rows.push([
			String(i + 1),
			PROVIDER_DISPLAY[e.provider],
			e.window,
			fmtResetFull(e.resetsAt),
			fmtResetCountdown(e.resetsAt, now),
			e.pct === undefined ? "–" : `${Math.round(e.pct)}%`,
			sourceCell(v, now) || "–",
			Date.parse(e.resetsAt) <= end ? "ja" : "",
		]);
	});
	if (list.length === 0) console.log("keine Resets");
	else console.log(table(rows));
	const b = blinkInfo(list, now, hours);
	console.log(
		`\nBlink-Bedingung (> ${BLINK_MIN_EVENTS} Resets in den nächsten ${hours} h): ${b.inWindow} im Fenster → ${b.blink ? "Taste BLINKT" : "kein Blinken"}.`,
	);
	console.log(`Taste zeigt die ${SHOWN_EVENTS} nächsten${list.length > SHOWN_EVENTS ? `, Badge +${list.length - SHOWN_EVENTS}` : ""}.`);
	const without = PROVIDER_IDS.filter((id) => !hub.resetsBy.get(id)?.length).map((id) => {
		const s = hub.views.get(id)!.sub;
		return `${PROVIDER_DISPLAY[id]} (${s ? (s.detail ?? STATUS_TEXT[s.status]) : "kein Wert"})`;
	});
	if (without.length) console.log(`Ohne Reset-Daten: ${without.join(", ")}.`);
}

async function sync(scheduled: boolean, api: boolean): Promise<void> {
	const r = await reconcile({ scheduled, api: api ? PROVIDER_IDS : undefined });
	if (!r.ran) {
		console.log(`sync übersprungen: ${r.reason}`);
		return;
	}
	for (const l of r.lines) console.log(JSON.stringify(l));
	console.log(`\n${r.lines.length} Zeilen an ${HISTORY_FILE} angehängt.`);
}

async function runDoctor(api: boolean): Promise<void> {
	const checks = await doctor({ api });
	const head = ["Anbieter", "Quelle", "Ergebnis", "Hinweis"];
	const rowOf = (c: (typeof checks)[number]) => [c.provider, c.source, c.result, c.note ?? ""];
	console.log(table([head, ...checks.filter((c) => !c.group).map(rowOf)]));
	console.log(`\nAPI-Kosten-Schlüssel – ${OPTIONAL_NOTE}, für persönliche Abos nicht nötig (Taste: Einstellung showApiCost):`);
	console.log(table([head, ...checks.filter((c) => c.group === "optional").map(rowOf)]));
}

const [cmd, ...args] = process.argv.slice(2);
const commands: Record<string, () => Promise<void>> = {
	status: () => status(args.includes("--fresh"), args.includes("--api")),
	sync: () => sync(args.includes("--scheduled"), args.includes("--api")),
	doctor: () => runDoctor(args.includes("--api")),
	resets: () => {
		const i = args.indexOf("--window");
		return resets(i >= 0 ? args[i + 1] : undefined);
	},
};
const fn = commands[cmd ?? ""];
if (!fn) {
	console.log("Usage: node bin/cli.js <status [--fresh] [--api]|sync [--scheduled] [--api]|doctor [--api]|resets [--window <h>]>");
	process.exitCode = cmd ? 2 : 0;
} else {
	fn().catch((e: unknown) => {
		console.error(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
		process.exitCode = 1;
	});
}
