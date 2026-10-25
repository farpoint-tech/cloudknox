import os from "node:os";
import path from "node:path";

/** User home directory (overridable for tests via AI_USAGE_DECK_USER_HOME). */
export const HOME = process.env.AI_USAGE_DECK_USER_HOME ?? os.homedir();

/** Keychain account name; the macOS login user. */
export const USER = os.userInfo().username;

/** Directory holding state.json and history.jsonl. */
export const CONFIG_DIR = process.env.AI_USAGE_DECK_HOME ?? path.join(HOME, ".config", "ai-usage-deck");
export const STATE_FILE = path.join(CONFIG_DIR, "state.json");
export const HISTORY_FILE = path.join(CONFIG_DIR, "history.jsonl");
export const LOCK_FILE = path.join(CONFIG_DIR, "reconcile.lock");

export const CLAUDE_PROJECTS = path.join(HOME, ".claude", "projects");
export const CLAUDE_CRED_FILE = path.join(HOME, ".claude", ".credentials.json");
export const CODEX_SESSIONS = path.join(HOME, ".codex", "sessions");
export const CODEX_AUTH = path.join(HOME, ".codex", "auth.json");
export const COPILOT_DB = path.join(HOME, ".copilot", "data.db");
export const GEMINI_TMP = path.join(HOME, ".gemini", "tmp");
export const GEMINI_OAUTH = path.join(HOME, ".gemini", "oauth_creds.json");
export const GROK_AUTH = path.join(HOME, ".grok", "auth.json");

export const SQLITE_BIN = "/usr/bin/sqlite3";
export const SECURITY_BIN = "/usr/bin/security";
/** gh is usually Homebrew; launchd and Stream Deck do not inherit the shell PATH. */
export const GH_CANDIDATES = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"];
