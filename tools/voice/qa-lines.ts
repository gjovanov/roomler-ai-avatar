#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Reads every line of a narration (a lines.ts folder) back with Whisper and renders the doubtful ones again, by
// written rules (qa-lib.ts scoreLine: coverage, a garbled opening, a sound before the line, a line said twice, a
// stall), so a narration can be checked unattended. A flagged line is rendered again with --seeds (render.sh, like
// lines.ts), each take scored the same way, and the best one wins. Writes <narration>/qa.json and qa-use.txt, the
// --use list for lines.ts (run lines.ts render again with it to put the takes in).
// ⚠️ Whisper fills in a word the voice did not finish ("happened" for a take that stops at "happ"), so a line that
// passes here can still be cut off: fix-lines.ts checks the voice itself, and the person listens to every line.
//   bun tools/voice/qa-lines.ts <script.txt> <narration dir> [--only n,...] [--seeds 43-46] [--fuzzy roomler,tailscale]
//   bun tools/voice/qa-lines.ts --score <wav> "<text>" [--fuzzy ...]     one take's score: test the rules on known bad takes
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { linuxBash, toLinux } from "../lib/platform.ts";
import { fuzzyArg, scoreLine, type HeardWord } from "./qa-lib.ts";

const args = process.argv.slice(2);
const opt = (n: string, d = "") => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [scriptFile, narrArg] = args;
if (!scriptFile || !narrArg) { console.error("usage: qa-lines.ts <script.txt> <narration dir> [--only n,...] [--seeds 43-46] [--fuzzy w,...] | --score <wav> \"<text>\""); process.exit(2); }
const RENDER = resolve(import.meta.dir, "render.sh");
const FUZZY = fuzzyArg(opt("fuzzy"));
const run = (cmd: string[]) => { const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" }); if (r.exitCode !== 0) throw new Error(`${cmd.slice(0, 4).join(" ")}: ${r.stderr.toString().slice(-600)}`); return r.stdout.toString(); };
const align = (wav: string): HeardWord[] => JSON.parse(run(linuxBash(RENDER, "align", toLinux(wav)))).words ?? [];
const score = (text: string, ws: HeardWord[]) => scoreLine(text, ws, FUZZY);

if (scriptFile === "--score") { console.log(JSON.stringify(score(args[2], align(resolve(narrArg))))); process.exit(0); }
const NARR = resolve(narrArg);
const lines = readFileSync(scriptFile, "utf8").split(/\r?\n/).filter((l) => /^[\w-]+:\s/.test(l)).map((l) => { const i = l.indexOf(":"); return { speaker: l.slice(0, i), text: l.slice(i + 1).trim() }; });
const takes = join(NARR, "takes"); if (!existsSync(takes)) mkdirSync(takes, { recursive: true });
const [s0, s1] = (opt("seeds") || "43-46").split("-").map(Number);
const report: any[] = []; const use: string[] = [];
// --only n,n: read just these lines (the ones a revision changed; the others keep their checked takes).
const ONLY = new Set(opt("only").split(",").filter(Boolean).map(Number));
for (const [i, t] of lines.entries()) {
  const n = i + 1, wav = join(NARR, "lines", `l${n}.wav`);
  if (ONLY.size && !ONLY.has(n)) continue;
  if (!existsSync(wav)) throw new Error(`no ${wav}: render the narration first`);
  let best = { seed: 42, file: wav, ...score(t.text, align(wav)) };
  const tried = [{ seed: 42, coverage: best.coverage, flags: best.flags }];
  for (let seed = s0; seed <= s1; seed++) {
    if (!best.flags.length) break;
    const one = join(takes, `l${n}-s${seed}.txt`), out = join(takes, `l${n}-s${seed}.wav`);
    writeFileSync(one, `${t.speaker}: ${t.text}\n`);
    if (!existsSync(out)) run(linuxBash(RENDER, "render", toLinux(one), toLinux(out), String(seed), "1.8", "10"));
    const sc = score(t.text, align(out));
    tried.push({ seed, coverage: sc.coverage, flags: sc.flags });
    if (sc.flags.length < best.flags.length || (sc.flags.length === best.flags.length && sc.coverage > best.coverage)) best = { seed, file: out, ...sc };
  }
  if (best.seed !== 42) use.push(`${n}=${best.file}`);
  report.push({ n, speaker: t.speaker, text: t.text, pick: best.seed, coverage: best.coverage, flags: best.flags, heard: best.heard, tried });
  console.log(`L${String(n).padStart(2)} ${t.speaker.padEnd(7)} seed ${best.seed} cov ${best.coverage.toFixed(2)} ${best.flags.length ? "FLAGS " + best.flags.join("; ") : "ok"}${tried.length > 1 ? ` (tried ${tried.map((x) => x.seed).join(",")})` : ""}`);
}
writeFileSync(join(NARR, "qa.json"), JSON.stringify(report, null, 1));
writeFileSync(join(NARR, "qa-use.txt"), use.join(","));
console.log(`USE=${use.join(",")}`);
console.log(`${report.filter((r) => r.flags.length).length} lines still flagged after retakes`);
