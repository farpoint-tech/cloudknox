#!/usr/bin/env node
// Generates tools/Nexus365-AI-Usage.streamDeckProfile: one page with all AI-Usage keys.
// No dependencies. Zips with /usr/bin/zip. Format notes: tools/PROFILE-FORMAT.md
//
//   node tools/make-profile.mjs [--device-type 0] [--cols 5 --rows 3] [--model 20GBL9901]
//                               [--name "Nexus.365 – AI Usage"] [--out path.streamDeckProfile]
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.on("uncaughtException", (e) => { console.error(`make-profile: ${e.message} (nichts geschrieben)`); process.exit(1); });

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_MANIFEST = join(ROOT, "tech.farpoint.ai-usage.sdPlugin", "manifest.json");

// DeviceType (docs.elgato.com/sdk/plugins/manifest) -> model code, grid.
// 0: model seen on this Mac in ProfilesV3 (USB PID 0xA5, 15 keys); 1/2: from Elgato's tutorial exports.
const DEVICES = {
	0: { model: "20GBL9901", cols: 5, rows: 3, label: "Stream Deck" },
	1: { model: "20GAI9901", cols: 3, rows: 2, label: "Stream Deck Mini" },
	2: { model: "20GAT9901", cols: 8, rows: 4, label: "Stream Deck XL" },
};

function args(argv) {
	const o = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith("--")) throw new Error(`Unbekanntes Argument: ${a}`);
		const v = argv[i + 1];
		if (v === undefined || v.startsWith("--")) throw new Error(`Wert fehlt für ${a}`);
		o[a.slice(2)] = v;
		i++;
	}
	return o;
}

const opt = args(process.argv.slice(2));
const deviceType = Number(opt["device-type"] ?? 0);
const dev = DEVICES[deviceType];
if (!dev && !(opt.model && opt.cols && opt.rows)) {
	throw new Error(`DeviceType ${deviceType} unbekannt; dann --model, --cols und --rows angeben.`);
}
const cols = Number(opt.cols ?? dev.cols);
const rows = Number(opt.rows ?? dev.rows);
const model = opt.model ?? dev.model;
const profileName = opt.name ?? "Nexus.365 – AI Usage";
const out = resolve(opt.out ?? join(ROOT, "tools", "Nexus365-AI-Usage.streamDeckProfile"));

const plugin = JSON.parse(readFileSync(PLUGIN_MANIFEST, "utf8"));
const actionByUuid = Object.fromEntries(plugin.Actions.map((a) => [a.UUID, a]));
const P = "tech.farpoint.ai-usage";

// Key order, row-major. 5x3 gives exactly the agreed layout; larger grids keep the order.
const p = (provider, metric) => ({ uuid: `${P}.provider`, settings: { provider, metric, showApiCost: false } });
const KEYS = [
	p("claude", "sub"), p("claude", "tokens"), p("claude", "kosten"), p("codex", "sub"), p("codex", "tokens"),
	p("codex", "kosten"), p("copilot", "sub"), p("copilot", "tokens"), p("copilot", "kosten"),
	{ uuid: `${P}.overview`, settings: {} },
	{ uuid: `${P}.resets`, settings: { blinkWindowHours: "24" } },
	p("gemini", "auto"), p("grok", "auto"),
];
if (KEYS.length > cols * rows) throw new Error(`${KEYS.length} Tasten passen nicht in ${cols}x${rows}.`);

function keyAction(k) {
	const a = actionByUuid[k.uuid];
	if (!a) throw new Error(`Action ${k.uuid} fehlt im Plugin-Manifest`);
	return {
		ActionID: randomUUID(),
		LinkedTitle: true,
		Name: a.Name,
		Plugin: { Name: plugin.Name, UUID: plugin.UUID, Version: plugin.Version },
		Resources: null,
		Settings: k.settings,
		State: 0,
		// No Image, no Title: the plugin draws the key via setImage.
		States: [{
			FontFamily: "", FontSize: 12, FontStyle: "", FontUnderline: false, OutlineThickness: 2,
			ShowTitle: false, Title: "", TitleAlignment: "middle", TitleColor: "#ffffff",
		}],
		UUID: k.uuid,
	};
}

const actions = {};
KEYS.forEach((k, i) => { actions[`${i % cols},${Math.floor(i / cols)}`] = keyAction(k); });

const profileId = randomUUID().toUpperCase();
const pageId = randomUUID();
const defaultPageId = randomUUID();

const profileManifest = {
	Device: { Model: model, UUID: opt["device-uuid"] ?? "" },
	Name: profileName,
	Pages: { Current: pageId, Default: defaultPageId, Pages: [pageId] },
	Version: "3.0",
};
const page = { Controllers: [{ Actions: actions, Type: "Keypad" }], Icon: "", Name: "" };
const emptyPage = { Controllers: [{ Actions: null, Type: "Keypad" }], Icon: "", Name: "" };

const stage = mkdtempSync(join(tmpdir(), "sdprofile-"));
try {
	const prof = join(stage, `${profileId}.sdProfile`);
	mkdirSync(join(prof, "Images"), { recursive: true });
	for (const [id, body] of [[pageId, page], [defaultPageId, emptyPage]]) {
		const dir = join(prof, "Profiles", id.toUpperCase());
		mkdirSync(join(dir, "Images"), { recursive: true });
		writeFileSync(join(dir, "manifest.json"), JSON.stringify(body));
	}
	writeFileSync(join(prof, "manifest.json"), JSON.stringify(profileManifest));
	if (existsSync(out)) rmSync(out);
	mkdirSync(dirname(out), { recursive: true });
	// -X: no macOS extra attributes; -D would drop directory entries, keep them like Elgato's exports.
	execFileSync("zip", ["-r", "-X", "-q", out, `${profileId}.sdProfile`], { cwd: stage });
} finally {
	rmSync(stage, { recursive: true, force: true });
}
console.log(`${out}\n  Profil "${profileName}", Modell ${model}, ${cols}x${rows}, ${KEYS.length} Tasten`);
