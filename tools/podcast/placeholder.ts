#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Stand-in clips, to test the studio composer before any GPU work: each segment's clip is its face's portrait, still,
// for the segment's length (25 fps, at the plan's clip size, like a talk.ts clip). Writes <out dir>/talk.json, the
// plan's talk.json pointing at them: compose a copy of the plan whose `talk` (and `work`, `out`) point there.
//   bun tools/podcast/placeholder.ts <plan.json> [--out <dir>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadPresenters, portraitFile } from "../avatar/comfy.ts";
import { loadPlan } from "./plan.ts";

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith("--")) { console.error("usage: placeholder.ts <plan.json> [--out <dir>]"); process.exit(2); }
const { plan, R, here } = loadPlan(args[0]);
const dir = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : join(here, "talk-placeholder"));
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const talk = JSON.parse(readFileSync(R(plan.talk), "utf8"));
const reg = loadPresenters();
const faceOf = (speaker: string) => plan.faces?.[speaker]?.split(",")[0] ?? speaker;
const [w, h] = (plan.clips?.size ?? "512x768").split("x").map(Number);
const clips: Record<string, any> = {};
for (const s of talk.segments) {
  const name = `seg${String(s.k).padStart(2, "0")}-${s.speaker}`, f = join(dir, `${name}.mp4`), d = s.end - s.start, face = faceOf(s.speaker);
  if (!reg[face]) throw new Error(`no presenter "${face}" in the registry`);
  if (!existsSync(f)) {
    const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", portraitFile(reg[face].portrait), "-t", d.toFixed(3), "-r", "25", "-vf", `scale=${w}:${h},format=yuv420p`, "-c:v", "libx264", "-preset", "ultrafast", f]);
    if (r.exitCode !== 0) throw new Error(`placeholder ${name}`);
  }
  clips[name] = { speaker: s.speaker, face, clip: f, seconds: d };
}
writeFileSync(join(dir, "talk.json"), JSON.stringify({ ...talk, clips }, null, 1));
console.log(`${Object.keys(clips).length} stand-in clips -> ${join(dir, "talk.json")}`);
