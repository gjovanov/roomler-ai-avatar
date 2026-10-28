#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The cuts of a composed studio conversation, measured: at every cut between two two-camera segments, each tile's
// change ACROSS the cut (the PSNR of the last frame before it against the first after it) beside its changes just
// before and after it. A cut that jumps reads far below its neighbours (flagged: 6 dB under them, or under 28 dB);
// one that continues reads like them. The podcast pilot's second edition jumped at 48 of its 48 tile cuts; with the
// clips chained (chain.ts) the third jumped at none, and its one flag was a hand gesture running through the cut:
// look at a flagged cut before you believe it. Frame numbers are the video's (30 fps, after the title).
//   bun tools/podcast/seams.ts <video.mp4> <plan.json> [--only k,...] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beatAt, FPS, loadPlan, resolveBeats, TILE } from "./plan.ts";

const args = process.argv.slice(2);
if (args.length < 2) { console.error("usage: seams.ts <video.mp4> <plan.json> [--only k,...] [--json out.json]"); process.exit(2); }
const video = resolve(args[0]);
const { plan, R } = loadPlan(args[1]);
const jsonOut = args.includes("--json") ? resolve(args[args.indexOf("--json") + 1]) : "";
// --only k,...: just the cuts INTO these segments
const only = new Set((args.includes("--only") ? args[args.indexOf("--only") + 1] : "").split(",").filter(Boolean).map(Number));
const talk = JSON.parse(readFileSync(R(plan.talk), "utf8"));
const turns = JSON.parse(readFileSync(join(talk.narration, "turns.json"), "utf8"));
const beats = resolveBeats(plan, turns);
const lay = (turn: number) => beatAt(beats, turn).layout;
const segs: any[] = talk.segments;
const { w: TW, h: TH, y: TY } = TILE;

// consecutive-frame PSNRs of one tile over frames [f-2, f+1]: [f-2>f-1, f-1>f (the cut), f>f+1]
function steps(f: number, x: number): number[] {
  const crop = `crop=${TW}:${TH}:${x}:${TY}`;
  const sel = `select='between(n\\,${f - 2}\\,${f + 1})',setpts=N/(${FPS}*TB)`;
  const fc = `[0:v]${sel},${crop},split[a][b];[b]trim=start_frame=1,setpts=N/(${FPS}*TB)[c];[a][c]psnr=stats_file=-`;
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", video, "-filter_complex", fc, "-f", "null", "-"], { stdout: "pipe", stderr: "pipe" });
  return r.stdout.toString().trim().split("\n").filter(Boolean).map((l) => {
    const v = l.match(/psnr_avg:(\S+)/)?.[1] ?? "nan";
    return v === "inf" ? 99 : Number(v);
  });
}

const rows: any[] = [];
for (let i = 1; i < segs.length; i++) {
  const a = segs[i - 1], b = segs[i];
  if (only.size && !only.has(b.k)) continue;
  if (lay(a.turn) !== "two" || lay(b.turn) !== "two") continue;
  const f = Math.round(plan.pre * FPS) + Math.round(b.start * FPS);
  for (const [who, x] of [[plan.host, TILE.hostX], [plan.guest, TILE.guestX]] as const) {
    const s = steps(f, x);
    if (s.length < 3) { rows.push({ k: b.k, who, frame: f, error: "no frames" }); continue; }
    const [before, cut, after] = s;
    const ref = Math.min(before, after);
    const role = `${a.speaker === who ? "speak" : "listen"}>${b.speaker === who ? "speak" : "listen"}`;
    rows.push({ k: b.k, who, role, frame: f, before: +before.toFixed(1), cut: +cut.toFixed(1), after: +after.toFixed(1), flag: cut < ref - 6 || cut < 28 });
  }
}
for (const r of rows) console.log(r.error ? `seg${r.k} ${r.who} ${r.error}` : `seg${String(r.k).padStart(2)} ${r.who.padEnd(7)} ${r.role.padEnd(13)} f${r.frame}  before ${r.before}  CUT ${r.cut}  after ${r.after}${r.flag ? "  <-- JUMP" : ""}`);
const flagged = rows.filter((r) => r.flag);
console.log(`${rows.length} tile cuts measured, ${flagged.length} flagged`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
