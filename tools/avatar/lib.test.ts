// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD

import { describe, expect, test } from "bun:test";
import { assColor, assColorA, bestWordsPerTurn, karaokeAss, pages, pinnedSegments, segments, wordTimes } from "./lib.ts";

const turns = [
  { speaker: "michael", text: "Okay. This is a Mac mini.", start: 0.56, end: 2.5 },
  { speaker: "emma", text: "On Wayland, no less!", start: 3.3, end: 5.0 },
  { speaker: "michael", text: "Roomler is open source.", start: 5.8, end: 7.4 },
];

describe("segments", () => {
  test("tile the timeline, cut in the middle of each gap", () => {
    const s = segments(turns, 8.4);
    expect(s.map((x) => [x.speaker, x.start, x.end])).toEqual([["michael", 0, 2.9], ["emma", 2.9, 5.4], ["michael", 5.4, 8.4]]);
    for (let i = 1; i < s.length; i++) expect(s[i].start).toBe(s[i - 1].end);
    s.forEach((x, i) => { expect(x.start).toBeLessThanOrEqual(turns[i].start); expect(x.end).toBeGreaterThanOrEqual(turns[i].end); });
  });
});

describe("pinnedSegments", () => {
  // emma (turn 1) keeps the window her clip was rendered for; michael's re-voiced turns grew.
  const t2 = [
    { speaker: "noah", text: "a", start: 0.56, end: 3.1 },
    { speaker: "emma", text: "b", start: 4.0, end: 5.7 },
    { speaker: "noah", text: "c", start: 6.6, end: 8.9 },
  ];
  test("a pinned turn keeps its lead and tail; its neighbours absorb the rest", () => {
    const s = pinnedSegments(t2, 10, { 1: { lead: 0.44, tail: 0.4 } });
    expect(s[1].start).toBeCloseTo(3.56, 3);
    expect(s[1].end).toBeCloseTo(6.1, 3);
    expect(s[0].end).toBe(s[1].start);
    expect(s[2].start).toBe(s[1].end);
    expect(s[2].end).toBe(10);
  });
  test("a window that would reach into a neighbour's speech is refused", () => {
    expect(() => pinnedSegments(t2, 10, { 1: { lead: 1.2, tail: 0.4 } })).toThrow(/reaches into turn 0/);
  });
});

describe("bestWordsPerTurn", () => {
  test("a turn the preferred pass dropped takes the other pass's words", () => {
    const medium = [{ word: "Okay.", start: 0.6, end: 0.9 }, { word: "This", start: 1.0, end: 1.1 }, { word: "is", start: 1.1, end: 1.2 }, { word: "a", start: 1.2, end: 1.3 }, { word: "Mac", start: 1.3, end: 1.6 }];
    const base = [{ word: "Okay,", start: 0.5, end: 0.9 }, { word: "On", start: 3.3, end: 3.4 }, { word: "Whalen", start: 3.4, end: 3.9 }, { word: "no", start: 3.9, end: 4.1 }, { word: "less.", start: 4.1, end: 4.9 }];
    const w = bestWordsPerTurn(turns.slice(0, 2), [medium, base]);
    expect(w.filter((x) => x.start < 2.6).map((x) => x.word)).toEqual(["Okay.", "This", "is", "a", "Mac"]);
    expect(w.filter((x) => x.start > 3).map((x) => x.word)).toEqual(["On", "Whalen", "no", "less."]);
  });
});

describe("wordTimes", () => {
  // Whisper's spelling and splits differ from the script's; the script's words are what shows.
  const asr = [
    { word: "Okay,", start: 0.5, end: 0.9 }, { word: "this", start: 0.95, end: 1.1 }, { word: "is", start: 1.1, end: 1.2 },
    { word: "a", start: 1.2, end: 1.3 }, { word: "Mac", start: 1.3, end: 1.6 }, { word: "Mini", start: 1.6, end: 2.4 },
    { word: "On", start: 3.3, end: 3.4 }, { word: "Whalen", start: 3.4, end: 3.9 }, { word: "no", start: 3.9, end: 4.1 }, { word: "less.", start: 4.1, end: 4.9 },
    { word: "Ralar", start: 5.8, end: 6.2 }, { word: "is", start: 6.2, end: 6.3 }, { word: "open", start: 6.3, end: 6.7 }, { word: "source.", start: 6.7, end: 7.5 },
  ];
  const w = wordTimes(turns, asr);
  test("keeps the script's spelling and order", () => {
    expect(w.map((x) => x.text).join(" ")).toBe("Okay. This is a Mac mini. On Wayland, no less! Roomler is open source.");
  });
  test("heard words take Whisper's times, clamped to their turn", () => {
    expect(w[0]).toMatchObject({ text: "Okay.", start: 0.56, end: 0.9, heard: true });
    expect(w[5]).toMatchObject({ text: "mini.", start: 1.6, end: 2.4 });
    expect(w[w.length - 1]).toMatchObject({ text: "source.", end: 7.4 });
  });
  test("a mishearing past one edit is filled in between its neighbours", () => {
    const wayland = w.find((x) => x.text === "Wayland,")!;
    expect(wayland.heard).toBe(false);
    expect(wayland.start).toBeGreaterThanOrEqual(3.4);
    expect(wayland.end).toBeLessThanOrEqual(3.9);
    const roomler = w.find((x) => x.text === "Roomler")!;
    expect(roomler.start).toBeGreaterThanOrEqual(5.8);
    expect(roomler.end).toBeLessThanOrEqual(6.2);
  });
  test("a turn's first word stamped before the turn still gets a length", () => {
    const t2 = [{ speaker: "michael", text: "Enough talk.", start: 12.057, end: 12.707 }];
    const early = wordTimes(t2, [{ word: "Enough", start: 11.9, end: 12.05 }, { word: "talk.", start: 12.3, end: 12.7 }]);
    expect(early[0].end - early[0].start).toBeGreaterThan(0.1);
    expect(early[1].start).toBeGreaterThanOrEqual(early[0].end);
    expect(early[1].end).toBeLessThanOrEqual(12.707);
  });
  test("times never run backwards", () => {
    for (let i = 1; i < w.length; i++) expect(w[i].start).toBeGreaterThanOrEqual(w[i - 1].end);
    for (const x of w) expect(x.end).toBeGreaterThanOrEqual(x.start);
  });
});

describe("pages + karaoke", () => {
  const w = wordTimes(turns, []);
  test("pages break at punctuation and never cross a turn", () => {
    const p = pages(w, 3, 18);
    expect(p.map((x) => x.words.map((y) => y.text).join(" "))).toEqual(["Okay.", "This is a", "Mac mini.", "On Wayland,", "no less!", "Roomler is open", "source."]);
    for (const x of p) expect(new Set(x.words.map((y) => y.turn)).size).toBe(1);
  });
  test("one event per word, the said word in its speaker's colour", () => {
    const ass = karaokeAss(pages(w), ["michael", "emma", "michael"], {
      width: 1080, height: 1920, font: "Segoe UI Black", size: 64, x: 540, y: 1040, text: "#ffffff", box: "#1a1a2e", boxAlpha: 0.85,
      active: { michael: "#4db6ac", emma: "#ffc107" }, hold: 0.4,
    });
    const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(events.length).toBe(w.length);
    expect(events[0]).toContain(`{\\c${assColor("#4db6ac")}}Okay.`);
    expect(ass).toContain(`{\\c${assColor("#ffc107")}}On{\\c${assColor("#ffffff")}} Wayland,`);
    expect(ass).toContain(`,${assColorA("#1a1a2e", 0.85)},${assColorA("#1a1a2e", 0.85)},`);
  });
  test("colours", () => {
    expect(assColor("#4db6ac")).toBe("&HACB64D&");
    expect(assColorA("#1a1a2e", 0.85)).toBe("&H262E1A1A");
  });
});
