#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The final audio: the narration (lines.ts's voice.wav) at -14 LUFS, optionally over a music bed that
// dips under every turn by the turn timings (not through a compressor).
//
//   bun tools/voice/mix.ts <narration dir> [--music <file> [--music-start <s>]] [--name mix]
//        [--bed-lufs -24.5] [--duck 7]
//
// Writes <narration dir>/<name>.wav (default mix.wav; 48 kHz stereo, -14 LUFS, -2 dBTP: AAC adds overshoot, and a
// published file should stay under -1 dBTP), plus <name>-bed.wav with the ducked music alone. The mix
// runs one second past the last word. A music track must be licensed for your use; check that before
// you publish.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { duckExpression, type TimedTurn } from "./podcast-lib.ts";

const args = process.argv.slice(2);
const opt = (name: string, dflt?: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const ff = (a: string[]) => {
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-nostats", "-y", ...a], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`ffmpeg failed:\n${r.stderr.toString().slice(-1500)}`);
  return r.stderr.toString();
};
const seconds = (f: string) => Number(Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { stdout: "pipe" }).stdout.toString().trim());
const lufs = (file: string, from: number, to: number) => {
  const e = ff(["-i", file, "-af", `atrim=${from}:${to},ebur128=framelog=quiet`, "-f", "null", "-"]);
  return Number((e.match(/I:\s+(-?[\d.]+) LUFS/g) ?? []).pop()?.match(/-?[\d.]+/)?.[0]);
};
/** Two-pass linear loudnorm, so dynamics (and the bed's dips) survive as rendered. */
function loudnorm(input: string, output: string, target: number, tp: number) {
  const m = ff(["-i", input, "-af", `loudnorm=I=${target}:TP=${tp}:LRA=11:print_format=json`, "-f", "null", "-"]);
  const j = JSON.parse(m.slice(m.lastIndexOf("{"), m.lastIndexOf("}") + 1));
  ff(["-i", input, "-af", `loudnorm=I=${target}:TP=${tp}:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, "-c:a", "pcm_s16le", output]);
}

const dirArg = args[0];
if (!dirArg || dirArg.startsWith("--")) { console.error("usage: mix.ts <narration dir> [--music <file> [--music-start <s>]] [--name mix] [--bed-lufs -24.5] [--duck 7]"); process.exit(2); }
const dir = resolve(dirArg), name = opt("name", "mix")!;
const voice = join(dir, "voice.wav");
if (!existsSync(voice)) throw new Error(`no ${voice}: run tools/voice/lines.ts first`);
const turns = JSON.parse(readFileSync(join(dir, "turns.json"), "utf8")) as TimedTurn[];
const TOTAL = +(seconds(voice) + 1.0).toFixed(2);
const pre = join(dir, `${name}-premaster.wav`), final = join(dir, `${name}.wav`);
const music = opt("music");
if (music) {
  const start = Number(opt("music-start", "0"));
  if (seconds(music) < start + TOTAL) throw new Error(`the track is shorter than ${TOTAL} s from ${start} s: pass an earlier --music-start`);
  // The bed sits at --bed-lufs between turns and --duck dB lower under one, its gain set from the
  // track's own loudness over the stretch used.
  const section = lufs(music, start, start + TOTAL);
  const GAP_DB = +(Number(opt("bed-lufs", "-24.5")) - section).toFixed(1);
  const SPEECH_DB = +(GAP_DB - Number(opt("duck", "7"))).toFixed(1);
  const bed = join(dir, `${name}-bed.wav`);
  const graph = [
    `[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:${TOTAL}[v]`,
    `[1:a]atrim=start=${start},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:${TOTAL},` +
      `afade=t=in:d=0.5,afade=t=out:st=${(TOTAL - 1.5).toFixed(2)}:d=1.5,volume=volume='${duckExpression(turns, GAP_DB, SPEECH_DB)}':eval=frame,asplit=2[m][bed]`,
    `[v][m]amix=inputs=2:normalize=0:duration=first:dropout_transition=0[mix]`,
  ].join(";");
  ff(["-i", voice, "-i", music, "-filter_complex", graph, "-map", "[mix]", "-c:a", "pcm_f32le", pre, "-map", "[bed]", "-c:a", "pcm_f32le", bed]);
  console.log(`music ${start.toFixed(2)}-${(start + TOTAL).toFixed(2)} s of ${basename(music)} (${section.toFixed(1)} LUFS as mastered): ${GAP_DB} dB between turns, ${SPEECH_DB} dB under one`);
} else {
  ff(["-i", voice, "-af", `aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${TOTAL}`, "-c:a", "pcm_f32le", pre]);
}
loudnorm(pre, final, -14, -2.0);
console.log(`wrote ${final} (-14 LUFS, ${TOTAL} s)`);
