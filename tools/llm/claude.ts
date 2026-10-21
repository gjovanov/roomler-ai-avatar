// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Claude, headless: one `claude -p` run of Claude Code that answers with JSON matching a schema. It is
// the only LLM call in the pipeline (storyboard.ts). Claude Code authenticates as you are logged in:
// a Claude subscription (`claude` once, then /login) or an API key (ANTHROPIC_API_KEY).
//
// The run gets no tools at all (--tools ""), no MCP servers and no saved session: it reads the prompt
// and answers, so text from a brief cannot make it do anything else. Its event stream is copied to
// `logPath` as it arrives, so a long run can be watched and a failed one read afterwards.
//
// ⚠️ A --json-schema run that cannot produce a valid answer can still end `subtype: success`, with no
// `structured_output` and the model's complaint in `result`. That is an error here, never an empty
// answer.

export interface RunOptions {
  prompt: string;
  /** Working directory of the run (a scratch folder; the run has no file tools anyway). */
  cwd: string;
  /** A model alias (opus, sonnet, haiku, ...) or id, or a comma-separated chain tried in order when one
   *  is out of usage credits. */
  model: string;
  jsonSchema: object;
  maxTurns?: number;
  /** Reasoning effort (CLAUDE_CODE_EFFORT_LEVEL); the CLI's default when omitted. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  timeoutMs?: number;
  logPath?: string;
  /** The binary (default `claude`). */
  bin?: string;
}

export type RunResult =
  | { kind: "ok"; structured: unknown; model?: string; numTurns?: number; costUsd?: number }
  | { kind: "usage_limit"; message: string }
  | { kind: "error"; message: string };

const LIMIT_TEXT = /usage limit|rate[ -]?limit|limit (?:reached|exceeded)|out of (?:extra )?usage|resets? (?:at|in|on)\b|quota/i;
const MODEL_EXHAUSTED = /switch to another model|out of usage credits/i;

/** The argv for one run, the prompt excluded (it goes on stdin). */
export function buildArgs(o: RunOptions, model: string): string[] {
  return [
    "-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--no-session-persistence",
    "--permission-mode", "dontAsk", "--tools", "", "--model", model, "--max-turns", String(o.maxTurns ?? 4),
    "--json-schema", JSON.stringify(o.jsonSchema),
  ];
}

/** What a run's final `type: "result"` event means. */
export function classify(envelope: any, stderr: string): RunResult {
  if (envelope && envelope.type === "result") {
    const text = typeof envelope.result === "string" && envelope.result ? envelope.result : Array.isArray(envelope.errors) ? envelope.errors.join("; ") : "";
    if (!envelope.is_error && envelope.subtype === "success") {
      if (envelope.structured_output === undefined) return { kind: "error", message: `no structured answer after ${envelope.num_turns ?? "?"} turns: ${text.slice(0, 1500) || "(no text)"}` };
      return { kind: "ok", structured: envelope.structured_output, model: envelope.modelUsage ? Object.keys(envelope.modelUsage)[0] : undefined, numTurns: envelope.num_turns, costUsd: envelope.total_cost_usd };
    }
    if (envelope.api_error_status === 429 || LIMIT_TEXT.test(text) || LIMIT_TEXT.test(stderr)) return { kind: "usage_limit", message: (text || stderr).trim().slice(0, 500) };
    return { kind: "error", message: (text || stderr || `subtype ${envelope.subtype}`).trim().slice(0, 2000) };
  }
  if (LIMIT_TEXT.test(stderr)) return { kind: "usage_limit", message: stderr.trim().slice(0, 500) };
  return { kind: "error", message: (stderr || "no result event on stdout (is Claude Code installed and logged in?)").trim().slice(0, 2000) };
}

async function readResult(stdout: ReadableStream<Uint8Array>, sink?: { write(b: Uint8Array): unknown }): Promise<unknown> {
  const dec = new TextDecoder();
  let buf = "", result: unknown = null;
  const take = (line: string) => {
    if (!line.includes('"type":"result"')) return;
    try { const o = JSON.parse(line); if (o?.type === "result") result = o; } catch { /* a partial or foreign line */ }
  };
  const reader = stdout.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    sink?.write(value);
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) { take(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
  }
  buf += dec.decode();
  if (buf.trim()) take(buf);
  return result;
}

async function runOnce(o: RunOptions, model: string): Promise<RunResult> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (o.effort) env.CLAUDE_CODE_EFFORT_LEVEL = o.effort;
  let proc: ReturnType<typeof Bun.spawn<"pipe", "pipe", "pipe">>;
  try {
    proc = Bun.spawn([o.bin ?? "claude", ...buildArgs(o, model)], { cwd: o.cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  } catch (e) {
    return { kind: "error", message: `could not start ${o.bin ?? "claude"} (install Claude Code: https://docs.claude.com/en/docs/claude-code): ${e}` };
  }
  proc.stdin.write(o.prompt);
  await proc.stdin.end();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill(); }, o.timeoutMs ?? 15 * 60_000);
  const sink = o.logPath ? Bun.file(o.logPath).writer() : undefined;
  try {
    const [envelope, stderr] = await Promise.all([readResult(proc.stdout, sink), new Response(proc.stderr).text(), proc.exited]);
    if (timedOut) return { kind: "error", message: `timed out after ${o.timeoutMs ?? 15 * 60_000} ms` };
    return classify(envelope, stderr);
  } finally {
    clearTimeout(timer);
    await sink?.end();
  }
}

/** One structured answer. A model chain moves on only when a model is out of usage credits. */
export async function runClaude(o: RunOptions): Promise<RunResult> {
  let last: RunResult = { kind: "error", message: "no model given" };
  for (const model of o.model.split(",").map((m) => m.trim()).filter(Boolean)) {
    last = await runOnce(o, model);
    if (!(last.kind === "usage_limit" && MODEL_EXHAUSTED.test(last.message))) return last;
  }
  return last;
}
