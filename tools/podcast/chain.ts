#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The studio conversation format's clips as CHAINS: each presenter's clips (talking, tools/avatar/talk.ts, and
// listening, tools/avatar/listen.ts) render in timeline order, and each one CONTINUES the clip before it: its first
// window takes that clip's last 9 frames up to the cut on screen as motion frames (--motion, the wrapper patch in
// tools/avatar/patches/), so the pose and the motion carry over a cut, while the portrait stays the reference of
// every window. Before it, every clip started from the portrait, and each cut between a listening and a talking clip
// jumped back to the portrait's pose ("two diff scenes glued up together", the podcast pilot's owner, 2026-10-27).
// A first chain passed the cut frame as the next clip's START image instead: in InfiniteTalk the start image is the
// reference of every window, so each link made a generated frame the next reference, and by the 13th link the face
// had an orange cast and was no longer his. A chain starts again from the portrait only where the presenter's tile
// was hidden (a demo full frame; for the host also the guest's card beats), where nobody sees the reset.
//
//   bun tools/podcast/chain.ts <plan.json> --dry          talk.ts --dry with the plan's clip settings: the segments
//   bun tools/podcast/chain.ts <plan.json> [--alias-from <old talk dir>] [--plan-only] [--until k] [--need-mb 20000] [--uncapped]
//
// The plan gives the narration, the talk.json, the speakers (host, guest), the faces and the clip settings (plan.ts).
// Resumable: clips are content-addressed (the motion frames are part of the key) and the motion frames are
// re-extracted from cached clips. The machine rules it follows, each paid for during the pilot:
//  - ComfyUI runs under a memory cap, or the chain does not start it (--uncapped to accept that): a systemd user
//    scope (comfy-server.sh), or a root system scope where the user manager is missing (comfy-capped.sh).
//  - ComfyUI is restarted after every clip that rendered: its CUDA pinned host memory and the GPU's spill into shared
//    system memory are outside the cap, PyTorch keeps them until the process exits, and over a chain they piled up to
//    ~60 GB of the host (2026-10-28). A ComfyUI found running at the start is replaced by a capped one.
//  - A clip starts only with --need-mb of the host's memory available, waiting up to 45 min for it: comfy.ts stops a
//    clip under 6 GB, and a clip that fails breaks its presenter's chain, a clip that waits does not. Under WSL the
//    VM's page cache is dropped every 30 s meanwhile (dropcache-loop.sh): WSL does not hand it back to Windows.
//  - AVATAR_GPU_HOLD: a file another job creates to borrow the GPU; while it exists ComfyUI is stopped and the chain
//    waits at the next clip boundary.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { freemem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isWindows, linuxBash, linuxEnvBash, linuxRootBash, linuxRootSh, linuxUser, toLinux } from "../lib/platform.ts";
import { alive, WORK } from "../avatar/comfy.ts";
import { beatAt, faceArg, FPS, loadPlan, resolveBeats, visible } from "./plan.ts";

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith("--")) { console.error("usage: chain.ts <plan.json> [--dry] [--alias-from <old talk dir>] [--plan-only] [--until k] [--need-mb 20000] [--uncapped]"); process.exit(2); }
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const { plan, file: planFile, R } = loadPlan(args[0]);
const ROOT = resolve(import.meta.dir, "..", "..");
const TALK_TS = join(ROOT, "tools", "avatar", "talk.ts"), LISTEN_TS = join(ROOT, "tools", "avatar", "listen.ts");
const COMFY = join(ROOT, "tools", "avatar", "comfy-server.sh"), CAPPED = join(ROOT, "tools", "avatar", "comfy-capped.sh");
const DROPPER = join(ROOT, "tools", "avatar", "dropcache-loop.sh");
const talkFile = R(plan.talk), talkDir = dirname(talkFile);
const narr = plan.narration ? R(plan.narration) : existsSync(talkFile) ? JSON.parse(readFileSync(talkFile, "utf8")).narration : "";
if (!narr || !existsSync(join(narr, "turns.json"))) throw new Error(`no narration (plan.narration, a lines.ts folder): ${narr || "not set"}`);
// --until k: stop after segment k (a test of the first links)
const UNTIL = opt("until") !== undefined ? Number(opt("until")) : Infinity;
const MEM = "24G";
const HOLD = process.env.AVATAR_GPU_HOLD ?? "";
const c = plan.clips ?? {};
const clipsDir = R(c.dir ?? "clips");
const face = faceArg(plan);
const TALK = [
  ...(face ? ["--face", face] : []),
  ...(c.size ? ["--size", c.size] : []),
  ...(c.audio_scale !== undefined ? ["--audio-scale", String(c.audio_scale)] : []),
  ...(c.group_gap !== undefined ? ["--group-gap", String(c.group_gap)] : []),
  "--clips", clipsDir,
  ...(c.negative_extra ? ["--negative-extra", c.negative_extra] : []),
];
const stamp = () => new Date().toISOString().slice(11, 19) + "Z";
const sh = (cmd: string[], quiet = false) => {
  const r = Bun.spawnSync(cmd, { cwd: ROOT, env: process.env, stdout: "pipe", stderr: "pipe" });
  const out = r.stdout.toString() + r.stderr.toString();
  if (!quiet && r.exitCode !== 0) console.log(`  ! ${cmd.slice(0, 3).join(" ")} exit ${r.exitCode}: ${out.split("\n").filter((l) => /error|Error/.test(l)).slice(-2).join(" | ").slice(0, 300)}`);
  return { ok: r.exitCode === 0, out, code: r.exitCode };
};

// --dry: the segments for the plan (talk.ts --dry with the same settings as the chain's clips), then stop.
if (args.includes("--dry")) {
  const r = sh(["bun", TALK_TS, narr, talkDir, ...TALK, "--dry"]);
  console.log(r.out.trim().split("\n").slice(-60).join("\n"));
  process.exit(r.ok ? 0 : 1);
}

const NEED_MB = opt("need-mb") !== undefined ? Number(opt("need-mb")) : 20000;
const avail = () => freemem() / 1048576;
const chainDir = join(talkDir, "chain"); if (!existsSync(chainDir)) mkdirSync(chainDir, { recursive: true });

// ---- ComfyUI: started under a cap, stopped after every rendered clip
let capMode: "user" | "root" | "none" = "none";
let user = "";
async function comfyUp() {
  if (await alive()) return;
  if (capMode === "user") sh(linuxEnvBash({ AVATAR_MEM_MAX: MEM }, COMFY, "start"), true);
  else if (capMode === "root") sh(linuxRootBash(CAPPED, (user ||= linuxUser()), MEM, toLinux(WORK)), true);
  else sh(linuxBash(COMFY, "start"), true);
  for (let i = 0; i < 60; i++) { if (await alive()) return; await Bun.sleep(2000); }
  throw new Error("ComfyUI did not come up");
}
// The stop can time out at the WSL service (Wsl/Service/0x8007274c): try until ComfyUI stops answering.
async function comfyDown() { for (let i = 0; i < 4; i++) { sh(linuxBash(COMFY, "stop"), true); await Bun.sleep(3000); if (!(await alive())) return; await Bun.sleep(10000); } }
const dropCaches = () => { if (isWindows) sh(linuxRootSh("sync; echo 1 > /proc/sys/vm/drop_caches"), true); };
async function roomFor(what: string) {
  if (avail() >= NEED_MB) return;
  dropCaches(); await Bun.sleep(10000);
  if (avail() >= NEED_MB) return;
  const t0 = Date.now();
  console.log(`  ${stamp()} ${what}: waiting for host memory (${avail().toFixed(0)} MB available, want ${NEED_MB})`);
  // a GPU hold placed during the wait is honoured at once
  while (avail() < NEED_MB && Date.now() - t0 < 45 * 60_000) { await Bun.sleep(30000); if (held()) { await holdWait(); await comfyUp(); } }
  console.log(`  ${stamp()} ${what}: ${avail().toFixed(0)} MB available after ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
const held = () => !!HOLD && existsSync(HOLD);
async function holdWait() { if (!held()) return; console.log(`=== ${stamp()} HOLD: ComfyUI stopped until ${HOLD} is gone`); await comfyDown(); while (held()) await Bun.sleep(15000); console.log(`=== ${stamp()} RESUME`); }

// ---- the frame ON SCREEN at a cut, and the motion frames that continue it
// The frame on screen at the cut is the segment's frame n-1 of the COMPOSER's 30 fps stream (compose.ts's n and filter
// prefix), not the clip's last frame: a clip runs up to 71 frames past its segment (the 81/153/225... window grid) and
// the composer trims it. That shown frame is clip frame j at 25 fps; the motion frames are clip frames j-8..j. j comes
// from the fps filter's rounding (input pts rounded to the nearest output tick) and is CONFIRMED against the frame the
// composer's own filters pick, so a rounding edge can never shift the motion by a frame.
const LEAD = 9;
const ff = (a: string[]) => sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...a]);
const rgbSha = (png: string) => createHash("sha256").update(Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdout: "pipe" }).stdout).digest("hex");
function motionFrames(clip: string, s: any, apng: string): string {
  const n = Math.round(s.end * FPS) - Math.round(s.start * FPS);
  const shown = join(chainDir, "shown.png"), probe = join(chainDir, "probe.png");
  rmSync(shown, { force: true });
  ff(["-i", clip, "-vf", `fps=${FPS},tpad=stop_mode=clone:stop_duration=2,select=eq(n\\,${n - 1})`, "-fps_mode", "passthrough", "-frames:v", "1", "-update", "1", shown]);
  if (!existsSync(shown)) throw new Error(`no shown frame ${n - 1} of ${clip}`);
  const want = rgbSha(shown);
  const guess = Math.ceil((n - 1 + 0.5) * 25 / FPS) - 1;
  let j = -1;
  for (const cand of [guess, guess - 1, guess + 1, guess - 2, guess + 2]) {
    rmSync(probe, { force: true });
    ff(["-i", clip, "-vf", `select=eq(n\\,${cand})`, "-fps_mode", "passthrough", "-frames:v", "1", "-update", "1", probe]);
    if (existsSync(probe) && rgbSha(probe) === want) { j = cand; break; }
  }
  if (j < 0) throw new Error(`${clip}: no 25 fps frame matches the shown frame ${n - 1} (guess ${guess})`);
  const k = j >= LEAD - 1 ? LEAD : j >= 4 ? 5 : 1;
  rmSync(apng, { force: true });
  ff(["-i", clip, "-vf", `select=between(n\\,${j - k + 1}\\,${j})`, "-fps_mode", "passthrough", "-plays", "0", "-f", "apng", apng]);
  if (!existsSync(apng)) throw new Error(`no motion frames from ${clip}`);
  return `${j - k + 1}..${j}`;
}

// ---- the segments (talk.ts --dry) and the plan's layouts
if (!existsSync(talkFile)) throw new Error(`no ${talkFile}: run chain.ts ${planFile} --dry first`);
const talk0 = JSON.parse(readFileSync(talkFile, "utf8"));
const newTurns = JSON.parse(readFileSync(join(narr, "turns.json"), "utf8"));
const beats = resolveBeats(plan, newTurns);
const lay = (turn: number) => beatAt(beats, turn).layout;
const segs: any[] = talk0.segments;
for (const sp of new Set(segs.map((s) => s.speaker))) if (sp !== plan.host && sp !== plan.guest) throw new Error(`the narration's speaker "${sp}" is neither the plan's host nor its guest`);
const WHO = [plan.host, plan.guest];
const shows = (who: string, s: any) => visible(plan, who, lay(s.turn), s.speaker);
const last: Record<string, { k: number; apng: string } | undefined> = {};
let n = 0, failedInRow = 0, lastRendered = false;

// --alias-from <old talk dir>: a clip of an older edition is reused for a segment that is the same in every way that
// shapes a clip: the same turns, the same takes (byte-identical line wavs), the same frame count, and the same start
// (a fresh chain start, or the previous clip of this presenter was itself reused, so its motion frames are the old
// ones). Only the narration's overall gain differs (lines.ts normalises the whole narration), which changes every
// segment's audio bytes, so without this every clip would render again. Segments are matched by number: after an
// inserted or deleted line, nothing later is reused.
const ALIAS_FROM = opt("alias-from") ? resolve(opt("alias-from")!) : "";
if (ALIAS_FROM && resolve(ALIAS_FROM) === resolve(talkDir)) throw new Error("--alias-from names this edition's own talk folder: give the previous edition's");
const old = ALIAS_FROM ? (() => {
  const t = JSON.parse(readFileSync(join(ALIAS_FROM, "talk.json"), "utf8"));
  const lf = join(ALIAS_FROM, "listen.json");
  if (!existsSync(lf)) console.log(`  ${ALIAS_FROM} has no listen.json: no listening clip is reused`);
  if (!existsSync(join(t.narration, "turns.json"))) console.log(`  the old narration ${t.narration} is gone: no clip is reused`);
  return {
    talk: t, listen: existsSync(lf) ? JSON.parse(readFileSync(lf, "utf8")) : {}, narr: t.narration as string,
    turns: existsSync(join(t.narration, "turns.json")) ? JSON.parse(readFileSync(join(t.narration, "turns.json"), "utf8")) : [],
  };
})() : null;
const fileSha = (f: string) => existsSync(f) ? createHash("sha256").update(readFileSync(f)).digest("hex") : "";
const sameTake = (t: number) => !!old && fileSha(join(old.narr, "lines", `l${t + 1}.wav`)) === fileSha(join(narr, "lines", `l${t + 1}.wav`)) && fileSha(join(old.narr, "lines", `l${t + 1}.wav`)) !== "";
const reused: Record<string, number | undefined> = {};
function aliasFor(s: any, who: string, chained: boolean): string {
  if (!old) return "";
  const o = old.talk.segments.find((x: any) => x.k === s.k);
  if (!o || JSON.stringify(o.turns) !== JSON.stringify(s.turns)) return "";
  // the same timing, or the same segment moved by a whole number of video frames (a re-voiced stretch before it):
  // what must match is the frame count the composer shows, which fixes the shown frames and so the motion frames.
  // Segment bounds are midpoints between turns rounded to the ms, so an exact 4.900 s shift reads 4.899-4.901 s, and
  // an END up to 20 ms off is a few ms more or less trailing silence where the next turn was re-voiced.
  const shift = s.start - o.start;
  const frames = (x: any) => Math.round(x.end * FPS) - Math.round(x.start * FPS);
  if (Math.abs(s.end - o.end - shift) > 0.02 || Math.abs(shift * FPS - Math.round(shift * FPS)) > 0.06 || frames(s) !== frames(o)) return "";
  if (s.turns.some((t: number) => old.turns[t]?.text !== newTurns[t]?.text || old.turns[t]?.speaker !== newTurns[t]?.speaker || !sameTake(t))) return "";
  if (chained && reused[who] !== s.k - 1) return "";
  const clip = s.speaker === who ? old.talk.clips[`seg${String(s.k).padStart(2, "0")}-${who}`]?.clip : (old.listen[s.k]?.speaker === who ? old.listen[s.k].clip : "");
  return clip && existsSync(clip) ? clip : "";
}
// --plan-only: print which clips would be reused and which rendered, then stop (no GPU, no ComfyUI, no cache loop).
if (args.includes("--plan-only")) {
  const lastK: Record<string, number | undefined> = {}, rows: string[] = [];
  let render = 0, reuse = 0;
  for (const s of segs) for (const who of WHO) {
    if (s.k > UNTIL) continue;
    if (!shows(who, s)) continue;
    const chained = lastK[who] === s.k - 1;
    const a = aliasFor(s, who, chained);
    reused[who] = a ? s.k : undefined; lastK[who] = s.k;
    if (a) reuse++; else { render++; rows.push(`seg${s.k}:${who}${s.speaker === who ? "(speak)" : "(listen)"}`); }
  }
  console.log(`reuse ${reuse}, render ${render}: ${rows.join(" ")}`);
  process.exit(0);
}

// ---- the render run
// The cap, decided once: comfy-server.sh's own (a systemd user scope), else a root system scope, else none at all.
{
  const note = sh(linuxBash(COMFY, "cap"), true).out.trim();
  if (note.startsWith("capped")) capMode = "user";
  else if (sh(isWindows ? linuxRootSh("true") : ["sudo", "-n", "true"], true).ok) capMode = "root";
  else if (!args.includes("--uncapped")) throw new Error(`ComfyUI would run ${note}, and there is no root to start it in a capped scope: fix that, or pass --uncapped`);
  console.log(`=== ${stamp()} ComfyUI: ${capMode === "user" ? note : capMode === "root" ? `capped at ${MEM} in a root system scope (comfy-capped.sh)` : "UNCAPPED (--uncapped)"}`);
}
// Every clip reference goes, and the chain registers its own (cached clips come back at once by their keys): talk.ts
// --dry wrote references computed without motion frames, and a stale one must never reach the composer.
{
  const t = JSON.parse(readFileSync(talkFile, "utf8"));
  t.clips = {}; writeFileSync(talkFile, JSON.stringify(t, null, 1));
  rmSync(join(talkDir, "listen.json"), { force: true });
}
const stopDropper = () => { if (isWindows) sh(linuxRootSh("pkill -f '[d]ropcache-loop.sh'"), true); };
stopDropper();
const dropper = isWindows ? Bun.spawn(linuxRootBash(DROPPER, "43200"), { stdout: "ignore", stderr: "ignore" }) : null;
process.on("exit", () => { try { dropper?.kill(); } catch {} stopDropper(); });
// A ComfyUI already running may be uncapped, or holding memory from earlier work: start from a fresh, capped one.
if (await alive()) { console.log(`=== ${stamp()} a ComfyUI is running: replaced by a fresh one under the cap`); await comfyDown(); }

for (const s of segs) {
  if (s.k > UNTIL) break;
  for (const who of WHO) {
    if (!shows(who, s)) continue;
    const prev = last[who];
    const chained = prev && prev.k === s.k - 1;   // contiguous: the tile never left the screen
    const motionArgs = chained ? ["--motion", prev!.apng] : [];
    await holdWait();
    if (lastRendered) { await comfyDown(); lastRendered = false; }
    await comfyUp();
    n++;
    const speaks = s.speaker === who;
    const alias = aliasFor(s, who, !!chained);
    const aliasArgs = alias ? ["--alias", alias] : [];
    const cmd = speaks
      ? ["bun", TALK_TS, narr, talkDir, ...TALK, "--only", String(s.k), ...motionArgs, ...aliasArgs]
      : ["bun", LISTEN_TS, talkFile, planFile, ...(face ? ["--face", face] : []), "--clips", clipsDir, "--only", String(s.k), ...motionArgs, ...aliasArgs];
    // A clip the memory guard (comfy.ts) stopped is retried after the host has room again (roomFor); any other failure
    // gets one retry after 60 s (with the host out of memory, every render process once exited at the same moment and
    // a chain without that pause raced through 33 segments in five minutes), and a manifest entry is never trusted
    // after a failure.
    let r: { ok: boolean; out: string; code: number | null } = { ok: false, out: "", code: null };
    let other = 0;
    for (let attempt = 1; attempt <= 6; attempt++) {
      if (held()) { await holdWait(); await comfyUp(); }
      await roomFor(`seg${s.k} ${who}`);
      r = sh(cmd);
      if (r.ok) break;
      if (/interrupted, the host has/.test(r.out)) console.log(`  ${stamp()} the host memory guard stopped seg${s.k} ${who}, retry ${attempt}/6`);
      else if (++other > 1) break;
      else { console.log(`  ${stamp()} seg${s.k} ${who} failed (exit ${r.code}), one retry in 60 s`); await Bun.sleep(60000); }
      await comfyUp();
    }
    reused[who] = r.ok && alias ? s.k : undefined;   // (--plan-only above simulates this with r.ok = true)
    if (/of video in \d+ s|\d+\.\d+ s in \d+ s ->/.test(r.out)) lastRendered = true;
    if (alias) console.log(`           seg${s.k} ${who} reuses the old clip ${alias.split(/[\\/]/).pop()}`);
    failedInRow = r.ok ? 0 : failedInRow + 1;
    if (failedInRow >= 3) { console.log(`=== ${stamp()} three clips failed in a row: the chain stops here (it resumes from the cache)`); await comfyDown(); process.exit(2); }
    let clip = "";
    if (speaks) {
      const t = JSON.parse(readFileSync(talkFile, "utf8"));
      clip = r.ok ? (t.clips[`seg${String(s.k).padStart(2, "0")}-${who}`]?.clip ?? "") : "";
      console.log(`${stamp()} seg${String(s.k).padStart(2)} ${who.padEnd(7)} speak  ${chained ? "continues" : "portrait"} ${r.ok ? (r.out.match(/(\d+\.\d+) s of video in (\d+) s/)?.[0] ?? "cached") : "FAILED"}`);
    } else {
      const lf = join(talkDir, "listen.json");
      clip = r.ok && existsSync(lf) ? (JSON.parse(readFileSync(lf, "utf8"))[s.k]?.clip ?? "") : "";
      console.log(`${stamp()} seg${String(s.k).padStart(2)} ${who.padEnd(7)} listen ${chained ? "continues" : "portrait"} ${r.ok ? (r.out.match(/(calm|amused)[^\n]*/)?.[0]?.slice(0, 60) ?? "") : "FAILED"}`);
    }
    if (clip && existsSync(clip)) {
      const apng = join(chainDir, `${who}-seg${String(s.k).padStart(2, "0")}-motion.png`);
      const f = motionFrames(clip, s, apng);
      console.log(`           next ${who} clip continues frames ${f} of ${clip.split(/[\\/]/).pop()}`);
      last[who] = { k: s.k, apng };
    } else {
      last[who] = undefined;   // a failed clip breaks the chain: the next one starts from the portrait
    }
  }
}
await comfyDown();
console.log(`=== ${stamp()} chain done (${n} clips)`);
