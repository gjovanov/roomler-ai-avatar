// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Where things run. The GPU side (ComfyUI, VibeVoice, Whisper) is Linux; the tools are bun scripts that
// run either on Linux next to it, or on Windows with the Linux side in WSL. These helpers hide that:
// on Windows a bash script runs through `wsl -- bash` and a path is handed over as /mnt/<drive>/...
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const isWindows = process.platform === "win32";

/** A path as the Linux side sees it: WSL's /mnt/<drive>/... for a Windows path, unchanged on Linux. */
export function toLinux(p: string): string {
  const abs = resolve(p);
  return isWindows ? abs.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`) : abs;
}

/** argv that runs a bash script on the Linux side, with its arguments (paths already converted). */
export function linuxBash(script: string, ...args: string[]): string[] {
  return isWindows ? ["wsl", "--", "bash", toLinux(script), ...args] : ["bash", script, ...args];
}

function firstFile(candidates: string[]): string | undefined {
  return candidates.find((f) => existsSync(f));
}

/** The bold font ffmpeg's drawtext uses for labels, cards and the end card (AVATAR_FONT_FILE). */
export const FONT_FILE =
  process.env.AVATAR_FONT_FILE ??
  firstFile(isWindows
    ? ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]
    : ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"]) ??
  "";

/** The font family the karaoke captions ask libass for (AVATAR_CAPTION_FONT). */
export const CAPTION_FONT = process.env.AVATAR_CAPTION_FONT ?? (isWindows ? "Segoe UI Black" : "DejaVu Sans");

/** A file path written into an ffmpeg filter argument: forward slashes, the drive colon escaped. */
export const ffPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");

/** drawtext's fontfile=..., or a clear error when no font was found. */
export function fontArg(): string {
  if (!FONT_FILE) throw new Error("no bold font found for drawtext: set AVATAR_FONT_FILE to a .ttf file");
  return `fontfile='${ffPath(FONT_FILE)}'`;
}
