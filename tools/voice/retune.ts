#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The same narration a little deeper (or higher), with every time kept. rubberband shifts the pitch
// without changing the length, so the original's turns.json, word times, storyboard and talking clips
// all still fit: only voice.wav is new. Mix the new folder (mix.ts) and compose it with the original's
// talk.json and words.
//
//   bun tools/voice/retune.ts <narration dir> <new dir> [--st -1.5] [--formant shifted|preserved]
//
// --st is in semitones; -1.5 reads as "a bit deeper". --formant shifted (the default) moves the voice's
// resonances with the pitch, so it sounds bigger as well as lower; preserved lowers the pitch alone.
// The new folder holds voice.wav, a copy of every other file the compose reads, and retune.json with
// the shift asked for and the shift measured (median pitch, before and after).
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pitchTrack } from "./podcast-lib.ts";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [srcArg, dstArg] = args;
if (!srcArg || !dstArg || srcArg.startsWith("--") || dstArg.startsWith("--")) {
  console.error("usage: retune.ts <narration dir> <new dir> [--st -1.5] [--formant shifted|preserved]");
  process.exit(2);
}
const src = resolve(srcArg), dst = resolve(dstArg);
const st = Number(opt("st", "-1.5")), formant = opt("formant", "shifted")!;
if (!Number.isFinite(st) || st === 0 || Math.abs(st) > 12) throw new Error(`--st ${opt("st")}: a shift in semitones, not 0, within ±12`);
if (!["shifted", "preserved"].includes(formant)) throw new Error(`--formant ${formant}: shifted or preserved`);
if (src === dst) throw new Error("the new folder must not be the narration itself");
if (!existsSync(join(src, "voice.wav")) || !existsSync(join(src, "turns.json"))) throw new Error(`${src}: no voice.wav and turns.json (run lines.ts first)`);
mkdirSync(dst, { recursive: true });

// Everything but audio: the times, captions and script the later steps read. A mix of the original
// would be the wrong voice, and lines/ holds the original's takes.
const copied = readdirSync(src).filter((f) => statSync(join(src, f)).isFile() && !/\.(wav|mp3|m4a|mp4)$/i.test(f));
for (const f of copied) copyFileSync(join(src, f), join(dst, f));

const ratio = 2 ** (st / 12);
const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", join(src, "voice.wav"),
  "-af", `rubberband=pitch=${ratio.toFixed(6)}:formant=${formant}:pitchq=quality`, "-c:a", "pcm_s16le", join(dst, "voice.wav")], { stderr: "pipe" });
if (r.exitCode !== 0) throw new Error(`ffmpeg failed (is it built with librubberband?):\n${r.stderr.toString().slice(-800)}`);

const samples = (f: string) => Number(Bun.spawnSync(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration_ts", "-of", "csv=p=0", f], { stdout: "pipe" }).stdout.toString().trim());
const a = samples(join(src, "voice.wav")), b = samples(join(dst, "voice.wav"));
if (Math.abs(a - b) > 480) throw new Error(`the retuned voice is ${b - a} samples longer than the original: the times would no longer fit`);

const pcm = (f: string) => {
  const o = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", f, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { stdout: "pipe" }).stdout;
  return new Float32Array(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength));
};
const median = (f: string) => { const v = pitchTrack(pcm(f), 16000).f0.filter((h) => h > 0).sort((x, y) => x - y); return v[Math.floor(v.length / 2)] ?? 0; };
const before = median(join(src, "voice.wav")), after = median(join(dst, "voice.wav"));
const measured = 12 * Math.log2(after / before);
writeFileSync(join(dst, "retune.json"), JSON.stringify({ from: src, st, formant, ratio: +ratio.toFixed(6), median_hz: { before: +before.toFixed(1), after: +after.toFixed(1) }, measured_st: +measured.toFixed(2), copied }, null, 2) + "\n");
console.log(`${join(dst, "voice.wav")}: ${st} st asked, ${measured.toFixed(2)} st measured (median ${before.toFixed(0)} -> ${after.toFixed(0)} Hz), formants ${formant}, length kept (${b - a} samples)`);
