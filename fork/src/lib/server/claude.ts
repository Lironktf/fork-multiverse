import "server-only";
/**
 * Model provider: the local Claude Code CLI in print mode (`claude -p`),
 * which authenticates with the operator's Claude subscription. No API keys.
 *
 * Isolation flags:
 *   --setting-sources ""     do not load user/project settings or CLAUDE.md
 *   --system-prompt          replace the coding-agent system prompt with the analyst role
 *   --tools ""               no tools for analysts (research step enables WebSearch only)
 *   --no-session-persistence nothing written to the session history
 *   --json-schema            structured output, returned as `structured_output`
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLAUDE_BIN = process.env.FORK_CLAUDE_BIN ?? "claude";
const WORKDIR = join(tmpdir(), "fork-claude-cwd");
const MAX_CONCURRENCY = Number(process.env.FORK_CLAUDE_CONCURRENCY ?? 4);

let available: boolean | null = null;
let version: string | null = null;

export function claudeAvailable(): { available: boolean; version: string | null } {
  if (process.env.FORK_ENGINE === "demo") return { available: false, version: null };
  if (available === null) {
    try {
      version = execFileSync(CLAUDE_BIN, ["--version"], { timeout: 10_000 }).toString().trim();
      available = true;
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

export interface ClaudeCall {
  prompt: string;
  system: string;
  model?: string;
  schema?: object;
  tools?: string[]; // e.g. ["WebSearch"]
  timeoutMs?: number;
}

export interface ClaudeResult<T> {
  provider?: "claude";
  structured: T | null;
  text: string;
  model: string;
  costUsd: number | null;
  durationMs: number;
}

export async function runClaude<T = unknown>(call: ClaudeCall): Promise<ClaudeResult<T>> {
  mkdirSync(WORKDIR, { recursive: true });
  const model = call.model ?? process.env.FORK_CLAUDE_MODEL ?? "sonnet";
  const args = [
    "-p",
    "--model",
    model,
    "--output-format",
    "json",
    "--no-session-persistence",
    "--setting-sources",
    "",
    "--system-prompt",
    call.system,
    "--tools",
    (call.tools ?? []).join(","),
  ];
  if (call.tools?.length) args.push("--allowedTools", call.tools.join(","));
  if (call.schema) {
    // the CLI's validator rejects the draft-2020-12 meta-schema URI that zod emits
    const { $schema: _drop, ...schema } = call.schema as Record<string, unknown>;
    void _drop;
    args.push("--json-schema", JSON.stringify(schema));
  }

  await acquire();
  const started = Date.now();
  try {
    return await new Promise<ClaudeResult<T>>((resolve, reject) => {
      const child = spawn(CLAUDE_BIN, args, { cwd: WORKDIR, env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`claude -p timed out after ${(call.timeoutMs ?? 180_000) / 1000}s`));
      }, call.timeoutMs ?? 180_000);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(out);
          if (json.is_error) return reject(new Error(`claude -p error: ${String(json.result ?? json.subtype).slice(0, 300)}`));
          const used = Object.keys(json.modelUsage ?? {})[0] ?? model;
          resolve({
            structured: (json.structured_output ?? null) as T | null,
            text: String(json.result ?? ""),
            model: used,
            costUsd: typeof json.total_cost_usd === "number" ? json.total_cost_usd : null,
            durationMs: Date.now() - started,
          });
        } catch {
          reject(new Error(`claude -p exited ${code}: ${(err || out).slice(0, 300)}`));
        }
      });
      child.stdin.end(call.prompt);
    });
  } finally {
    release();
  }
}
