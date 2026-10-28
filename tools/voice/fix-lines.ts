#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Re-voices narration lines (the ones the person heard as wrong), choosing among several takes by measurement instead
// of by ear. Made for the podcast pilot's fifth edition (2026-10-28: "Three products, one pers", "What actually happ?",
// "Oh, noooo!" too pitched, "undermated", "I like that anal"). A take must pass:
//  - Whisper: every script word heard, in order (qa-lib.ts coverage; Whisper fills in clipped words, so it is only the
//    first gate);
//  - pitch: the take's median F0 within --max-st semitones of its speaker's median over the narration (pitch.ts's
//    measure: "Oh, noooo!" sat +8 st, nearly an octave up), and at most --max-st-up above it;
//  - pace: at most --max-wps words per second of speech ("underestimated" swallowed at 4.5 w/s);
//  - a clean end: the voice stops at least 100 ms before the take ends. VibeVoice sometimes stops while still sounding
//    the last syllable, and lines.ts's end fade then eats it ("happ", "anal"); Whisper still "hears" the whole word.
//    Measured with the pitch track and the level of the last 60 ms (the takes the person heard as cut ran their
//    voice into the very end; a faint decay at -54 dB passes, the cut one sat at -31).
// --sandwich 10,18: a SHORT line is rendered inside its conversation (the line before, it, the line after) and cut out
// at the pauses between speakers. Alone, VibeVoice rendered "Oh, no!" as silence or noise half the time; inside the
// exchange it gets the intonation of a reply and cannot stop mid-word, since it goes on to the next speaker.
// Takes are cached in <narration>/takes/l<n>-<sha6 of the wording>-s<seed>[-sw].wav; the winner is copied to
// lines/l<n>.wav (a failing take never is), the picks written to <narration>/fix-lines.json.
// ⚠️ The narration (voice.wav, turns.json, captions.srt) still holds the old takes: run lines.ts render again, with the
// same pauses and --safe-end on these lines, but no --only for them and no old --use list. Then mix.ts and words.ts.
//   bun tools/voice/fix-lines.ts <narration dir> --lines 5,7,10 [--seeds 101-106] [--max-st 3] [--max-st-up 3]
//        [--max-wps 4] [--sandwich 10] [--variant "10=Oh, no...|Oh no."] [--fuzzy roomler,tailscale]
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { linuxBash, toLinux } from "../lib/platform.ts";
import { pitchTrack, speechSpans } from "./podcast-lib.ts";
import { coverage, fuzzyArg, tokens } from "./qa-lib.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
if (!args[0] || args[0].startsWith("--")) { console.error("usage: fix-lines.ts <narration dir> --lines n,... [--seeds a-b] [--max-st 3] [--max-st-up 3] [--max-wps 4] [--sandwich n,...] [--variant \"n=a|b\"] [--fuzzy w,...]"); process.exit(2); }
const NARR = resolve(args[0]);
const RENDER = resolve(import.meta.dir, "render.sh");
const FUZZY = fuzzyArg(opt("fuzzy", ""));
const want = opt("lines", "").split(",").filter(Boolean).map(Number);
const [s0, s1] = opt("seeds", "101-106").split("-").map(Number);
const MAX_ST = Number(opt("max-st", "3")), MAX_WPS = Number(opt("max-wps", "4"));
const sandwich = new Set(opt("sandwich", "").split(",").filter(Boolean).map(Number));
// --max-st-up: the most a take may sit ABOVE its speaker's median (default --max-st; 0.5 = no higher than the speaker's
// normal voice, for "natural shock without yelling")
const MAX_UP = Number(opt("max-st-up", opt("max-st", "3")));
const variants = new Map<number, string[]>();
for (let i = 0; i < args.length; i++) if (args[i] === "--variant") { const [n, list] = args[i + 1].split(/=(.*)/s); variants.set(Number(n), list.split("|")); }
const script = readFileSync(join(NARR, "script.txt"), "utf8").split(/\r?\n/).filter((l) => /^[a-z0-9-]+:/i.test(l.trim()))
  .map((l) => { const i = l.indexOf(":"); return { speaker: l.slice(0, i).trim(), text: l.slice(i + 1).trim() }; });
const takes = join(NARR, "takes"); if (!existsSync(takes)) mkdirSync(takes, { recursive: true });

const run = (cmd: string[]) => { const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" }); if (r.exitCode !== 0) throw new Error(`${cmd.slice(0, 4).join(" ")}: ${r.stderr.toString().slice(-400)}`); return r.stdout.toString(); };
const pcm = (f: string) => { const b = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", f, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { stdout: "pipe" }).stdout; return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const db = (x: Float32Array) => { let e = 0; for (const v of x) e += v * v; return 10 * Math.log10(e / Math.max(1, x.length) + 1e-12); };
const toks = (s: string) => tokens(s, FUZZY);

// each speaker's pitch reference: the median of its lines' medians over the current narration (as pitch.ts)
const lineF0 = (f: string) => median(pitchTrack(pcm(f), 16000).f0.filter((h) => h > 0));
const ref: Record<string, number> = {};
{
  const per: Record<string, number[]> = {};
  script.forEach((t, i) => { if (want.includes(i + 1)) return; const f = join(NARR, "lines", `l${i + 1}.wav`); if (existsSync(f)) (per[t.speaker] ??= []).push(lineF0(f)); });
  for (const [k, v] of Object.entries(per)) ref[k] = median(v);
}
console.log(`pitch references: ${Object.entries(ref).map(([k, v]) => `${k} ${v.toFixed(0)} Hz`).join(", ")}`);

const report: any[] = [];
for (const n of want) {
  const t = script[n - 1];
  if (!t) throw new Error(`line ${n}: the narration's script has ${script.length} lines`);
  const texts = [t.text, ...(variants.get(n) ?? [])];
  const cands: any[] = [];
  texts.forEach((text) => {
    for (let seed = s0; seed <= s1; seed++) {
      const sw = sandwich.has(n) && n > 1 && n < script.length;
      // the take's name carries a hash of its WORDING (a variant's index would hand a cached "Oh, noooo!" take to a
      // script that now says "Oh, no!")
      const h6 = createHash("sha256").update(text).digest("hex").slice(0, 6);
      const tag = `l${n}-${h6}-s${seed}${sw ? "-sw" : ""}`, wav = join(takes, `${tag}.wav`), txt = join(takes, `${tag}.txt`);
      if (!existsSync(wav) && sw) {
        const prev = script[n - 2], next = script[n], full = join(takes, `${tag}.full.wav`);
        writeFileSync(txt, `${prev.speaker}: ${prev.text}\n${t.speaker}: ${text}\n${next.speaker}: ${next.text}\n`);
        try { run(linuxBash(RENDER, "render", toLinux(txt), toLinux(full), String(seed), "1.8", "10")); } catch { console.log(`  ${tag}: render failed`); continue; }
        // where the line sits in the exchange: script tokens [prev | line | next] matched to Whisper's words in order
        const hw = (JSON.parse(run(linuxBash(RENDER, "align", toLinux(full)))).words ?? []).flatMap((w: any) => toks(w.word).map((k) => ({ k, start: w.start, end: w.end })));
        const lab = [...toks(prev.text).map((k) => ({ k, p: 0 })), ...toks(text).map((k) => ({ k, p: 1 })), ...toks(next.text).map((k) => ({ k, p: 2 }))];
        const L = Array.from({ length: lab.length + 1 }, () => new Array(hw.length + 1).fill(0));
        for (let i = lab.length - 1; i >= 0; i--) for (let j = hw.length - 1; j >= 0; j--) L[i][j] = lab[i].k === hw[j].k ? 1 + L[i + 1][j + 1] : Math.max(L[i + 1][j], L[i][j + 1]);
        const hit: Array<{ p: number; start: number; end: number }> = [];
        for (let i = 0, j = 0; i < lab.length && j < hw.length;) { if (lab[i].k === hw[j].k) { hit.push({ p: lab[i].p, start: hw[j].start, end: hw[j].end }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
        const mine = hit.filter((h) => h.p === 1), before = hit.filter((h) => h.p === 0), after = hit.filter((h) => h.p === 2);
        if (mine.length < Math.max(1, Math.ceil(toks(text).length * 0.75)) || !before.length || !after.length) { console.log(`  ${tag}: the line is not found in its exchange`); continue; }
        const a = Math.max((before.at(-1)!.end + mine[0].start) / 2, mine[0].start - 0.25), b = Math.min((mine.at(-1)!.end + after[0].start) / 2, mine.at(-1)!.end + 0.6);
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", full, "-af", `atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=N/SR/TB`, wav]);
      }
      if (!existsSync(wav)) { writeFileSync(txt, `${t.speaker}: ${text}\n`); try { run(linuxBash(RENDER, "render", toLinux(txt), toLinux(wav), String(seed), "1.8", "10")); } catch { console.log(`  ${tag}: render failed`); continue; } }
      const x = pcm(wav), dur = x.length / 16000, sp = speechSpans(x, 16000);
      if (!sp.length) { cands.push({ tag, wav, text, seed, bad: "silent" }); continue; }
      const speech = sp[sp.length - 1][1] - sp[0][0], wps = text.split(/\s+/).length / Math.max(speech, 0.01);
      const f0 = lineF0(wav), st = 12 * Math.log2(f0 / ref[t.speaker]);
      const tail = db(x.subarray(Math.max(0, x.length - 960))), body = db(x.subarray(Math.floor(sp[0][0] * 16000), Math.floor(sp[sp.length - 1][1] * 16000)));
      const words = JSON.parse(run(linuxBash(RENDER, "align", toLinux(wav)))).words ?? [];
      const heard = words.map((w: any) => w.word).join(" "), cov = coverage(text, heard, FUZZY);
      const tr = pitchTrack(x, 16000);
      let lastVoiced = -1; tr.f0.forEach((h, i) => { if (h > 0) lastVoiced = i; });
      const unvoicedTail = (tr.f0.length - 1 - lastVoiced) * tr.hop;
      const fails = [cov < (toks(text).length <= 4 ? 0.75 : 0.9) ? `heard ${cov.toFixed(2)}` : "", st > MAX_UP || st < -MAX_ST ? `pitch ${st >= 0 ? "+" : ""}${st.toFixed(1)} st` : "",
        unvoicedTail < 0.1 && tail > body - 40 ? `voice runs into the end (${(unvoicedTail * 1000).toFixed(0)} ms, ${(tail - body).toFixed(0)} dB)` : "",
        wps > MAX_WPS ? `pace ${wps.toFixed(1)} w/s` : "", tail > body - 25 ? `ends loud (${(tail - body).toFixed(0)} dB)` : ""].filter(Boolean);
      cands.push({ tag, wav, text, seed, st: +st.toFixed(1), wps: +wps.toFixed(2), dur: +dur.toFixed(2), endDb: +(tail - body).toFixed(1), heard, fails });
      console.log(`  ${tag.padEnd(14)} ${fails.length ? "FAIL " + fails.join("; ") : "ok"}  (${st.toFixed(1)} st, ${wps.toFixed(1)} w/s, end ${(tail - body).toFixed(0)} dB, ${dur.toFixed(2)} s) "${heard.slice(0, 50)}"`);
    }
  });
  // passing takes first; among them the script's own wording, then pitch nearest the speaker, then a calm pace
  const score = (cd: any) => (cd.bad ? 1e6 : 0) + (cd.fails?.length ?? 9) * 1000 + (cd.text === t.text ? 0 : 100) + Math.abs(cd.st ?? 99) * 10 + Math.abs((cd.wps ?? 9) - 2.8);
  const best = cands.filter((cd) => !cd.bad).sort((a, b) => score(a) - score(b))[0];
  if (!best) { console.log(`line ${n}: no usable take`); report.push({ n, pick: null }); continue; }
  // never put a failing take in the narration: the line keeps what it had
  if (best.fails.length) { console.log(`line ${n}: no take passes (best ${best.tag}: ${best.fails.join("; ")}); lines/l${n}.wav left as it was`); report.push({ n, pick: null, best: best.tag, fails: best.fails }); continue; }
  copyFileSync(best.wav, join(NARR, "lines", `l${n}.wav`));
  writeFileSync(join(NARR, "lines", `l${n}.txt`), `${t.speaker}: ${best.text}\n`);
  report.push({ n, pick: best.tag, text: best.text, st: best.st, wps: best.wps, endDb: best.endDb, fails: best.fails, heard: best.heard });
  console.log(`line ${n}: ${best.tag} "${best.text}" passes (${best.st} st, ${best.wps} w/s, end ${best.endDb} dB)`);
}
writeFileSync(join(NARR, "fix-lines.json"), JSON.stringify(report, null, 1));
