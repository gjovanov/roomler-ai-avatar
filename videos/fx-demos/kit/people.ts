#!/usr/bin/env bun
// The people in 01's call: invented faces only. A candidate is a still, and a person picks before anything moves.
//   bun kit/people.ts faces <people.json>      [{ name, seed, prompt }] -> out/people/cand-<name>.png (1024x768); the prompts and
//                                              seeds stay in the demo's folder, so the same faces can be made again
//   bun kit/people.ts listen <portrait> <out.mp4> [--seconds 5] [--size 640x480] [--seed 3001]
//     a LISTENING clip: InfiniteTalk driven by the model's trained silence (workflows.ts listenClip), so the mouth stays
//     shut, and only blinking, a slow nod and a smile in the prompt (tools/podcast/listen.ts explains why only those).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { alive, files, free, run, stage } from "../../../tools/avatar/comfy.ts";
import { listenClip, portrait } from "../../../tools/avatar/workflows.ts";

const OUT = resolve(import.meta.dir, "..", "out", "people");
const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
// listen.ts's calm listener, in a call instead of a studio.
const LISTEN = "A person in a video call, listening to a colleague who is speaking. Calm and attentive, looking toward the camera; the mouth stays closed and still, not speaking. Only small natural movements: blinking, a slow nod now and then, a slight warm smile. The hands stay still. The camera and the room behind stay still.";

if (!(await alive())) throw new Error("ComfyUI is not answering: tools/avatar/comfy-server.sh start (in WSL)");
mkdirSync(OUT, { recursive: true });
if (args[0] === "faces" && args[1]) {
  for (const c of JSON.parse(readFileSync(resolve(args[1]), "utf8"))) {
    const dst = join(OUT, `cand-${c.name}.png`);
    if (existsSync(dst)) continue;
    const r = await run(portrait({ prompt: c.prompt, width: 1024, height: 768, seed: c.seed, prefix: `people/cand-${c.name}` }), { label: `face ${c.name}` });
    copyFileSync(files(r.outputs)[0], dst);
    console.log(`face ${c.name}: ${r.seconds.toFixed(0)} s`);
  }
} else if (args[0] === "listen" && args[2]) {
  const [W, H] = opt("size", "640x480").split("x").map(Number);
  const frames = Math.ceil(Number(opt("seconds", "5")) * 25);
  const wf = listenClip({ image: stage(args[1]), width: W, height: H, frames, prompt: LISTEN, seed: Number(opt("seed", "3001")), prefix: "people/listen" });
  const r = await run(wf, { label: `listen ${args[2]}` });
  copyFileSync(files(r.outputs).find((f) => f.endsWith(".mp4"))!, resolve(args[2]));
  console.log(`listen ${args[2]}: ${r.seconds.toFixed(0)} s`);
  await free();
} else throw new Error("usage: people.ts faces <people.json> | listen <portrait> <out.mp4> [--seconds 5] [--size 640x480] [--seed 3001]");
