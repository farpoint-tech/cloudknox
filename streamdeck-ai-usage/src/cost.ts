import { fmtCountdown } from "./format.js";
import type { CostItem, ProviderId } from "./providers/types.js";

/** Providers whose subscription endpoint reports costs/budgets. Gemini and Grok: "n/v" until data exists. */
export const COST_SOURCE: Record<ProviderId, boolean> = { claude: true, codex: true, copilot: true, gemini: false, grok: false };

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

/** German number: "2.500", "25", "12,40", "251". Whole numbers and values ≥ 100 without decimals. */
export function fmtNum(n: number): string {
	const whole = Math.abs(n) >= 100 || Math.abs(n - Math.round(n)) < 0.005;
	const s = whole ? String(Math.round(Math.abs(n))) : Math.abs(n).toFixed(2);
	const [int, dec] = s.split(".");
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	return (n < 0 ? "-" : "") + grouped + (dec ? "," + dec : "");
}

export function currencySymbol(currency: string | undefined): string {
	if (!currency) return "";
	return SYMBOL[currency.toUpperCase()] ?? currency.toUpperCase();
}

/** Amount line: "0 / 25 €", "251 / 250 $", "0" (count), "∞" (unlimited). */
export function costAmount(c: CostItem): string {
	if (c.unlimited && c.limit === undefined) return "∞";
	const sym = currencySymbol(c.currency);
	const used = c.used === undefined ? "?" : fmtNum(c.used);
	const body = c.limit === undefined ? used : `${used} / ${fmtNum(c.limit)}`;
	return sym ? `${body} ${sym}` : body;
}

/** Label line: "Extra aus", "Budget 100%", "Credits", "Credits unbegrenzt", "Overage aus", "Limit erreicht". */
export function costLabel(c: CostItem): string {
	if (c.state) return `${c.label} ${c.state}`;
	if (c.pct !== undefined) return `${c.label} ${Math.round(c.pct)}%`;
	return c.label;
}

/** A cost row is worth showing on the overview: something was used, or a limit is reached. */
export function costNotable(c: CostItem): boolean {
	return !!c.reached || (c.used !== undefined && c.used > 0);
}

/** Item drawn on the tile: reached first, then any non-zero, else the first. */
export function primaryCost(items: CostItem[]): CostItem | undefined {
	return items.find((c) => c.reached) ?? items.find(costNotable) ?? items[0];
}

/** One-line CLI text of an item: "Extra 0 / 25 € (aus, out_of_credits)", "Budget 251 / 250 $ 100% ↻ 10d14". */
export function costCli(c: CostItem, now = Date.now()): string {
	const parts = [`${c.label} ${costAmount(c)}`];
	const flags = [c.state, c.note].filter(Boolean);
	if (flags.length) parts.push(`(${flags.join(", ")})`);
	else if (c.pct !== undefined) parts.push(`${Math.round(c.pct)}%`);
	if (c.resetAt) parts.push(fmtCountdown(c.resetAt, now));
	return parts.join(" ");
}
