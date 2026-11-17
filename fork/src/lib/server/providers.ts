import "server-only";
/**
 * Provider registry. Both providers are local CLIs logged in with the
 * operator's subscriptions — Claude Code (`claude -p`) and OpenAI Codex
 * (`codex exec`). No API keys anywhere.
 */
import { claudeAvailable, runClaude } from "./claude";
import { codexAvailable, runCodex } from "./codex";

export type Provider = "claude" | "codex";
export type ProviderMode = "mixed" | "claude" | "codex";

export interface ProviderCall {
  prompt: string;
  system: string;
  schema?: object;
  /** research step only */
  webSearch?: boolean;
  /** claude only: model override (codex uses FORK_CODEX_MODEL) */
  model?: string;
  timeoutMs?: number;
}

export interface ProviderResult<T> {
  structured: T | null;
  text: string;
  model: string;
  provider: Provider;
  costUsd: number | null;
  durationMs: number;
}

export function providerStatus() {
  const c = claudeAvailable();
  const x = codexAvailable();
  return { claude: c.available, claudeVersion: c.version, codex: x.available, codexVersion: x.version };
}

export function availableProviders(): Provider[] {
  const s = providerStatus();
  return [...(s.claude ? (["claude"] as const) : []), ...(s.codex ? (["codex"] as const) : [])];
}

/** Which providers a mode may use, given what is installed. Empty → demo engine. */
export function providersFor(mode: ProviderMode): Provider[] {
  const avail = availableProviders();
  if (mode === "mixed") return avail;
  return avail.includes(mode) ? [mode] : [];
}

export async function runProvider<T>(p: Provider, call: ProviderCall): Promise<ProviderResult<T>> {
  if (p === "codex") return runCodex<T>(call);
  const r = await runClaude<T>({ prompt: call.prompt, system: call.system, schema: call.schema, tools: call.webSearch ? ["WebSearch"] : [], model: call.model, timeoutMs: call.timeoutMs });
  return { ...r, provider: "claude" };
}

export const PROVIDER_LABEL: Record<Provider, string> = { claude: "claude -p", codex: "codex exec" };
