// The call on slab 3 (round 4, Goran: "my avatar, Helen and 4 other persons as if they are doing a video conference"; he
// then picked all four new faces besides michael and emma): eight people in a 4x2 gallery, one bar of buttons, no names
// (his rule: no labels on his tiles). One geometry, used twice:
//   node call.mjs    the still Blender puts on the slab's screen: every tile a flat colour of that person's room, so the
//                    floor mirrors a call; a real person's face never enters the renderer.
//   build.mjs        the live overlay in HyperFrames, the same frame with the clips, warped onto the screen's tracked corners.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const W = 1920, H = 1080, PAD = 28, GAP = 16, BAR = 104, COLS = 4;
export const TW = (W - 2 * PAD - (COLS - 1) * GAP) / COLS, TH = (H - PAD - BAR - GAP) / 2;
export const tile = (i) => ({ x: PAD + (i % COLS) * (TW + GAP), y: PAD + Math.floor(i / COLS) * (TH + GAP) });
// Reading order: Goran speaks, top left. Each room's colour is picked by eye from the clip, never computed from his pixels.
export const PEOPLE = [
  { id: "goran", room: "#3a302a" },
  { id: "helen", room: "#3b2f2a" },
  { id: "michael", room: "#1f3d3b" },
  { id: "a", room: "#b9b6ae" },
  { id: "emma", room: "#24403d" },
  { id: "b", room: "#a7aaa6" },
  { id: "c", room: "#b2a796" },
  { id: "d", room: "#7a6a58" },
];
const I = {
  mic: `<path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 12a7 7 0 0 0 14 0M12 19v3"/>`,
  cam: `<rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3z"/>`,
  share: `<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6"/>`,
  chat: `<path d="M4 5h16v11H9l-5 4z"/>`,
  leave: `<path d="M3 14c5-4 13-4 18 0l-2 3-4-1v-2c-2-.6-4-.6-6 0v2l-4 1z" fill="#fff" stroke="none"/>`,
};
export const CSS = `.call{position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:#081613;overflow:hidden}
.call .t{position:absolute;width:${TW}px;height:${TH}px;border-radius:16px;overflow:hidden;box-shadow:inset 0 0 0 2px rgba(77,182,172,.22)}
.call .t video{position:absolute;left:0;top:0;width:${TW}px;height:${TH}px;object-fit:cover}
.call .t.on{box-shadow:0 0 0 5px #4db6ac,0 0 30px rgba(77,182,172,.55)}
.call .b{position:absolute;top:${H - BAR + 20}px;width:64px;height:64px;border-radius:50%;background:#1c3a35;display:flex;align-items:center;justify-content:center}
.call .b.x{background:#d64541}.call .b svg{width:30px;height:30px;fill:none;stroke:#e6f5f2;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.call .sheen{position:absolute;inset:0;background:linear-gradient(118deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,0) 38%)}`;
export function frame(inside = () => "") {
  const tiles = PEOPLE.map((p, i) => { const t = tile(i); return `<div class="t${i === 0 ? " on" : ""}" style="left:${t.x}px;top:${t.y}px;background:${p.room}">${inside(p, i)}</div>`; }).join("");
  const x0 = (W - (5 * 64 + 4 * 24)) / 2;
  const btns = ["mic", "cam", "share", "chat", "leave"].map((k, i) => `<div class="b${k === "leave" ? " x" : ""}" style="left:${x0 + i * 88}px"><svg viewBox="0 0 24 24">${I[k]}</svg></div>`).join("");
  return `${tiles}${btns}<div class="sheen"></div>`;
}

// The still for Blender: run on its own.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const out = path.resolve(path.dirname(process.argv[1]), "../../out/01-three-into-one");
  fs.mkdirSync(out, { recursive: true });
  const page = path.join(out, "call-layout.html");
  fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${W}px;height:${H}px;background:#081613}${CSS}</style></head><body><div class="call">${frame()}</div><script>window.setState=()=>{}</script></body></html>`);
  execFileSync("bun", [path.resolve(out, "../../../../tools/avatar/html-frames.ts"), page, path.join(out, "call-layout"), "states", "1"], { stdio: "inherit" });
  const png = fs.readdirSync(path.join(out, "call-layout")).find((f) => f.endsWith(".png"));
  fs.copyFileSync(path.join(out, "call-layout", png), path.join(out, "call-layout.png"));
  console.log("wrote", path.join(out, "call-layout.png"));
}
