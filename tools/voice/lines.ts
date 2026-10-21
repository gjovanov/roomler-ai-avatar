#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The narration, rendered ONE LINE AT A TIME with VibeVoice, then assembled with clean silence. A
// one-pass VibeVoice dialogue clips a speaker's last syllable at a hand-over and leaves noise in the
// gaps; a line rendered alone ends where its speech ends, and the gaps are digital silence we choose.
//
//   bun tools/voice/lines.ts render <script.txt> <outdir> [--seed 42] [--cfg 1.8] [--steps 10]
//        [--between 0.8] [--same 0.45] [--lead 0.5] [--pause 3:1.8,...] [--only 4,12] [--use 4=<clip.wav>]
//        [--min-heard 0.6] [--no-ai-check]
//
// - The script is one line per turn, `speaker: text`; a speaker is any voice the engine has
//   (tools/voice/render.sh voices).
// - Each line's clip is lines/l<n>.wav (rendered once and kept; --only re-renders those lines, with
//   this run's --seed; --use puts a chosen clip in a line's place, e.g. a picked take).
// - Every clip is checked by Whisper (heard < --min-heard stops the run), trimmed to its speech by
//   energy (60 ms before the first sound, 220 ms after the last: a word's decay is never cut), faded in
//   and out, and brought to the same speech level as the others.
// - Gaps: --between at a change of speaker, --same between one speaker's lines, --pause n:s after
//   line n. Then two-pass loudnorm to -16 LUFS.
// - The words are checked for AI-writing patterns first when the avoid-ai-writing detector is
//   installed (tools/voice/ai-check.sh); --no-ai-check skips it.
// Writes voice.wav, turns.json, timings.json, captions.srt and lines.json (what each line came from).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { linuxBash, toLinux } from "../lib/platform.ts";
import { alignByWords, parseScript, speechSpans, srtFromTurns, timingsJson, type TimedTurn } from "./podcast-lib.ts";

const RENDER_SH = join(import.meta.dir, "render.sh");
const args = process.argv.slice(2);
const opt = (name: string, dflt?: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
function run(cmd: string[], what: string): string {
  const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${what} failed (exit ${r.exitCode}):\n${r.stderr.toString().slice(-1500)}`);
  return r.stdout.toString();
}
const ff = (a: string[]) => {
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-nostats", "-y", ...a], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`ffmpeg failed:\n${r.stderr.toString().slice(-1500)}`);
  return r.stderr.toString();
};
const seconds = (f: string) => Number(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], "ffprobe").trim());
const pcm16k = (f: string) => {
  const b = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", f, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { stdout: "pipe" }).stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
/** RMS in dBFS over the frames that carry speech (above -45 dBFS), 20 ms frames. */
function speechLevel(x: Float32Array, rate: number): number {
  const n = Math.round(0.02 * rate), act: number[] = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let e = 0; for (let k = i; k < i + n; k++) e += x[k] * x[k];
    const db = 10 * Math.log10(e / n + 1e-12);
    if (db > -45) act.push(e / n);
  }
  return act.length ? 10 * Math.log10(act.reduce((a, b) => a + b, 0) / act.length) : -60;
}

const [cmd, scriptFile, outArg] = args;
if (cmd !== "render" || !scriptFile || !outArg) {
  console.error("usage: lines.ts render <script.txt> <outdir> [--seed 42] [--cfg 1.8] [--steps 10] [--between 0.8] [--same 0.45] [--lead 0.5] [--pause n:s,...] [--only n,...] [--use n=<wav>,...] [--no-ai-check]");
  process.exit(2);
}
const out = resolve(outArg), dir = join(out, "lines");
mkdirSync(dir, { recursive: true });
const speakers = run(linuxBash(RENDER_SH, "voices"), "listing the voices").split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
const turns = parseScript(readFileSync(scriptFile, "utf8"), speakers);
const bare = join(out, "script-text.txt");
writeFileSync(bare, turns.map((t) => t.text).join("\n") + "\n");
if (!args.includes("--no-ai-check")) {
  const r = Bun.spawnSync(["bash", join(import.meta.dir, "ai-check.sh"), bare], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode === 2) console.log("ai-check: the avoid-ai-writing detector is not installed, skipped");
  else if (r.exitCode !== 0 || !/label: Clean/.test(r.stdout.toString()))
    throw new Error(`ai-check is not Clean; fix the script first (or pass --no-ai-check):\n${(r.stdout.toString() + r.stderr.toString()).trim()}`);
}
writeFileSync(join(out, "script.txt"), turns.map((t) => `${t.speaker}: ${t.text}`).join("\n") + "\n");

const seed = opt("seed", "42")!, cfg = opt("cfg", "1.8")!, steps = opt("steps", "10")!;
const only = new Set((opt("only", "") ?? "").split(",").filter(Boolean).map(Number));
const use = new Map((opt("use", "") ?? "").split(",").filter(Boolean).map((s) => { const [n, f] = s.split("="); return [Number(n), resolve(f)] as const; }));
const pauses = new Map((opt("pause", "") ?? "").split(",").filter(Boolean).map((s) => { const [n, v] = s.split(":"); return [Number(n), Number(v)] as const; }));
const minHeard = Number(opt("min-heard", "0.6")); // 0 for spelled-out deliveries ("Shooow me") Whisper cannot match
const between = Number(opt("between", "0.8")), same = Number(opt("same", "0.45")), lead = Number(opt("lead", "0.5"));
const metaFile = join(out, "lines.json");
const meta: Record<string, { seed?: string; cfg?: string; from?: string; heard: number; dur: number; trim: [number, number]; level: number }> =
  existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};

const clips: Array<{ file: string; a: number; b: number; s: number; e: number; gainDb: number }> = [];
for (const [i, t] of turns.entries()) {
  const n = i + 1, clip = join(dir, `l${n}.wav`);
  const fresh = only.has(n) || !existsSync(clip) || use.has(n);
  if (use.has(n)) copyFileSync(use.get(n)!, clip);
  else if (fresh) {
    const one = join(dir, `l${n}.txt`);
    writeFileSync(one, `${t.speaker}: ${t.text}\n`);
    const t0 = Date.now();
    run(linuxBash(RENDER_SH, "render", toLinux(one), toLinux(clip), seed, cfg, steps), `line ${n}'s render`);
    console.log(`line ${n} (${t.speaker}) rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  // Whisper on the line alone: is it the line?
  let heard = meta[n]?.heard;
  if (fresh || heard === undefined) {
    const words = JSON.parse(run(linuxBash(RENDER_SH, "align", toLinux(clip)), `line ${n}'s word timing`));
    // alignByWords throws below its own floor; a spelled-out delivery may sit there on purpose, so
    // the floor is ours (--min-heard), and a throw reads as "heard nothing".
    try { heard = alignByWords([t], words.words, minHeard).heard?.[0] ?? 0; } catch { heard = 0; }
  }
  if (heard < minHeard) throw new Error(`line ${n} (${t.speaker}): only ${(heard * 100).toFixed(0)}% of its words heard; re-render it: --only ${n} --seed <another>`);
  // Trim to the speech, by energy, with room for the decay.
  const x = pcm16k(clip), dur = seconds(clip);
  const spans = speechSpans(x, 16000);
  if (!spans.length) throw new Error(`line ${n}: no speech found in the clip`);
  const s = spans[0][0], e = spans[spans.length - 1][1];
  const a = Math.max(0, s - 0.06), b = Math.min(dur, e + 0.22);
  const level = speechLevel(x.subarray(Math.floor(a * 16000), Math.floor(b * 16000)), 16000);
  clips.push({ file: clip, a, b, s, e, gainDb: -20 - level });
  meta[n] = { ...(use.has(n) ? { from: use.get(n) } : fresh ? { seed, cfg } : { seed: meta[n]?.seed, cfg: meta[n]?.cfg, from: meta[n]?.from }), heard, dur: +dur.toFixed(3), trim: [+a.toFixed(3), +b.toFixed(3)], level: +level.toFixed(1) };
  console.log(`line ${String(n).padStart(2)} ${t.speaker.padEnd(8)} heard ${heard.toFixed(2)}  speech ${s.toFixed(2)}-${e.toFixed(2)} of ${dur.toFixed(2)} s  level ${level.toFixed(1)} dBFS  ${t.text.slice(0, 40)}`);
}
writeFileSync(metaFile, JSON.stringify(meta, null, 1));

// Assemble: lead-in, then each line, then its gap; times by construction.
const inputs: string[] = [], parts: string[] = [], timed: TimedTurn[] = [];
let at = lead, k = 0;
const silence = (d: number) => { parts.push(`anullsrc=r=48000:cl=mono,atrim=0:${d.toFixed(3)}[z${k}]`); return `[z${k++}]`; };
const seq: string[] = [silence(lead)];
clips.forEach((c, i) => {
  inputs.push("-i", c.file);
  const len = c.b - c.a, fo = Math.min(0.08, len / 4);
  parts.push(`[${i}:a]aformat=channel_layouts=mono,atrim=${c.a.toFixed(3)}:${c.b.toFixed(3)},asetpts=N/SR/TB,aresample=48000,volume=${c.gainDb.toFixed(2)}dB,afade=t=in:d=0.015,afade=t=out:st=${(len - fo).toFixed(3)}:d=${fo.toFixed(3)}[c${i}]`);
  seq.push(`[c${i}]`);
  timed.push({ ...turns[i], start: +(at + (c.s - c.a)).toFixed(3), end: +(at + (c.e - c.a)).toFixed(3) } as TimedTurn);
  at += len;
  if (i < clips.length - 1) {
    const gap = pauses.get(i + 1) ?? (turns[i + 1].speaker === turns[i].speaker ? same : between);
    seq.push(silence(gap));
    at += gap;
  }
});
seq.push(silence(0.6));
at += 0.6;
const mixed = join(out, "lines-joined.wav");
ff([...inputs, "-filter_complex", `${parts.join(";")};${seq.join("")}concat=n=${seq.length}:v=0:a=1[o]`, "-map", "[o]", "-c:a", "pcm_f32le", mixed]);
// Two-pass linear loudnorm to -16 LUFS, stereo 16-bit 48 kHz.
const m = ff(["-i", mixed, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
const j = JSON.parse(m.slice(m.lastIndexOf("{"), m.lastIndexOf("}") + 1));
ff(["-i", mixed, "-af", `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, "-ac", "2", "-c:a", "pcm_s16le", join(out, "voice.wav")]);
const total = seconds(join(out, "voice.wav"));
writeFileSync(join(out, "turns.json"), JSON.stringify(timed.map((t, i) => ({ ...t, heard: meta[i + 1].heard, fit: 1, repaired: false })), null, 1));
writeFileSync(join(out, "timings.json"), JSON.stringify(timingsJson(timed, total, `vibevoice lines cfg ${cfg} (seeds per line in lines.json)`), null, 1));
writeFileSync(join(out, "captions.srt"), srtFromTurns(timed));
console.log(`wrote ${join(out, "voice.wav")} + turns.json, timings.json, captions.srt, lines.json (${total.toFixed(2)} s)`);
