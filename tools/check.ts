#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The checks a finished video should pass before anyone publishes it: specs, loudness, and (with a
// deny list) what the screen recording might show that it must not.
//
//   bun tools/check.ts <video.mp4> [--deny <terms.txt>] [--reveal] [--json <out.json>]
//
// specs     h264, 1080x1920 or 1920x1080, 30 fps, AAC 48 kHz (a vertical over 90 s is flagged:
//           some platforms refuse longer Shorts and Reels)
// loudness  -14 LUFS +/- 1 and a true peak at or under -1 dBTP (the streaming platforms' target)
// privacy   only with --deny: every frame at 1 fps, whole and in three bands, through tesseract (on the
//           Linux side), against your terms (one per line: host names, people, places, an org name),
//           e-mail addresses and IPv4 addresses. Hits are counted, never printed; --reveal prints the
//           matched terms on the terminal only.
// Exit 0: every check passed. 1: a check found something. 2: a check could not run (never a pass).
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { linuxBash, toLinux } from "./lib/platform.ts";

type Verdict = { gate: string; status: "pass" | "fail" | "error" | "skip"; details: string[] };
const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const file = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : "";
if (!file || !existsSync(file)) { console.error("usage: check.ts <video.mp4> [--deny <terms.txt>] [--reveal] [--json <out.json>]"); process.exit(2); }
const run = (cmd: string[]) => { const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" }); return { code: p.exitCode ?? -1, out: p.stdout.toString(), err: p.stderr.toString() }; };

function specs(): Verdict {
  const p = run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate:format=duration", "-of", "json", file]);
  if (p.code !== 0) return { gate: "specs", status: "error", details: [`ffprobe failed: ${p.err.slice(0, 200)}`] };
  const j = JSON.parse(p.out), v = j.streams.find((s: any) => s.codec_type === "video"), a = j.streams.find((s: any) => s.codec_type === "audio");
  const dur = Number(j.format?.duration ?? 0), d: string[] = [];
  if (!v) return { gate: "specs", status: "fail", details: ["FAIL no video stream"] };
  const [num, den] = String(v.r_frame_rate).split("/").map(Number), fps = den ? num / den : 0;
  d.push(`video ${v.codec_name} ${v.width}x${v.height} @ ${fps.toFixed(2)} fps, ${dur.toFixed(1)} s`);
  if (v.codec_name !== "h264") d.push(`FAIL codec ${v.codec_name}, want h264`);
  const vertical = v.width === 1080 && v.height === 1920;
  if (!vertical && !(v.width === 1920 && v.height === 1080)) d.push(`FAIL size ${v.width}x${v.height}, want 1080x1920 or 1920x1080`);
  if (Math.abs(fps - 30) > 0.05) d.push(`FAIL ${fps.toFixed(2)} fps, want 30`);
  if (vertical && dur > 90) d.push(`FAIL a ${dur.toFixed(0)} s vertical: some platforms refuse Shorts and Reels over 90 s`);
  if (!a) d.push("FAIL no audio stream");
  else {
    d.push(`audio ${a.codec_name} ${a.sample_rate} Hz`);
    if (a.codec_name !== "aac" || Number(a.sample_rate) !== 48000) d.push("FAIL want AAC at 48 kHz");
  }
  return { gate: "specs", status: d.some((x) => x.startsWith("FAIL")) ? "fail" : "pass", details: d };
}

function loudness(): Verdict {
  const p = run(["ffmpeg", "-hide_banner", "-nostats", "-i", file, "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const sum = p.err.split("Summary:").pop() ?? "";
  const I = Number(/\sI:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1]), TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(sum)?.[1]);
  if (!Number.isFinite(I)) return { gate: "loudness", status: "error", details: ["could not read the ebur128 summary"] };
  const d = [`integrated ${I} LUFS, true peak ${TP} dBTP`];
  if (Math.abs(I + 14) > 1) d.push(`FAIL ${I} LUFS, want -14 +/- 1`);
  if (TP > -1) d.push(`FAIL true peak ${TP} dBTP, want at most -1`);
  return { gate: "loudness", status: d.some((x) => x.startsWith("FAIL")) ? "fail" : "pass", details: d };
}

function privacy(): Verdict {
  const denyFile = opt("deny");
  if (!denyFile) return { gate: "privacy", status: "skip", details: ["no --deny list: the recording was not read"] };
  const terms = readFileSync(resolve(denyFile), "utf8").split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim().toLowerCase()).filter((t) => t.length >= 3);
  const dir = mkdtempSync(join(tmpdir(), "avatar-check-"));
  try {
    // Each frame whole AND as three overlapping bands: tesseract reads nothing on a busy whole frame
    // that it reads perfectly from a crop of the caption's band.
    for (const [pre, vf] of [["f", "fps=1"], ["b0", "fps=1,crop=iw:ih*0.40:0:0"], ["b1", "fps=1,crop=iw:ih*0.40:0:ih*0.30"], ["b2", "fps=1,crop=iw:ih*0.40:0:ih*0.60"]]) {
      const x = run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", file, "-vf", vf, join(dir, `${pre}_%05d.png`)]);
      if (x.code !== 0) return { gate: "privacy", status: "error", details: [`frame extraction failed: ${x.err.slice(0, 200)}`] };
    }
    writeFileSync(join(dir, "ocr.sh"), `#!/bin/bash\ncd "${toLinux(dir)}" || exit 3\ncommand -v tesseract >/dev/null || exit 4\nfor f in *_*.png; do echo "=====$f"; tesseract "$f" stdout --psm 11 2>/dev/null; done\n`);
    const o = run(linuxBash(join(dir, "ocr.sh")));
    if (o.code === 4) return { gate: "privacy", status: "error", details: ["tesseract is not installed on the Linux side (apt install tesseract-ocr)"] };
    if (o.code !== 0) return { gate: "privacy", status: "error", details: [`OCR failed (exit ${o.code}): ${o.err.slice(0, 200)}`] };
    const hits = new Map<string, Set<number>>(), found = new Set<string>();
    const add = (kind: string, t: number) => { if (!hits.has(kind)) hits.set(kind, new Set()); hits.get(kind)!.add(t); };
    for (const block of o.out.split("=====").slice(1)) {
      const nl = block.indexOf("\n"), t = Number(/_(\d+)\.png/.exec(block.slice(0, nl))?.[1] ?? 1) - 1, text = block.slice(nl + 1), low = text.toLowerCase();
      for (const term of terms) if (new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}([^a-z0-9]|$)`).test(low)) { add("deny-list term", t); found.add(term); }
      for (const m of text.matchAll(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g)) if (!m.slice(1, 5).some((x) => Number(x) > 255) && !/^(127\.|0\.)/.test(m[0])) add("IPv4 address", t);
      if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) add("e-mail address", t);
    }
    const frames = readdirSync(dir).filter((f) => /^f_\d+\.png$/.test(f)).length;
    const d = [`${frames} frames OCR'd at 1 fps (whole and in three bands) against ${terms.length} terms, e-mail and IPv4 patterns`];
    for (const [kind, ts] of hits) d.push(`FAIL ${kind} at ${[...ts].sort((a, b) => a - b).slice(0, 12).map((t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`).join(", ")}`);
    if (args.includes("--reveal") && found.size) console.error(`reveal (terminal only): ${[...found].join(", ")}`);
    return { gate: "privacy", status: hits.size ? "fail" : "pass", details: d };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const verdicts = [specs(), loudness(), privacy()];
for (const v of verdicts) console.log(`${v.status.toUpperCase().padEnd(5)} ${v.gate}\n${v.details.map((x) => `      ${x}`).join("\n")}`);
const json = opt("json");
if (json) writeFileSync(resolve(json), JSON.stringify({ file, verdicts }, null, 1));
process.exit(verdicts.some((v) => v.status === "error") ? 2 : verdicts.some((v) => v.status === "fail") ? 1 : 0);
