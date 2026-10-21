#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The presenters' talking clips for a narration (a tools/voice/lines.ts output folder). One clip per
// turn, tiling the timeline (lib.segments): the turn's speaker, from the middle of the silence before
// the turn to the middle of the silence after it, so a cut between clips always lands in silence.
// Clips are cached by a hash of everything that shapes them, so a re-run renders only what changed.
//
//   bun tools/avatar/talk.ts <narration dir> <out dir> [--size 640x640] [--steps 6] [--shift 11]
//        [--seed 7] [--swap 8] [--attn sageattn] [--only 0,3] [--idle 0] [--tail 1.0]
//        [--face <speaker>=<presenter>[,<presenter>...]] [--clips <dir>] [--reuse <old talk.json>]
//        [--audio-scale 1] [--group-gap <s>] [--dry]
//
// --group-gap: one presenter's consecutive turns whose silence between them is shorter than this
// become ONE clip. A single presenter cut into a clip per line resets to the portrait's pose at every
// cut; with the script's blocks ending on longer pauses (lines.ts --pause), each block is one take.
//
// Writes <out>/talk.json (what compose.ts and compose16.ts read), the clips (25 fps, near-lossless) in
// <out>/clips or --clips, and <out>/audio/*.wav (the cut each clip was driven by).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { alive, files, free, loadPresenters, OUTPUT, portraitFile, run, stage } from "./comfy.ts";
import { groupTurns, pinnedSegments, segments } from "./lib.ts";
import { encodePrompt, infiniteTalk } from "./workflows.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [narr, outArg] = args;
if (!narr || !outArg || narr.startsWith("--")) { console.error("usage: talk.ts <narration dir> <out dir> [--size WxH] [--steps 6] [--shift 11] [--seed 7] [--swap 8] [--attn sageattn] [--only k,...] [--idle 0] [--tail 1.0] [--face sp=presenter,...] [--clips dir] [--reuse old/talk.json] [--audio-scale 1] [--group-gap s] [--dry]"); process.exit(2); }
const out = resolve(outArg);
// --clips <dir>: one clips folder shared by several editions, so a clip rendered for one (same face,
// same audio, same settings: the same content-addressed name) is found by the others.
const clipsDir = resolve(opt("clips", join(out, "clips")));
for (const d of [clipsDir, join(out, "audio")]) mkdirSync(d, { recursive: true });

const reg = loadPresenters();
const turns = JSON.parse(readFileSync(join(narr, "turns.json"), "utf8"));
const voice = join(narr, "voice.wav");
const probe = (f: string) => Number(Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { stdout: "pipe" }).stdout.toString());
const total = +(probe(voice) + Number(opt("tail", "1.0"))).toFixed(3);
const [W, H] = opt("size", "640x640").split("x").map(Number);
// --audio-scale: how hard the speech drives the clip (1 = as trained; workflows.ts). Part of the cache
// key only when it is not 1, so clips rendered before the option existed keep their names.
const audioScale = Number(opt("audio-scale", "1"));
const P = { model: "infinitetalk-single-fp8+lightx2v-r64", w: W, h: H, steps: Number(opt("steps", "6")), shift: Number(opt("shift", "11")), seed: Number(opt("seed", "7")), ...(audioScale !== 1 ? { audioScale } : {}) };
// Blocks kept in system RAM and streamed to the GPU: 8 leaves a 24 GB card headroom (0 fills it).
const swap = Number(opt("swap", "8")), attention = opt("attn", "sageattn") as "sdpa" | "sageattn";
const only = new Set(opt("only", "").split(",").filter(Boolean).map(Number));
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

function ff(a: string[]) {
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...a], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`ffmpeg: ${r.stderr.toString().slice(-1200)}`);
}

type Job = { name: string; speaker: string; face: string; wav: string; seconds: number; seed: number; reuse?: string };
const jobs: Job[] = [];
// --face <speaker>=<presenter>[,<presenter>...][;<speaker>=...]: show a narration speaker with another
// presenter's face, for example one voice with several portraits of the same person. Several faces
// take that speaker's turns in rotation, counted over every turn so --only never shifts it.
const faces = new Map<string, string[]>(opt("face", "").split(";").filter(Boolean).map((s) => { const [sp, list] = s.split("="); return [sp, list.split(",")] as [string, string[]]; }));
const faceAt: string[] = [];
{ const nth = new Map<string, number>(); turns.forEach((t: any, k: number) => { const i = nth.get(t.speaker) ?? 0; nth.set(t.speaker, i + 1); const f = faces.get(t.speaker); faceAt[k] = f ? f[i % f.length] : t.speaker; }); }
for (const f of new Set(faceAt)) if (!reg[f]) throw new Error(`no presenter "${f}" in the presenters registry (add it, or map the speaker with --face ${f}=<presenter>)`);
// Clip units: each turn on its own, or with --group-gap a presenter's run of turns as one unit.
const groupGap = Number(opt("group-gap", "0"));
const { groups, units } = groupTurns(turns, groupGap);
if (groupGap > 0) console.log(`${turns.length} turns in ${units.length} clips (--group-gap ${groupGap}): ${groups.map((g) => g.length > 1 ? `${g[0]}-${g[g.length - 1]}` : `${g[0]}`).join(" ")}`);
// --reuse <old talk.json>: a turn whose speaker, face, words and speech length match the old render
// keeps its old clip, and its segment keeps the old window around its speech (lib.pinnedSegments).
// Re-voicing one presenter then re-renders only that presenter. The clip stays valid because lines.ts
// levels each line to a fixed speech level and the embeds node normalises loudness: the speech the
// model hears is the same, at the same offsets.
const reuseFile = opt("reuse", "");
if (reuseFile && groupGap > 0) throw new Error("--reuse and --group-gap together are not supported yet");
const old = reuseFile ? JSON.parse(readFileSync(resolve(reuseFile), "utf8")) : null;
const oldTurns = old ? JSON.parse(readFileSync(join(old.narration, "turns.json"), "utf8")) : [];
const pins: Record<number, { lead: number; tail: number }> = {}, reused = new Map<number, string>();
if (old) {
  turns.forEach((t: any, k: number) => {
    const oc = old.clips?.[`seg${String(k).padStart(2, "0")}-${t.speaker}`], clip = oc?.clip;
    const o = oldTurns[k], seg = old.segments?.[k];
    if (!o || !seg || !clip || !existsSync(clip) || o.speaker !== t.speaker || o.text !== t.text) return;
    if ((oc.face ?? o.speaker) !== faceAt[k]) return; // the same words, but another face
    if (oc.portrait && oc.portrait !== sha(readFileSync(portraitFile(reg[faceAt[k]].portrait)))) return; // the face was redrawn
    if (Math.abs((o.end - o.start) - (t.end - t.start)) > 0.002) return; // a re-rendered line, not the same speech
    pins[k] = { lead: +(o.start - seg.start).toFixed(3), tail: +(seg.end - o.end).toFixed(3) };
    reused.set(k, clip);
  });
  console.log(`reusing ${reused.size} clips from ${reuseFile}: turns ${[...reused.keys()].join(",")}`);
}
const segs = (old ? pinnedSegments(turns, total, pins) : segments(units, total)).map((s) => ({ ...s, turn: groups[s.k][0], turns: groups[s.k] }));
for (const s of segs) {
  if (only.size && !only.has(s.k)) continue;
  const wav = join(out, "audio", `seg${String(s.k).padStart(2, "0")}.wav`);
  // apad: the last segment runs past the voice into the tail.
  ff(["-i", voice, "-ss", s.start.toFixed(3), "-t", (s.end - s.start).toFixed(3), "-af", "apad", "-t", (s.end - s.start).toFixed(3), "-ac", "1", "-ar", "16000", wav]);
  jobs.push({ name: `seg${String(s.k).padStart(2, "0")}-${s.speaker}`, speaker: s.speaker, face: faceAt[s.turn], wav, seconds: +(s.end - s.start).toFixed(3), seed: P.seed + s.k, reuse: reused.get(s.k) });
}
// --idle 3.24 renders one idle loop per presenter (81 frames, one window, driven by silence) for
// compose.ts --listener idle. Off by default: on a real person's face a silence-driven clip keeps the
// mouth busy anyway and looks wrong; the default listener is a still.
const idle = Number(opt("idle", "0"));
if (idle > 0 && !only.size) {
  for (const sp of [...new Set(segs.map((s) => s.speaker))]) {
    const wav = join(out, "audio", `idle-${sp}.wav`);
    ff(["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", String(idle), wav]);
    jobs.push({ name: `idle-${sp}`, speaker: sp, face: faceAt[segs.find((s) => s.speaker === sp)!.turn], wav, seconds: idle, seed: P.seed + 100 });
  }
}

const manifestFile = join(out, "talk.json");
const manifest: any = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : { clips: {} };
manifest.narration = resolve(narr); manifest.total = total; manifest.params = P;
manifest.segments = segs;
if (!args.includes("--dry") && !(await alive())) throw new Error("ComfyUI is not answering: run tools/avatar/comfy-server.sh start (in WSL on Windows)");

// Every presenter prompt goes through the text encoder first, alone, into the wrapper's disk cache
// (workflows.encodePrompt): the encoder is 11 GB, and loading it beside the 14B model is how a WSL VM
// once ran out of memory. A cached prompt is a no-op; --encode-only stops here.
if (!args.includes("--dry")) {
  for (const f of [...new Set(jobs.map((j) => j.face))]) {
    const r = await run(encodePrompt(reg[f].talk_prompt), { label: `encode ${f}` });
    console.log(`prompt ${f.padEnd(12)} encoded or cached in ${r.seconds.toFixed(0)} s`);
  }
  if (args.includes("--encode-only")) process.exit(0);
}

let rendered = 0;
for (const j of jobs) {
  const pr = reg[j.face];
  const portrait = portraitFile(pr.portrait);
  if (!existsSync(portrait)) throw new Error(`${j.face}: no portrait at ${portrait} (tools/avatar/portrait.ts render + pick)`);
  const key = sha(JSON.stringify({ P, prompt: pr.talk_prompt, portrait: sha(readFileSync(portrait)), audio: sha(readFileSync(j.wav)), seed: j.seed })).slice(0, 10);
  const clip = join(clipsDir, `${j.name}-${key}.mp4`);
  manifest.clips[j.name] = { speaker: j.speaker, face: j.face, portrait: sha(readFileSync(portrait)), seconds: j.seconds, clip, key, ...(manifest.clips[j.name]?.key === key ? { render_s: manifest.clips[j.name].render_s } : {}) };
  if (existsSync(clip)) {
    if (j.reuse) manifest.clips[j.name].reused_from = j.reuse;
    console.log(`${j.name.padEnd(18)} cached`);
    continue;
  }
  // A reused turn (--reuse), or an idle loop the old render made from the same portrait and silence.
  const oldIdle = old?.clips?.[j.name];
  const from = j.reuse ?? (oldIdle && oldIdle.key === key && existsSync(oldIdle.clip) ? oldIdle.clip : undefined);
  if (from && args.includes("--dry")) { console.log(`${j.name.padEnd(18)} would reuse ${from}`); continue; }
  if (from) {
    copyFileSync(from, clip);
    manifest.clips[j.name].reused_from = from;
    console.log(`${j.name.padEnd(18)} reused from ${from}`);
    continue;
  }
  if (args.includes("--dry")) { console.log(`${j.name.padEnd(18)} would render ${j.seconds.toFixed(2)} s`); continue; }
  const wf = infiniteTalk({
    image: stage(portrait), audio: stage(j.wav), width: P.w, height: P.h, maxFrames: Math.ceil(j.seconds * 25),
    seed: j.seed, steps: P.steps, shift: P.shift, prompt: pr.talk_prompt, prefix: `talk/${j.name}-${key}`, blocksToSwap: swap, attention, keepLoaded: !args.includes("--offload"),
  });
  // Every clip reloads the model (the node pack's design). A model kept on the GPU from the clip before
  // is still there while it does, and that overflowed a 24 GB GPU by 5 GB into the host's memory within
  // 22 s. Unloading first costs a 7 s reload from ext4.
  await free();
  const r = await run(wf, { label: j.name });
  // A prompt ComfyUI answered from its cache may list no files; the clip's name is content-addressed,
  // so the newest output under that name is this clip.
  const named = () => readdirSync(join(OUTPUT, "talk")).filter((f) => f.startsWith(`${j.name}-${key}`) && f.endsWith(".mp4")).map((f) => join(OUTPUT, "talk", f)).sort().slice(-1);
  const [mp4] = [...files(r.outputs).filter((f) => f.endsWith(".mp4")), ...(existsSync(join(OUTPUT, "talk")) ? named() : [])];
  if (!mp4) throw new Error(`${j.name}: the run wrote no mp4 (${JSON.stringify(r.outputs).slice(0, 400)})`);
  copyFileSync(mp4, clip);
  manifest.clips[j.name].render_s = +r.seconds.toFixed(1);
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
  rendered++;
  console.log(`${j.name.padEnd(18)} ${j.seconds.toFixed(2)} s of video in ${r.seconds.toFixed(0)} s (${(r.seconds / j.seconds).toFixed(1)}x real time)`);
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
if (!args.includes("--dry")) await free();
console.log(`${rendered} rendered, ${jobs.length - rendered} cached or skipped; manifest ${manifestFile}`);
