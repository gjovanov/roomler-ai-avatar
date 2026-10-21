#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Whisper word times for the captions, one turn at a time. Each turn's window (its speech, padded into
// the silence around it) is transcribed on its own, so Whisper never runs long-form, where it drops
// whole lines and loops on a pause: over one 72 s track whisper-base.en wrote "We live!" 29 times into a
// 1.6 s pause, and on another lost the last three lines. Per turn, it heard every line of both.
//
//   bun tools/avatar/words.ts <narration dir> --out <words.json> [--model openai/whisper-medium.en] [--cpu]
//
// --cpu leaves the GPU to a running render (fine for whisper-base.en; medium on the CPU wants a lot of
// RAM). The captions show the SCRIPT's words at Whisper's times, so a mishearing never reaches the
// screen; it only costs timing when most of a turn is misheard.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { linuxBash, toLinux } from "../lib/platform.ts";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const narr = args[0], out = opt("out");
if (!narr || !out || narr.startsWith("--")) { console.error("usage: words.ts <narration dir> --out <words.json> [--model openai/whisper-medium.en] [--cpu]"); process.exit(2); }
const model = opt("model", "openai/whisper-medium.en")!;
const RENDER_SH = join(import.meta.dir, "..", "voice", "render.sh");

type Turn = { speaker: string; text: string; start: number; end: number };
const turns = JSON.parse(readFileSync(join(narr, "turns.json"), "utf8")) as Turn[];
// Up to 0.3 s of the silence on each side, never past the middle of a gap: a window holds one turn.
const PAD = 0.3;
const windows = turns.map((t, k) => {
  const before = k ? (t.start - turns[k - 1].end) / 2 : t.start, after = k + 1 < turns.length ? (turns[k + 1].start - t.end) / 2 : PAD;
  return [Math.max(0, t.start - Math.min(PAD, before)), t.end + Math.min(PAD, after)];
});
const r = Bun.spawnSync(linuxBash(RENDER_SH, "align", toLinux(join(narr, "voice.wav")), "--model", model,
  "--windows", windows.map(([a, b]) => `${a.toFixed(3)}:${b.toFixed(3)}`).join(","), ...(args.includes("--cpu") ? ["--cpu"] : [])), { stdout: "pipe", stderr: "pipe" });
if (r.exitCode !== 0) throw new Error(`align-words failed (exit ${r.exitCode}):\n${r.stderr.toString().slice(-1500)}`);
const res = JSON.parse(r.stdout.toString());
writeFileSync(resolve(out), JSON.stringify(res) + "\n");
// What each turn was heard as, so a dropped or looping turn shows here.
const words = res.words as Array<{ word: string; start: number; end: number }>;
turns.forEach((t, k) => {
  const heard = words.filter((w) => w.start >= windows[k][0] - 0.001 && w.start < windows[k][1]).map((w) => w.word).join(" ");
  console.log(`${String(k).padStart(2)} ${t.speaker.padEnd(8)} ${heard}`);
});
console.log(`${model}: ${words.length} words -> ${resolve(out)}`);
