#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Listen with numbers: each line's median pitch against its speaker's median, and its pace. VibeVoice
// now and then renders a line in another register: a line at 250 Hz from a voice whose other lines
// sit at 124 Hz is an octave up, and a listener hears it at once. A short line can also come out
// rushed (7 words in 1.25 s sounds cut off).
//
//   bun tools/voice/pitch.ts <narration dir> [--max-st 4]
//
// Flags a line more than --max-st semitones from its speaker's median, or faster than 5 words a
// second. The fix is usually a re-render of that line with another seed, or "." for "!" at its end
// (lines.ts --only <n> --seed <s>).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pitchTrack, speechSpans } from "./podcast-lib.ts";

const args = process.argv.slice(2);
const dir = resolve(args[0] ?? "");
const maxSt = Number(args[args.indexOf("--max-st") + 1] || 4);
if (!args[0]) { console.error("usage: pitch.ts <narration dir> [--max-st 4]"); process.exit(2); }
const pcm = (f: string) => {
  const b = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", f, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { stdout: "pipe" }).stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const lines = readFileSync(join(dir, "script.txt"), "utf8").split(/\r?\n/).filter((l) => /^[a-z0-9-]+:/i.test(l.trim()));
const rows = lines.map((l, i) => {
  const [who, ...rest] = l.split(":");
  const text = rest.join(":").trim(), x = pcm(join(dir, "lines", `l${i + 1}.wav`));
  const f0 = pitchTrack(x, 16000).f0.filter((h) => h > 0), sp = speechSpans(x, 16000);
  const dur = sp.length ? sp[sp.length - 1][1] - sp[0][0] : 0;
  return { n: i + 1, who: who.trim(), f0: median(f0), dur, wps: text.split(/\s+/).length / Math.max(dur, 0.01), text };
});
const bySpeaker: Record<string, number[]> = {};
for (const r of rows) (bySpeaker[r.who] ??= []).push(r.f0);
let flagged = 0;
for (const r of rows) {
  const ref = median(bySpeaker[r.who]), st = 12 * Math.log2(r.f0 / ref);
  const flags = [Math.abs(st) > maxSt ? `PITCH ${st >= 0 ? "+" : ""}${st.toFixed(1)} st` : "", r.wps > 5 ? "RUSHED" : ""].filter(Boolean);
  if (flags.length) flagged++;
  console.log(`l${String(r.n).padStart(2)} ${r.who.padEnd(8)} ${r.f0.toFixed(0).padStart(4)} Hz (${st >= 0 ? "+" : ""}${st.toFixed(1)} st)  ${r.dur.toFixed(2)} s  ${r.wps.toFixed(1)} w/s  ${flags.join(" ").padEnd(16)} ${r.text.slice(0, 48)}`);
}
console.log(flagged ? `${flagged} line(s) to listen to and probably re-render` : "every line sits in its speaker's range");
process.exit(flagged ? 1 : 0);
