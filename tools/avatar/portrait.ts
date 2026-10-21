#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// A presenter's portrait. Renders candidates for several seeds; a person looks at them and picks one,
// which becomes the presenter's face for every video (the registry's `portrait`, with the seed recorded
// so the same face can be rendered again).
//
//   bun tools/avatar/portrait.ts render <id> [--seeds 11,12,13,14] [--size 1024]        an invented face (Z-Image-Turbo)
//   bun tools/avatar/portrait.ts edit <id> --from <photo> [--seeds 21,22,23,24] [--size 1024] [--keep-framing] [--prompt "..."]
//                                                                                       a real person's own photo (Qwen-Image-Edit-2511)
//   bun tools/avatar/portrait.ts pick <id> <seed> [--edit | --keep]
//
// Candidates go to <AVATAR_WORK>/presenters/<id>/. A pick goes to the presenter's `portrait`: next to the
// registry for an invented face, the private folder ("private:<file>", AVATAR_PRIVATE) for a real
// person, whose face never enters a repository.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { alive, files, portraitFile, PRESENTERS, run, stage, WORK } from "./comfy.ts";
import { portrait, qwenEdit } from "./workflows.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const [cmd, id, pickSeed] = args;
const reg = JSON.parse(readFileSync(PRESENTERS, "utf8"));
const p = reg[id];
if (!p || !["render", "edit", "pick"].includes(cmd)) {
  console.error(`usage: portrait.ts render <id> [--seeds ..] [--size 1024] | edit <id> --from <photo> [--seeds ..] [--keep-framing] [--prompt ..] | pick <id> <seed> [--edit|--keep]\n(presenters: ${Object.keys(reg).filter((k) => k !== "_note").join(", ")} in ${PRESENTERS})`);
  process.exit(2);
}
const dir = join(WORK, "presenters", id);

if (cmd === "render" || cmd === "edit") {
  if (!(await alive())) throw new Error("ComfyUI is not answering: run tools/avatar/comfy-server.sh start (in WSL on Windows)");
  if (cmd === "edit" && !p.real_person) throw new Error(`${id} is an invented presenter: edit is for a real person's own photo ("real_person": true, with their consent recorded)`);
  mkdirSync(dir, { recursive: true });
  const size = Number(opt("size", "1024"));
  const from = cmd === "edit" ? resolve(opt("from", "")) : "";
  if (cmd === "edit" && !existsSync(from)) throw new Error(`--from ${from}: no such photo`);
  const ref = cmd === "edit" ? stage(from) : "";
  for (const seed of opt("seeds", cmd === "edit" ? "21,22,23,24" : "11,12,13,14").split(",").map(Number)) {
    const wf = cmd === "edit"
      ? qwenEdit({ image: ref, prompt: opt("prompt", p.portrait_prompt), seed, prefix: `presenter-${id}-edit-${seed}`, ...(args.includes("--keep-framing") ? {} : { width: size, height: size }) })
      : portrait({ prompt: p.portrait_prompt, width: size, height: size, seed, prefix: `presenter-${id}-${seed}` });
    const r = await run(wf, { label: `${id} seed ${seed}` });
    const [png] = files(r.outputs);
    const out = join(dir, `${cmd === "edit" ? (args.includes("--keep-framing") ? "keep" : "edit") : "seed"}-${seed}.png`);
    copyFileSync(png, out);
    console.log(`${id} seed ${seed}: ${out} (${r.seconds.toFixed(1)} s)`);
  }
} else {
  const src = join(dir, `${args.includes("--edit") ? "edit" : args.includes("--keep") ? "keep" : "seed"}-${pickSeed}.png`);
  if (!existsSync(src)) throw new Error(`no candidate ${src}: render it first`);
  const dst = portraitFile(p.portrait);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  reg[id].portrait_seed = Number(pickSeed);
  writeFileSync(PRESENTERS, JSON.stringify(reg, null, 2) + "\n");
  console.log(`${id}: seed ${pickSeed} -> ${resolve(dst)}`);
}
