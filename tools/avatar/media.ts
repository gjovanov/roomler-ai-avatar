// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Audio finishing shared by compose.ts and compose16.ts.
import { renameSync } from "node:fs";

/** The file's audio true peak in dBTP (ffmpeg's ebur128), NaN when it cannot be read. */
export function truePeak(file: string): number {
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-nostats", "-i", file, "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-"], { stdout: "pipe", stderr: "pipe" });
  return Number(/True peak:\s+Peak:\s+(-?[\d.]+)/.exec(r.stderr.toString().split("Summary:").pop() ?? "")?.[1] ?? NaN);
}

/** AAC can overshoot a sharp onset after silence: an opening "Okay." came out at -0.5 dBTP from a
 *  mix that peaks at -2.0, where a softer start rose 0.1 dB. So the encode is measured, and only when it
 *  passes -1 dBTP is the audio encoded again from the mix through a limiter at -3 dBFS, its lookahead
 *  delay compensated (the speech stays on the same millisecond), the picture copied. */
export function limitTruePeak(out: string, mix: string, ceiling = -1): void {
  const tp = truePeak(out);
  if (tp <= ceiling) return;
  const tmp = out.replace(/\.mp4$/, ".limited.mp4");
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", out, "-i", mix, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
    "-af", "alimiter=limit=0.708:attack=2:release=40:level=false:latency=true", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", tmp], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`true-peak limit: ffmpeg failed:\n${r.stderr.toString().slice(-1500)}`);
  renameSync(tmp, out);
  console.log(`true peak ${tp} dBTP after the encode; limited to ${truePeak(out)} dBTP`);
}
