#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// Claude plans the edit. Given the brief's sourced claims, the narration's timed turns and the screen
// recording's shots, one headless run (tools/llm/claude.ts: no tools, a JSON schema) picks a layout
// for every turn, writes the on-screen cards and their times, proposes three hook variants for an A/B
// test, and a cover. The answer is then checked here, rule by rule, before a compose may use it.
//
//   bun tools/avatar/storyboard.ts --brief <brief.yaml> --narration <dir> --shots <shots.json>
//        --out <storyboard.json> [--model opus] [--effort high] [--style <rules.md>]
//   bun tools/avatar/storyboard.ts retime --brief ... --narration <new dir> --shots <new shots.json>
//        --out <storyboard.json> --from <old storyboard.json> --old-shots <old shots.json>
//        --old-narration <old dir> [--swap michael=noah]       the same plan on a re-voiced timeline
//
// The brief (YAML, single-line values): product, about, end_title, end_subtitle, and a `claims:` list of
// `- claim: "..."` lines. Every card must cite one claim: a card that cannot is never written.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runClaude } from "../llm/claude.ts";
import { loadPresenters } from "./comfy.ts";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const need = (n: string) => { const v = opt(n); if (!v) { console.error(`storyboard.ts: --${n} is required`); process.exit(2); } return resolve(v); };
const BRIEF = need("brief"), NARR = need("narration"), SHOTS = need("shots"), OUT = need("out");

// The brief: a few single-line fields and the claims (one "- claim:" line each).
const briefText = readFileSync(BRIEF, "utf8");
const field = (k: string) => briefText.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1].trim().replace(/^"(.*)"$/, "$1");
const claims = [...briefText.matchAll(/^\s*- claim: (.+)$/gm)].map((m) => m[1].trim().replace(/^"(.*)"$/, "$1"));
if (!claims.length) throw new Error(`no "- claim:" lines in ${BRIEF}`);
const product = field("product") ?? "the product";
const about = field("about") ?? "";
const endCard = { title: field("end_title") ?? product, subtitle: field("end_subtitle") ?? "" };

const turns = JSON.parse(readFileSync(join(NARR, "turns.json"), "utf8")) as Array<{ speaker: string; text: string; start: number; end: number }>;
const shots = JSON.parse(readFileSync(SHOTS, "utf8")) as { screen_end: number; total: number; shots: Array<{ start: number; end: number; what: string }> };
const reg = loadPresenters();
const speakers = [...new Set(turns.map((t) => t.speaker))];

const STYLE = opt("style") ? readFileSync(resolve(opt("style")!), "utf8") : `- Plain words a person would say out loud. No hype ("revolutionary", "game-changing", "seamless", "unleash", "supercharge").
- No dashes of any kind in a card, no exclamation marks, no emoji, no ending full stop.
- State the fact; never stage it ("Here's the thing:", "The best part?").
- A number beats an adjective: "56 fps" over "blazing fast".
- Never claim more than the claim it cites says.`;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["beats", "cards", "hooks", "cover", "notes"],
  properties: {
    beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "layout", "why"], properties: {
      turn: { type: "integer" }, layout: { type: "string", enum: ["split", "solo", "end"] }, why: { type: "string" } } } },
    cards: { type: "array", items: { type: "object", additionalProperties: false, required: ["start", "end", "text", "claim"], properties: {
      start: { type: "number" }, end: { type: "number" }, text: { type: "string" }, claim: { type: "integer" } } } },
    hooks: { type: "array", items: { type: "object", additionalProperties: false, required: ["line", "card", "why"], properties: {
      line: { type: "string" }, card: { type: "string" }, why: { type: "string" } } } },
    cover: { type: "object", additionalProperties: false, required: ["text", "presenter", "why"], properties: {
      text: { type: "string" }, presenter: { type: "string", enum: speakers }, why: { type: "string" } } },
    notes: { type: "string" },
  },
};

const prompt = `You are planning the edit of a short promotional video for ${product}${about ? `: ${about}` : ""}. The narration is already recorded and approved; you decide what the viewer SEES during each turn, and you write the short on-screen cards. Nothing you write is spoken.

## The video
AI-generated presenters (labelled as AI on screen) host it: ${speakers.map((s) => `${s} (${reg[s]?.label ?? s})`).join(" and ")}. Beside them runs a REAL screen recording of the product, at real speed. The presenters are never the proof; the recording is. The same plan is composed as a vertical 9:16 (recording on top, the presenters as video-call tiles below) and as a 16:9 (recording full frame, the speaking presenter in a corner bubble).

## Layouts (one per turn)
- "split": the recording plus the speaking presenter. Use it whenever the recording shows what the turn is about.
- "solo": the speaking presenter large; the recording is hidden for that turn (it keeps running underneath). Use it only for a short reaction or punchline turn (under about 3 s of speech) where the recording would add nothing; at most three solo turns in the whole video, never the first turn (the first two seconds must show the product), never two in a row.
- "end": the end card ("${endCard.title}"${endCard.subtitle ? `, "${endCard.subtitle}"` : ""}) with the speaker. Required for every turn that starts after the recording ends (${shots.screen_end.toFixed(2)} s); not allowed before it.

## Cards
A card is a line of text over the recording, shown from "start" to "end" seconds. Write at most six words and 32 characters per card. Every card states one of the sourced claims below and gives its index in "claim"; a card that cannot cite a claim does not exist. Cards may not overlap, must sit inside 0..${shots.screen_end.toFixed(2)} s, should each stay up at least 2.5 s, and should change when the recording changes subject. Cards are hidden during solo turns, so time them around those. The first card is the hook and starts at 0.

## Hook variants
Propose three alternative FIRST LINES for an A/B test of the opening, each spoken by ${turns[0].speaker} in under 20 words, each with a matching hook card (six words at most). They must stay true to the claims. Explain in "why" what each one tests.

## Cover
One cover text (at most five words and 28 characters, so it reads at thumbnail size) for the thumbnail, and which presenter's face goes on it.

## Style rules for every word you write
${STYLE}

## Sourced claims (index: claim)
${claims.map((c, i) => `${i}: ${c}`).join("\n")}

## Narration turns (index, speaker, seconds, words)
${turns.map((t, i) => `${i}. ${t.speaker} ${t.start.toFixed(2)}-${t.end.toFixed(2)}: ${t.text}`).join("\n")}

## The recording's shots (seconds on the same timeline)
${shots.shots.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}: ${s.what}`).join("\n")}

Return one beat for every turn (${turns.length} beats), the cards, three hooks, the cover, and in "notes" anything the editor should know.`;

// ---- the rules, checked: an answer that breaks one is refused, never patched silently.
function check(sb: any): { cards: any[]; problems: string[] } {
  const problems: string[] = [];
  if (sb.beats.length !== turns.length) problems.push(`${sb.beats.length} beats for ${turns.length} turns`);
  const layoutOf = (k: number) => sb.beats.find((b: any) => b.turn === k)?.layout;
  turns.forEach((t, k) => {
    const l = layoutOf(k);
    if (!l) problems.push(`turn ${k} has no beat`);
    if (t.start >= shots.screen_end && l !== "end") problems.push(`turn ${k} starts after the recording: must be "end"`);
    if (t.start < shots.screen_end && l === "end") problems.push(`turn ${k} is "end" while the recording still runs`);
    if (l === "solo" && t.end - t.start > 3.5) problems.push(`turn ${k} is solo with ${(t.end - t.start).toFixed(1)} s of speech`);
    if (l === "solo" && layoutOf(k - 1) === "solo") problems.push(`turns ${k - 1} and ${k} are both solo`);
  });
  if (layoutOf(0) !== "split") problems.push("the first turn must show the recording (split)");
  if (sb.beats.filter((b: any) => b.layout === "solo").length > 3) problems.push("more than three solo turns");
  const cards = [...sb.cards].sort((a: any, b: any) => a.start - b.start);
  cards.forEach((c: any, i: number) => {
    if (c.text.length > 32 || c.text.split(/\s+/).length > 6) problems.push(`card "${c.text}" is over six words or 32 characters`);
    if (/[–—]/.test(c.text)) problems.push(`card "${c.text}" has a dash`);
    if (!(c.claim >= 0 && c.claim < claims.length)) problems.push(`card "${c.text}" cites no claim`);
    if (c.start < 0 || c.end > shots.screen_end + 0.01 || c.end <= c.start) problems.push(`card "${c.text}" at ${c.start}-${c.end} is outside the recording`);
    if (i > 0 && c.start < cards[i - 1].end - 0.01) problems.push(`cards "${cards[i - 1].text}" and "${c.text}" overlap`);
  });
  if (!cards.length || cards[0].start > 0.01) problems.push("the hook card must start at 0");
  if (sb.cover && (sb.cover.text.length > 28 || sb.cover.text.split(/\s+/).length > 5)) problems.push(`cover "${sb.cover.text}" is over five words or 28 characters`);
  return { cards, problems };
}
function finish(sb: any, run: Record<string, unknown>, what: string) {
  const { cards, problems } = check(sb);
  writeFileSync(OUT, JSON.stringify({ ...sb, cards, end_card: endCard, _run: { ...run, problems } }, null, 2) + "\n");
  console.log(`storyboard: ${sb.beats.filter((b: any) => b.layout !== "split").map((b: any) => `${b.turn}=${b.layout}`).join(" ")} · ${cards.length} cards · ${what}`);
  for (const c of cards) console.log(`  ${c.start.toFixed(2)}-${c.end.toFixed(2)} "${c.text}" (claim ${c.claim})`);
  if (problems.length) { console.error(`REFUSED (${OUT} kept for reading):\n- ${problems.join("\n- ")}`); process.exit(1); }
}

if (args[0] === "retime") {
  // The same edit on a new timeline, with no model run: a re-voiced narration moves every turn and
  // shot, and the approved plan should move with them, not be planned again. Every card time maps
  // piecewise-linearly through anchors that exist in both timelines: each shot's edges and each turn's
  // speech edges. A card that sat on a turn start stays on it.
  const from = JSON.parse(readFileSync(need("from"), "utf8"));
  const oldShots = JSON.parse(readFileSync(need("old-shots"), "utf8")) as typeof shots;
  const oldTurns = JSON.parse(readFileSync(join(need("old-narration"), "turns.json"), "utf8")) as typeof turns;
  if (oldTurns.length !== turns.length || oldShots.shots.length !== shots.shots.length) throw new Error("the old and new timelines differ in turns or shots: plan again instead");
  const pairs: Array<[number, number]> = [];
  oldShots.shots.forEach((s, i) => pairs.push([s.start, shots.shots[i].start], [s.end, shots.shots[i].end]));
  oldTurns.forEach((t, k) => pairs.push([t.start, turns[k].start], [t.end, turns[k].end]));
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let i = 1; i < pairs.length; i++) if (pairs[i][1] < pairs[i - 1][1] - 1e-6) throw new Error(`the anchors cross at old ${pairs[i][0]}: plan again instead`);
  const map = (t: number) => {
    const i = pairs.findIndex((p) => p[0] >= t);
    if (i < 0) return +(t + pairs[pairs.length - 1][1] - pairs[pairs.length - 1][0]).toFixed(3);
    if (i === 0 || pairs[i][0] === t) return pairs[i][1];
    const [a0, a1] = pairs[i - 1], [b0, b1] = pairs[i];
    return +(a1 + ((t - a0) * (b1 - a1)) / (b0 - a0 || 1)).toFixed(3);
  };
  const swap = Object.fromEntries((opt("swap", "") ?? "").split(",").filter(Boolean).map((s) => s.split("=")));
  const sb = {
    ...from,
    cards: from.cards.map((c: any) => ({ ...c, start: map(c.start), end: Math.min(map(c.end), shots.screen_end) })),
    cover: from.cover ? { ...from.cover, presenter: swap[from.cover.presenter] ?? from.cover.presenter } : from.cover,
  };
  delete sb._run;
  finish(sb, { retimed_from: need("from"), anchors: pairs.length }, `retimed through ${pairs.length} anchors`);
} else {
  const cwd = mkdtempSync(join(tmpdir(), "avatar-storyboard-"));
  const t0 = Date.now();
  const r = await runClaude({ prompt, cwd, model: opt("model", "opus")!, maxTurns: 4, jsonSchema: SCHEMA, effort: opt("effort", "high") as any, timeoutMs: 15 * 60_000, logPath: join(cwd, "run.jsonl") });
  if (r.kind !== "ok") throw new Error(`storyboard run: ${r.kind}: ${r.message}`);
  finish(r.structured as any, { model: r.model, seconds: (Date.now() - t0) / 1000, turns: r.numTurns }, `${r.model} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
