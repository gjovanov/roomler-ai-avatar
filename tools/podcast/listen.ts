#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The LISTENER's clips for the studio conversation format: in every two-camera segment, the presenter who is not
// speaking gets an InfiniteTalk clip of the segment's length, driven by the model's trained silence
// (MultiTalkSilentEmbeds, workflows.ts listenClip), so the mouth stays shut, and by a calm listening prompt. The podcast
// pilot's first edition showed a dimmed still instead; its owner asked for "actual listener video" (2026-10-26).
// - The model applies its prompt again in every 81-frame window, so any gesture a prompt names comes back every few
//   seconds (a clip touched its nose three times): the prompts name only blinking, a slow nod and a smile, and the
//   negative forbids touching the face, raised hands and looking away.
// - The prompts: the presenter's `listen_prompt` and `listen_prompt_amused` in the registry, else generic ones.
//   Amused (a smile that grows) only for a segment of 9 s or less whose lines match one of the plan's `amused`
//   patterns (the other one's jokes); calm otherwise.
// - --motion <apng>: CONTINUE these frames (the previous clip's last frames up to the cut on screen; talk.ts
//   --motion): the portrait stays the reference; the silence leads in by as many frames, which the wrapper drops.
//   chain.ts passes it. --alias <clip>: an equivalent clip of an older edition, used when this key is not cached.
// Content-addressed in the clips folder; writes <talk dir>/listen.json { "<k>": { speaker, face, clip, mood } }.
//   bun tools/podcast/listen.ts <talk.json> <plan.json> [--face <speaker>=<presenter>[;...]] [--clips <dir>]
//        [--size 512x768] [--only k,...] [--motion <apng>] [--alias <clip>] [--dry]
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { alive, files, free, loadPresenters, portraitFile, run, stage } from "../avatar/comfy.ts";
import { LISTEN_NEGATIVE, listenClip } from "../avatar/workflows.ts";
import { beatAt, faceArg, loadPlan, resolveBeats } from "./plan.ts";

const args = process.argv.slice(2);
const opt = (n: string, d = "") => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [talkFile, planArg] = args;
if (!talkFile || !planArg || talkFile.startsWith("--")) { console.error("usage: listen.ts <talk.json> <plan.json> [--face sp=presenter;...] [--clips dir] [--size WxH] [--only k,...] [--motion apng] [--alias clip] [--dry]"); process.exit(2); }
const talk = JSON.parse(readFileSync(resolve(talkFile), "utf8"));
const { plan } = loadPlan(planArg);
const turns = JSON.parse(readFileSync(join(talk.narration, "turns.json"), "utf8"));
const faces = new Map((opt("face") || faceArg(plan)).split(";").filter(Boolean).map((s) => s.split("=") as [string, string]));
const only = new Set(opt("only").split(",").filter(Boolean).map(Number));
const motionFile = opt("motion") ? resolve(opt("motion")) : "";
if (motionFile && only.size !== 1) throw new Error("--motion needs exactly one --only segment");
if (motionFile && !existsSync(motionFile)) throw new Error(`--motion ${motionFile}: no such image`);
const aliasFile = opt("alias") ? resolve(opt("alias")) : "";
if (aliasFile && (only.size !== 1 || !existsSync(aliasFile))) throw new Error(`--alias needs exactly one --only segment and an existing clip`);
const LEAD = motionFile ? Number(Bun.spawnSync(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", motionFile], { stdout: "pipe" }).stdout.toString().trim()) : 0;
if (motionFile && !(LEAD >= 1 && (LEAD - 1) % 4 === 0)) throw new Error(`--motion ${motionFile}: ${LEAD} frames, needs 4k+1`);
const DRY = args.includes("--dry");
const reg = loadPresenters();
const [W, H] = (opt("size") || plan.clips?.size || "512x768").split("x").map(Number);
const SEED0 = 3000;
const beats = resolveBeats(plan, turns);
const layoutOf = (turn: number) => beatAt(beats, turn).layout;
const other = (sp: string) => (sp === plan.host ? plan.guest : plan.host);
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const amused = (plan.amused ?? []).map((src) => new RegExp(src, "i"));

// Used for a presenter whose registry entry has no listen_prompt of its own.
const CALM = "A person, one of the two people of a video podcast in a studio, listens to the other one, who is speaking off camera. Calm and attentive, looking toward the camera; the mouth stays closed and still, not speaking. Only small natural movements: blinking, a slow nod now and then, a slight warm smile. The hands stay still. The camera and the studio behind stay still.";
const AMUSED = "A person, one of the two people of a video podcast in a studio, listens to the other one's joke, calm and amused, looking toward the camera; the mouth stays closed, not speaking. Only small natural movements: blinking, a warm smile that grows a little, the eyes smiling, a slow nod. The hands stay still. The camera and the studio behind stay still.";

const clipsDir = opt("clips") ? resolve(opt("clips")) : dirname(Object.values<any>(talk.clips)[0]?.clip ?? join(dirname(resolve(talkFile)), "clips"));
const manifestFile = join(dirname(resolve(talkFile)), "listen.json");
const manifest: Record<string, any> = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
if (!DRY && !(await alive())) throw new Error("ComfyUI is not answering");
let total = 0, rendered = 0;
for (const s of talk.segments) {
  if (layoutOf(s.turn) !== "two") continue;
  const listener = other(s.speaker), face = faces.get(listener) ?? listener;
  if (only.size && !only.has(s.k)) continue;
  const p = reg[face];
  if (!p) throw new Error(`no presenter "${face}" in the registry (for the listener ${listener})`);
  const secs = s.end - s.start, frames = Math.ceil(secs * 25) + LEAD, seed = SEED0 + s.k;
  const joke = (s.turns ?? [s.turn]).some((t: number) => amused.some((re) => re.test(turns[t].text)));
  const mood = joke && secs <= 9 ? "amused" : "calm";
  const prompt = mood === "amused" ? (p.listen_prompt_amused ?? AMUSED) : (p.listen_prompt ?? CALM);
  const portrait = portraitFile(p.portrait);
  const key = sha(JSON.stringify({ face, prompt, neg: LISTEN_NEGATIVE, frames, seed, W, H, portrait: sha(readFileSync(portrait)), ...(motionFile ? { motion: sha(readFileSync(motionFile)) } : {}) })).slice(0, 10);
  const clip = join(clipsDir, `listen-seg${String(s.k).padStart(2, "0")}-${listener}-${key}.mp4`);
  total += secs;
  manifest[s.k] = { speaker: listener, face, clip, mood, seconds: +secs.toFixed(3), ...(motionFile ? { motion: motionFile } : {}) };
  if (aliasFile && !existsSync(clip) && !DRY) { copyFileSync(aliasFile, clip); manifest[s.k].aliased_from = aliasFile; console.log(`seg${s.k} ${listener} ${mood} cached (alias) ${clip}`); continue; }
  if (existsSync(clip)) { console.log(`seg${s.k} ${listener} ${mood} cached ${clip}`); continue; }
  if (DRY) { console.log(`seg${s.k} ${listener.padEnd(7)} ${mood.padEnd(6)} would render ${secs.toFixed(2)} s`); continue; }
  await free();
  const r = await run(listenClip({ image: stage(portrait), motionFrames: motionFile ? stage(motionFile) : undefined, width: W, height: H, frames, prompt, seed, prefix: `listen/seg${s.k}-${listener}-${key}` }), { label: `listen seg${s.k} ${listener}` });
  const [mp4] = files(r.outputs).filter((f) => f.endsWith(".mp4"));
  if (!mp4) throw new Error(`seg${s.k}: no mp4`);
  copyFileSync(mp4, clip);
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
  rendered++;
  console.log(`seg${s.k} ${listener} ${mood} ${secs.toFixed(2)} s in ${r.seconds.toFixed(0)} s -> ${clip}`);
}
if (!DRY) writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
if (!DRY) await free();
console.log(`${rendered} rendered; listener time ${total.toFixed(1)} s; manifest ${manifestFile}`);
