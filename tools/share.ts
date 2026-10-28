#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// A share copy of a finished video, small enough to send for review: its shorter side scaled to --short-side (720),
// x264 two-pass at the bitrate that lands under --max-mib (28), AAC at 96 kbit/s, faststart. The full-quality file
// stays the one to judge and to publish: on a 720p copy, text in a screen recording reads as blurred.
//   bun tools/share.ts <video.mp4> [--out <file>] [--max-mib 28] [--short-side 720]
// Default out: <video's folder>/share/<name>-share.mp4.
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
if (!args[0] || args[0].startsWith("--") || !existsSync(args[0])) { console.error("usage: share.ts <video.mp4> [--out <file>] [--max-mib 28] [--short-side 720]"); process.exit(2); }
const src = resolve(args[0]);
const out = resolve(opt("out") ?? join(dirname(src), "share", `${basename(src).replace(/\.[^.]+$/, "")}-share.mp4`));
const maxMib = Number(opt("max-mib") ?? 28), side = Number(opt("short-side") ?? 720);
mkdirSync(dirname(out), { recursive: true });
const seconds = Number(Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", src], { stdout: "pipe" }).stdout.toString());
// the video's share of the budget, after 96 kbit/s of audio; at most 3.5 Mbit/s, which 720p never needs more than
const kbps = Math.min(3500, Math.floor((maxMib * 8 * 1024 * 1024 / seconds - 96000) / 1000));
if (!(kbps >= 300)) throw new Error(`${seconds.toFixed(0)} s does not fit ${maxMib} MiB at a watchable bitrate (${kbps} kbit/s): raise --max-mib`);
const scale = `scale='if(gt(iw,ih),-2,${side})':'if(gt(iw,ih),${side},-2)':flags=lanczos`;
const tmp = mkdtempSync(join(tmpdir(), "share-")), log = join(tmp, "pass");
const ff = (a: string[]) => { const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...a], { stdout: "pipe", stderr: "pipe" }); if (r.exitCode !== 0) throw new Error(r.stderr.toString().slice(-1500)); };
try {
  ff(["-i", src, "-vf", scale, "-c:v", "libx264", "-preset", "slow", "-b:v", `${kbps}k`, "-pass", "1", "-passlogfile", log, "-an", "-f", "mp4", process.platform === "win32" ? "NUL" : "/dev/null"]);
  ff(["-i", src, "-vf", scale, "-c:v", "libx264", "-preset", "slow", "-b:v", `${kbps}k`, "-pass", "2", "-passlogfile", log, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out]);
} finally { rmSync(tmp, { recursive: true, force: true }); }
const mib = statSync(out).size / 1048576;
console.log(`${out}: ${mib.toFixed(1)} MiB (${seconds.toFixed(1)} s at ${kbps} kbit/s)${mib > maxMib ? `, OVER ${maxMib} MiB` : ""}`);
