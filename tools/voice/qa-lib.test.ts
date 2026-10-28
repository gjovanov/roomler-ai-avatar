// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD

import { describe, expect, test } from "bun:test";
import { coverage, fuzzyArg, scoreLine, tokens } from "./qa-lib.ts";

const none = new Set<string>();
// Whisper's words with times: `spaced` puts them 0.3 s apart, starting at `t0`.
const spaced = (text: string, t0 = 0.1, step = 0.3) => text.split(" ").map((word, i) => ({ word, start: t0 + i * step, end: t0 + i * step + 0.25 }));

describe("tokens", () => {
  test("fold a drawn-out letter, drop numbers and the fuzzy names", () => {
    expect(tokens("Oh, noooo!", none)).toEqual(["oh", "no"]);
    expect(tokens("Fifty-six frames, 56 of them", none)).toEqual(["frames", "of", "them"]);
    expect(tokens("Roomler waves", fuzzyArg("roomler,tailscale"))).toEqual(["waves"]);
  });
  test("a run of laughs is one ha, only when asked", () => {
    expect(tokens("Hahaha, nicely reframed.", none, true)).toEqual(["ha", "nicely", "reframed"]);
    expect(tokens("Hahaha, nicely reframed.", none)).toEqual(["hahaha", "nicely", "reframed"]);
  });
});

describe("coverage", () => {
  test("Whisper's spellings of numbers, names and drawn-out words still count as heard", () => {
    expect(coverage("Oh, noooo!", "Oh, no.", none)).toBe(1);
    expect(coverage("fifty-six frames a second", "56 frames a second", none)).toBe(1);
    expect(coverage("So now Roomler waves.", "So now Romelar waves.", fuzzyArg("roomler"))).toBe(1);
  });
  test("a dropped opening costs its words", () => {
    expect(coverage("Short answer. There's a setup wizard.", "There's a setup wizard.", none)).toBeCloseTo(4 / 6, 5);
    expect(coverage("Two ways. There's a setup wizard.", "There's a setup wizard.", none)).toBeCloseTo(4 / 5, 5);   // "two": a number, uncounted
  });
});

describe("scoreLine", () => {
  test("a clean take has no flags", () => {
    expect(scoreLine("And you thought, challenge accepted.", spaced("And you thought, challenge accepted."), none).flags).toEqual([]);
  });
  test("a garbled opening", () => {
    expect(scoreLine("That one is my favorite.", spaced("Vaulting in doppler's my favorite."), none).flags).toContain("opening");
  });
  test("a sound before the line", () => {
    expect(scoreLine("And you thought, challenge accepted.", spaced("race here, and you thought, challenge accepted."), none).flags).toContain("2 words before the line");
  });
  test("a line said twice runs long", () => {
    const flags = scoreLine("It's a sports car for your mouse.", spaced("It's a sports car for your mouse. It's a sports car for your mouse.", 0.1, 0.5), none).flags;
    expect(flags.some((f) => f.startsWith("long"))).toBe(true);
  });
  test("a stall between two words", () => {
    const ws = [...spaced("No,"), ...spaced("it forwards encrypted packets", 2.4)];
    expect(scoreLine("No, it forwards encrypted packets.", ws, none).flags.some((f) => f.startsWith("stall"))).toBe(true);
  });
  test("a laugh alone is only too long, never garbled", () => {
    expect(scoreLine("Hahaha.", [{ word: "Haha.", start: 0.1, end: 1.2 }], none).flags).toEqual([]);
    expect(scoreLine("Hahaha.", [{ word: "Haha", start: 0.1, end: 1.0 }, { word: "haha.", start: 3.0, end: 3.6 }], none).flags).toContain("laugh 3.5 s");
  });
});
