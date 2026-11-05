// For each seam: take the base cut's last frame before the gap and first frame after it, render the transition between them in
// Blender, encode it. node seams.cjs (after the base cut's raw.mp4 exists)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const OUT = path.resolve(__dirname, "../../out/10-hexflip");
const { seams, TR } = JSON.parse(fs.readFileSync(path.join(OUT, "seams.json")));
const base = path.join(OUT, "base.mp4");
const ff = (...a) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { encoding: "utf8" });
  if (r.status) console.log(r.stderr.slice(-300));
};
seams.forEach((m, i) => {
  const dir = path.join(OUT, `tr${i}`);
  fs.mkdirSync(dir, { recursive: true });
  const a = path.join(OUT, `tr${i}-a.png`), b = path.join(OUT, `tr${i}-b.png`);
  // The frame just before the gap, and the first one after it.
  const fa = Math.round(m.at * 30) - 1, fb = Math.round((m.at + TR) * 30) + 1;
  ff("-i", base, "-vf", `select=eq(n\\,${fa})`, "-fps_mode", "passthrough", "-frames:v", "1", a);
  ff("-i", base, "-vf", `select=eq(n\\,${fb})`, "-fps_mode", "passthrough", "-frames:v", "1", b);
  if (!["hex", "fold", "domino"].includes(m.kind)) {
    console.log(i, m.kind, m.at, "registry shader, frames only");
    return;
  }
  const r = spawnSync(process.env.BLENDER.replace(/^\/([a-z])\//, "$1:/"), ["-b", "-P", path.resolve(__dirname, "scene.py"), "--", "--a", a, "--b", b, "--kind", m.kind, "--out", dir], { encoding: "utf8", maxBuffer: 1 << 28 });
  const done = (r.stdout.match(/RENDER_DONE.*/) || ["render failed " + r.stdout.slice(-300)])[0];
  ff("-framerate", "30", "-start_number", "1", "-i", path.join(dir, "f_%05d.png"), "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-g", "10", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", path.join(OUT, `seam${i}.mp4`));
  console.log(i, m.kind, m.at, done);
});
