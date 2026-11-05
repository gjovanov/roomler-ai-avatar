import { Demo, C } from "../../kit/hf.mjs";

const d = new Demo("09-inception", { dur: 12 });
d.plate({ dur: 12 });
// Each label lands as its device fills the frame. The first one is already there on frame 1 and comes back before the loop closes.
const label = (t, start, dur, anim = "words") => d.text(t, { start, dur, x: 70, y: 925, w: 1200, size: 66, align: "left", anim, accent: { "119": C.mint, "56": C.mint, fps: C.mint } });
label("MacBook, 119 fps", 0, 2.2, "none");
label("Windows laptop", 3.2, 2.4);
label("Mac mini on Linux, 56 fps", 7.2, 2.4);
d.text("MacBook, 119 fps", { start: 11.2, dur: 0.8, x: 70, y: 925, w: 1200, size: 66, align: "left", anim: "words", keep: true, accent: { "119": C.mint, fps: C.mint } });
// The brand stays on the whole time: a loop has no end card. And the nesting is disclosed as an effect.
d.text("roomler.ai", { start: 0, dur: 12, x: 1400, y: 950, w: 450, size: 52, weight: 700, align: "right", anim: "none", keep: true });
d.chip("Real screen recordings, nested as an effect", { start: 0, dur: 12, x: 40, y: 1008 });
d.music({ start: 0, dur: 12, from: 112, vol: 0.34, fadeIn: 0.12, fadeOut: 0.12 });
for (const t of [0.0, 4.0, 8.0]) d.sfx("whoosh_a", t + 3.4, 0.22);
d.write();
