import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const tests = process.argv.includes("--tests");
const common = {
	bundle: true,
	platform: "node",
	target: "node20",
	format: "esm",
	sourcemap: false,
	logLevel: "warning",
	external: ["bufferutil", "utf-8-validate"],
	// ws is CommonJS; give bundled require() a real implementation in ESM output.
	banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
};

if (tests) {
	const entries = fs.readdirSync("test").filter((f) => f.endsWith(".test.ts")).map((f) => path.join("test", f));
	fs.rmSync("test-dist", { recursive: true, force: true });
	await build({ ...common, entryPoints: entries, outdir: "test-dist", outExtension: { ".js": ".mjs" } });
} else {
	const plugin = "tech.farpoint.ai-usage.sdPlugin";
	await build({ ...common, entryPoints: ["src/plugin.ts"], outfile: `${plugin}/bin/plugin.js` });
	await build({ ...common, entryPoints: ["src/cli.ts"], outfile: `${plugin}/bin/cli.js` });
	await build({ ...common, entryPoints: ["src/cli.ts"], outfile: "bin/cli.js" });
	fs.writeFileSync(`${plugin}/bin/package.json`, JSON.stringify({ type: "module" }, null, 2) + "\n");
	console.log("built plugin.js + cli.js");
}
