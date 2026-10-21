// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// A small client for the ComfyUI server that tools/avatar/comfy-server.sh runs (in WSL on Windows,
// directly on Linux), plus the paths every avatar tool shares. The tools build API-format workflows
// (workflows.ts), queue them here, and read the files they wrote from AVATAR_WORK, which both sides see.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { freemem, homedir } from "node:os";

export const ROOT = resolve(import.meta.dir, "..", "..");
export const COMFY = process.env.AVATAR_COMFY_URL ?? "http://127.0.0.1:8188";
/** ComfyUI's input and output folders. On Windows the server reaches them through /mnt/c/... */
export const WORK = resolve(process.env.AVATAR_WORK ?? join(homedir(), "roomler-avatar-work"));
export const INPUT = join(WORK, "input"), OUTPUT = join(WORK, "output");

/** The presenters: presenters/presenters.json, or a registry of your own (AVATAR_PRESENTERS). */
export const PRESENTERS = resolve(process.env.AVATAR_PRESENTERS ?? join(ROOT, "presenters", "presenters.json"));
export function loadPresenters(): Record<string, any> {
  const reg = JSON.parse(readFileSync(PRESENTERS, "utf8"));
  delete reg._note;
  return reg;
}

/** A real person's face never enters a repository: a presenter whose portrait is "private:<file>" keeps
 *  it in AVATAR_PRIVATE (default ~/roomler-avatar-private). Other portraits are relative to the
 *  registry's folder, or absolute. */
export const PRIVATE = resolve(process.env.AVATAR_PRIVATE ?? join(homedir(), "roomler-avatar-private"));
export function portraitFile(portrait: string): string {
  if (portrait.startsWith("private:")) return join(PRIVATE, portrait.slice("private:".length));
  return isAbsolute(portrait) ? portrait : join(dirname(PRESENTERS), portrait);
}

/** An API-format workflow: node id -> class and inputs; a link is [node id, output index]. */
export type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;
export type Link = [string, number];

/** Puts a file into ComfyUI's input directory under a content-addressed name, so a node that loads
 *  it by name never reads a stale file of the same name. Returns the name a loader node takes. */
export function stage(file: string): string {
  const abs = resolve(file);
  const h = createHash("sha256").update(readFileSync(abs)).digest("hex").slice(0, 12);
  const name = `${h}-${basename(abs).replace(/[^\w.-]+/g, "_")}`;
  mkdirSync(INPUT, { recursive: true });
  const dst = join(INPUT, name);
  if (!existsSync(dst) || statSync(dst).size !== statSync(abs).size) copyFileSync(abs, dst);
  return name;
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${COMFY}${path}`, init);
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<any>;
}

export async function alive(): Promise<boolean> {
  try { await api("/system_stats"); return true; } catch { return false; }
}

/** The host-memory floor under which a running workflow is interrupted (MB the host still has
 *  available; AVATAR_MIN_FREE_MB, 0 turns the guard off). */
export const MIN_FREE_MB = Number(process.env.AVATAR_MIN_FREE_MB ?? 6000);

/** Queues a workflow and waits for it. Throws with ComfyUI's own error text when a node fails. */
export async function run(wf: Workflow, { timeoutMs = 4 * 3600_000, label = "workflow", poll = 2000 } = {}) {
  const q = await api("/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: wf, client_id: "roomler-ai-avatar" }) });
  if (q.node_errors && Object.keys(q.node_errors).length) throw new Error(`${label}: node errors ${JSON.stringify(q.node_errors).slice(0, 2000)}`);
  const id: string = q.prompt_id;
  const t0 = Date.now();
  let down = 0, low = 0;
  for (;;) {
    // The host's memory floor. A talking-clip render fills a 24 GB GPU and spills past it into the
    // host's memory (3-5 GB measured). With the host already paging hard under other work, the GPU
    // once timed out (a TDR) and the machine hung and reset. Three polls in a row under the floor
    // interrupt the run and clear the queue instead.
    const freeMb = freemem() / 1048576;
    if (MIN_FREE_MB <= 0 || freeMb >= MIN_FREE_MB) low = 0;
    else if (++low >= 3) {
      await fetch(`${COMFY}/interrupt`, { method: "POST" }).catch(() => {});
      await fetch(`${COMFY}/queue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clear: true }) }).catch(() => {});
      throw new Error(`${label}: interrupted, the host has ${freeMb.toFixed(0)} MB available (AVATAR_MIN_FREE_MB=${MIN_FREE_MB})`);
    }
    // The server keeps working through a laptop sleep, but the first polls after the wake are
    // refused while WSL's network comes back. Keep asking for up to ten minutes before giving up.
    let h: any;
    try { h = await api(`/history/${id}`); down = 0; } catch (e) {
      if (++down * poll > 600_000) throw e;
      await Bun.sleep(poll);
      continue;
    }
    const e = h[id];
    if (e?.status?.completed || e?.status?.status_str === "error") {
      if (e.status.status_str === "error") {
        const msg = (e.status.messages ?? []).find((m: any) => m[0] === "execution_error")?.[1];
        throw new Error(`${label}: ${msg ? `${msg.node_type} (node ${msg.node_id}): ${msg.exception_message}` : JSON.stringify(e.status).slice(0, 1500)}`);
      }
      return { id, seconds: (Date.now() - t0) / 1000, outputs: e.outputs as Record<string, any> };
    }
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label}: no result after ${timeoutMs / 1000} s (prompt ${id})`);
    await Bun.sleep(poll);
  }
}

/** The files a finished run wrote (SaveImage's `images`, VideoHelperSuite's `gifs`), as local paths. */
export function files(outputs: Record<string, any>): string[] {
  const out: string[] = [];
  for (const o of Object.values(outputs)) {
    for (const f of [...(o.images ?? []), ...(o.gifs ?? [])]) {
      if (f.type !== "output") continue;
      out.push(join(OUTPUT, f.subfolder ?? "", f.filename));
    }
  }
  return out;
}

/** Unloads every model and frees VRAM (before each talking clip, and before handing the GPU back). */
export async function free() {
  await fetch(`${COMFY}/free`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unload_models: true, free_memory: true }) });
}
