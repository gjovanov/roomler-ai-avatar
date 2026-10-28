#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Renders an HTML page to PNGs through chrome-headless-shell's DevTools protocol (no Playwright package needed), for
// the cards, title, end card, thumbnail and diagrams of a video:
//   bun tools/avatar/html-frames.ts <page.html> <out dir> states <n>              one PNG per state: the page's window.setState(k)
//   bun tools/avatar/html-frames.ts <page.html> <out dir> anim <seconds> [fps]    every frame of its CSS animations (currentTime set)
// 1920x1080; --transparent leaves the page's background transparent where it sets none. Offline: every host name
// resolves to nothing, so a page shows only what it carries itself.
// The browser: AVATAR_CHROME, or Playwright's chrome-headless-shell where Playwright puts it
// (`bunx playwright install chromium-headless-shell`).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [page, outDir, mode, arg, fpsArg] = process.argv.slice(2);
if (!page || !outDir || (mode !== "states" && mode !== "anim") || !arg) { console.error("usage: html-frames.ts <page.html> <out dir> states <n> | anim <seconds> [fps] [--transparent]"); process.exit(2); }
const transparent = process.argv.includes("--transparent");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

function findChrome(): string {
  if (process.env.AVATAR_CHROME) return process.env.AVATAR_CHROME;
  const win = process.platform === "win32", mac = process.platform === "darwin";
  const base = win ? join(process.env.LOCALAPPDATA ?? "", "ms-playwright") : mac ? join(homedir(), "Library", "Caches", "ms-playwright") : join(homedir(), ".cache", "ms-playwright");
  const exe = win ? ["chrome-headless-shell-win64", "chrome-headless-shell.exe"]
    : mac ? [process.arch === "arm64" ? "chrome-headless-shell-mac-arm64" : "chrome-headless-shell-mac-x64", "chrome-headless-shell"]
    : ["chrome-headless-shell-linux64", "chrome-headless-shell"];
  const dirs = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse() : [];
  for (const d of dirs) { const f = join(base, d, ...exe); if (existsSync(f)) return f; }
  throw new Error(`no chrome-headless-shell under ${base}: install it (bunx playwright install chromium-headless-shell) or set AVATAR_CHROME`);
}

const exe = findChrome();
const port = 9340 + Math.floor(Math.random() * 50);
const prof = mkdtempSync(join(tmpdir(), "html-frames-"));
const ch = Bun.spawn([exe, "--headless", "--hide-scrollbars", `--remote-debugging-port=${port}`, "--window-size=1920,1080", "--force-device-scale-factor=1",
  `--user-data-dir=${prof}`, "--host-resolver-rules=MAP * ~NOTFOUND", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let targets: any[] = [];
for (let i = 0; i < 60 && !targets.length; i++) { await sleep(250); try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t: any) => t.type === "page"); } catch {} }
if (!targets.length) { ch.kill(); throw new Error("chrome-headless-shell did not answer"); }
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map<number, (v: any) => void>();
ws.addEventListener("message", (e) => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)!(m); pend.delete(m.id); } });
const cdp = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr: string) => { const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500)); return r.result?.result?.value; };
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
if (transparent) await cdp("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
await cdp("Page.navigate", { url: "file:///" + resolve(page).replaceAll(String.fromCharCode(92), "/") });
await sleep(1500);
await ev("document.fonts.ready.then(() => true)");
const shot = async (file: string) => { const s = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); writeFileSync(file, Buffer.from(s.result.data, "base64")); };
if (mode === "states") {
  for (let k = 0; k < Number(arg); k++) { await ev(`window.setState(${k}); true`); await sleep(120); await shot(`${outDir}/state-${k}.png`); }
  console.log(`${arg} states -> ${outDir}`);
} else {
  const fps = Number(fpsArg ?? 30), n = Math.round(Number(arg) * fps);
  await ev("document.getAnimations().forEach(a => a.pause()); true");
  for (let f = 0; f < n; f++) {
    await ev(`document.getAnimations().forEach(a => { a.currentTime = ${(1000 * f / fps).toFixed(3)}; }); true`);
    await shot(`${outDir}/f-${String(f).padStart(4, "0")}.png`);
  }
  console.log(`${n} frames at ${fps} fps -> ${outDir}`);
}
ws.close(); ch.kill();
await ch.exited;
try { rmSync(prof, { recursive: true, force: true }); } catch {}
