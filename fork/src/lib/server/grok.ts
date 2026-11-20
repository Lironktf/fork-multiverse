import "server-only";
/**
 * Model provider: the local xAI Grok CLI (`grok -p`), authenticated with the
 * operator's grok.com login. No API keys.
 *
 * Isolation:
 *   - runs in an empty temp working directory (no project rules discovered)
 *   - Claude/Cursor compatibility discovery disabled via env (GROK_CLAUDE_*_ENABLED=false),
 *     so the operator's ~/.claude/CLAUDE.md is NOT sent with forecasts
 *   - --sandbox read-only, --no-subagents, --system-prompt-override
 *   - analysts: --tools "" --disable-web-search; research: --tools web_search,web_fetch only
 *   - --json-schema → reads `structuredOutput` from the JSON result
 * Requires grok CLI ≥ 1.0.13 (older versions are rejected by the xAI backend with HTTP 426).
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderCall, ProviderResult } from "./providers";

const GROK_BIN = process.env.FORK_GROK_BIN ?? "grok";
const ROOT = join(tmpdir(), "fork-grok-cwd");
const MAX_CONCURRENCY = Number(process.env.FORK_GROK_CONCURRENCY ?? 4);

const COMPAT_OFF: Record<string, string> = Object.fromEntries(
  ["CLAUDE", "CURSOR"].flatMap((v) =>
    ["AGENTS", "HOOKS", "MCPS", "RULES", "SKILLS"].map((c) => [`GROK_${v}_${c}_ENABLED`, "false"]),
  ),
);

let available: boolean | null = null;
let version: string | null = null;

export function grokAvailable(): { available: boolean; version: string | null } {
  if (process.env.FORK_ENGINE === "demo" || process.env.FORK_GROK === "0") return { available: false, version: null };
  if (available === null) {
    try {
      version = execFileSync(GROK_BIN, ["--version"], { timeout: 10_000 }).toString().trim();
      // `grok models` prints "You are logged in …" only when authenticated
      const models = execFileSync(GROK_BIN, ["models"], { timeout: 20_000, env: { ...process.env, ...COMPAT_OFF } }).toString();
      available = /logged in/i.test(models);
    } catch {
      available = false;
    }
  }
  return { available, version };
}

let active = 0;
const queue: (() => void)[] = [];
async function acquire() {
  if (active < MAX_CONCURRENCY) {
    active++;
    return;
  }
  await new Promise<void>((r) => queue.push(r));
  active++;
}
function release() {
  active--;
  queue.shift()?.();
}

function stripSchemaKey(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSchemaKey);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "$schema").map(([k, v]) => [k, stripSchemaKey(v)]));
}

interface GrokJson {
  type?: string;
  message?: string;
  text?: string;
  structuredOutput?: unknown;
  total_cost_usd?: number;
  modelUsage?: Record<string, unknown>;
}

export async function runGrok<T = unknown>(call: ProviderCall): Promise<ProviderResult<T>> {
  mkdirSync(ROOT, { recursive: true });
  const dir = mkdtempSync(join(ROOT, "run-"));
  const args = [
    "-p",
    call.prompt,
    "--system-prompt-override",
    call.system,
    "--no-subagents",
    "--sandbox",
    "read-only",
    "--output-format",
    "json",
    "--max-turns",
    call.webSearch ? "8" : "2",
  ];
  const model = process.env.FORK_GROK_MODEL;
  if (model) args.push("-m", model);
  // measured 2026-11-19 on the analyst schema: default effort 128s/2 turns, low 26s/1 turn
  args.push("--reasoning-effort", process.env.FORK_GROK_EFFORT ?? "low");
  if (call.webSearch) args.push("--tools", "web_search,web_fetch", "--always-approve");
  else args.push("--tools", "", "--disable-web-search");
  if (call.schema) args.push("--json-schema", JSON.stringify(stripSchemaKey(call.schema)));

  await acquire();
  const started = Date.now();
  try {
    return await new Promise<ProviderResult<T>>((resolve, reject) => {
      const child = spawn(GROK_BIN, args, { cwd: dir, env: { ...process.env, ...COMPAT_OFF }, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`grok -p timed out after ${(call.timeoutMs ?? 180_000) / 1000}s`));
      }, call.timeoutMs ?? 180_000);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        let j: GrokJson | null = null;
        try {
          j = JSON.parse(out) as GrokJson;
        } catch {
          /* fallthrough */
        }
        if (!j || j.type === "error" || code !== 0) {
          const msg = (j?.message ?? err.trim().split("\n").slice(-2).join(" ")) || "no output";
          return reject(new Error(`grok -p exited ${code}: ${msg.replace(/\s+/g, " ").slice(0, 300)}`));
        }
        let structured: T | null = null;
        if (call.schema) {
          structured = (j.structuredOutput as T) ?? null;
          if (structured === null && j.text) {
            try {
              structured = JSON.parse(j.text) as T;
            } catch {
              /* not JSON */
            }
          }
          if (structured === null) return reject(new Error("grok -p returned no structured output"));
        }
        const used = Object.keys(j.modelUsage ?? {})[0] ?? model ?? "grok";
        resolve({ structured, text: j.text ?? "", model: used, provider: "grok", costUsd: j.total_cost_usd ?? null, durationMs: Date.now() - started });
      });
    });
  } finally {
    release();
    rmSync(dir, { recursive: true, force: true });
  }
}
