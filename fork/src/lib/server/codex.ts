import "server-only";
/**
 * Model provider: the local OpenAI Codex CLI (`codex exec`), authenticated with
 * the operator's ChatGPT login. No API keys.
 *
 * Isolation:
 *   - runs in an empty temp working directory (no project AGENTS.md is discovered)
 *   - --sandbox read-only, --ephemeral, --ignore-rules, --skip-git-repo-check
 *   - --output-schema <file> for strict structured output; -o captures the final message
 *   - web search only when asked (research step): -c web_search="live"
 * Codex has no system-prompt flag, so role instructions are prefixed to the prompt.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderCall, ProviderResult } from "./providers";

const CODEX_BIN = process.env.FORK_CODEX_BIN ?? "codex";
const ROOT = join(tmpdir(), "fork-codex-cwd");
const MAX_CONCURRENCY = Number(process.env.FORK_CODEX_CONCURRENCY ?? 4);

let available: boolean | null = null;
let version: string | null = null;

export function codexAvailable(): { available: boolean; version: string | null } {
  if (process.env.FORK_ENGINE === "demo" || process.env.FORK_CODEX === "0") return { available: false, version: null };
  if (available === null) {
    try {
      version = execFileSync(CODEX_BIN, ["--version"], { timeout: 10_000 }).toString().trim();
      // logged in? `codex login status` exits non-zero when not authenticated
      execFileSync(CODEX_BIN, ["login", "status"], { timeout: 10_000, stdio: "ignore" });
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

/** OpenAI strict structured outputs: every object closed and every property required. */
function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== "object") return node;
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) if (k !== "$schema") o[k] = strictify(v);
  if (o.type === "object" && o.properties && typeof o.properties === "object") {
    o.additionalProperties = false;
    o.required = Object.keys(o.properties as object);
  }
  return o;
}

export async function runCodex<T = unknown>(call: ProviderCall): Promise<ProviderResult<T>> {
  mkdirSync(ROOT, { recursive: true });
  const dir = mkdtempSync(join(ROOT, "run-"));
  const outFile = join(dir, "last-message.txt");
  const args = ["exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--ignore-rules", "--color", "never", "-C", dir, "-o", outFile];
  const model = process.env.FORK_CODEX_MODEL;
  if (model) args.push("-m", model);
  args.push("-c", `model_reasoning_effort="${process.env.FORK_CODEX_EFFORT ?? "low"}"`);
  args.push("-c", `web_search="${call.webSearch ? "live" : "disabled"}"`);
  if (call.schema) {
    const schemaFile = join(dir, "schema.json");
    writeFileSync(schemaFile, JSON.stringify(strictify(call.schema)));
    args.push("--output-schema", schemaFile);
  }
  args.push("-"); // prompt on stdin

  await acquire();
  const started = Date.now();
  try {
    return await new Promise<ProviderResult<T>>((resolve, reject) => {
      const child = spawn(CODEX_BIN, args, { cwd: dir, env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"] });
      let log = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`codex exec timed out after ${(call.timeoutMs ?? 180_000) / 1000}s`));
      }, call.timeoutMs ?? 180_000);
      child.stdout.on("data", (d) => (log += d));
      child.stderr.on("data", (d) => (log += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        let text = "";
        try {
          text = readFileSync(outFile, "utf8").trim();
        } catch {
          /* no final message */
        }
        if (code !== 0 || !text) return reject(new Error(`codex exec exited ${code}: ${log.split("\n").filter((l) => /error/i.test(l)).slice(-2).join(" ").slice(0, 300) || "no output"}`));
        const used = /^model:\s*(\S+)/m.exec(log)?.[1] ?? model ?? "codex";
        let structured: T | null = null;
        if (call.schema) {
          try {
            structured = JSON.parse(text) as T;
          } catch {
            return reject(new Error("codex exec returned non-JSON output for a structured call"));
          }
        }
        resolve({ structured, text, model: used, provider: "codex", costUsd: null, durationMs: Date.now() - started });
      });
      child.stdin.end(`${call.system}\n\n---\n\n${call.prompt}`);
    });
  } finally {
    release();
    rmSync(dir, { recursive: true, force: true });
  }
}
