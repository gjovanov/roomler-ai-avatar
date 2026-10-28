// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD

import { describe, expect, test } from "bun:test";
import { beatAt, faceArg, resolveBeats, shiftSrt, visible, type Plan } from "./plan.ts";

const turns = [
  { text: "Welcome to the show." },
  { text: "One open-source app that replaces three." },
  { text: "Every machine I own, in one list." },
  { text: "And when there's no direct path, it goes through a relay." },
  { text: "Every day it connects." },
];
const plan = (beats: Plan["beats"]): Plan => ({ host: "helen", guest: "goran3f", talk: "", words: "", mix: "", studio: "", music: "", music_in: 0, out: "", work: "", pre: 3.2, post: 5, title_png: "", end_png: "", beats });

describe("resolveBeats", () => {
  test("a beat finds its turn by the words its line starts with", () => {
    const b = resolveBeats(plan([{ line: "One open-source app", layout: "cards" }, { line: "every machine I OWN", layout: "screen" }, { turn: 3, layout: "screen" }]), turns);
    expect([...b.keys()]).toEqual([1, 2, 3]);
    expect(beatAt(b, 0).layout).toBe("two");
    expect(beatAt(b, 2).layout).toBe("screen");
  });
  test("a line that starts no turn, or several, is refused", () => {
    expect(() => resolveBeats(plan([{ line: "Nobody said this", layout: "screen" }]), turns)).toThrow("starts no turn");
    expect(() => resolveBeats(plan([{ line: "Every", layout: "screen" }]), turns)).toThrow("starts turns 2, 4; make it longer");
  });
  test("a line and a turn that disagree, or two beats on one turn, are refused", () => {
    expect(() => resolveBeats(plan([{ line: "Every machine", turn: 1, layout: "screen" }]), turns)).toThrow("is turn 2, not 1");
    expect(() => resolveBeats(plan([{ turn: 2, layout: "screen" }, { line: "Every machine", layout: "screen" }]), turns)).toThrow("two beats for turn 2");
  });
});

describe("visible", () => {
  const p = plan([]);
  test("both cameras in two; in cards only the guest, speaking; nobody on a demo", () => {
    expect(visible(p, "helen", "two", "goran3f")).toBe(true);
    expect(visible(p, "goran3f", "cards", "goran3f")).toBe(true);
    expect(visible(p, "helen", "cards", "goran3f")).toBe(false);
    expect(visible(p, "goran3f", "screen", "goran3f")).toBe(false);
  });
});

describe("faceArg and shiftSrt", () => {
  test("plan.faces becomes talk.ts's --face", () => {
    expect(faceArg({ ...plan([]), faces: { goran3f: "goran-studio-r5", helen: "helen-a,helen-b" } })).toBe("goran3f=goran-studio-r5;helen=helen-a,helen-b");
    expect(faceArg(plan([]))).toBe("");
  });
  test("captions move by the title's length, to the millisecond", () => {
    expect(shiftSrt("1\r\n00:00:00,500 --> 00:00:59,900\r\nWelcome.\r\n", 3.2)).toBe("1\n00:00:03,700 --> 00:01:03,100\nWelcome.\n");
  });
});
