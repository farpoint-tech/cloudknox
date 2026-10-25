import { execFile } from "node:child_process";
import { SECURITY_BIN, USER } from "./paths.js";

export type SecretResult =
	| { status: "found"; value: string }
	| { status: "missing" }
	| { status: "error"; detail: string };

/** Services that must never be read (reading them opens a blocking keychain dialog). */
const FORBIDDEN = new Set(["github-copilot-app"]);

/**
 * Reads a generic password from the login keychain without user interaction.
 * Never logs or returns the secret anywhere except the resolved value.
 */
export function readSecret(service: string): Promise<SecretResult> {
	if (FORBIDDEN.has(service)) {
		return Promise.resolve({ status: "error", detail: `service ${service} is blocked` });
	}
	return new Promise((resolve) => {
		execFile(
			SECURITY_BIN,
			["find-generic-password", "-s", service, "-a", USER, "-w"],
			{ timeout: 5000, maxBuffer: 1024 * 1024 },
			(err, stdout) => {
				if (err) {
					const code = (err as { code?: unknown }).code;
					// 44 = errSecItemNotFound
					if (code === 44) return resolve({ status: "missing" });
					if ((err as { killed?: boolean }).killed) return resolve({ status: "error", detail: "keychain timeout" });
					return resolve({ status: "error", detail: `security exit ${String(code)}` });
				}
				const value = stdout.replace(/\n$/, "");
				resolve(value ? { status: "found", value } : { status: "missing" });
			},
		);
	});
}
