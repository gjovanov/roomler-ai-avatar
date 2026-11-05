// Measure the mix, set it to -14 LUFS by gain, catch the impacts with a limiter at -1.5 dB. The picture is copied, never touched.
// node loud.cjs <in.mp4> <out.mp4>
const { spawnSync } = require("node:child_process");
const [src, dst] = process.argv.slice(2);
const measure = (f) => {
  const m = spawnSync("ffmpeg", ["-hide_banner", "-i", f, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" });
  return JSON.parse(m.stderr.match(/{[^{}]*"input_i"[^{}]*}/)[0]);
};
const j = measure(src);
let gain = -14 - parseFloat(j.input_i);
const run = (g) => {
  const af = `volume=${g.toFixed(2)}dB,alimiter=limit=0.8:attack=1:release=80:level=false,aresample=48000`;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-c:v", "copy", "-af", af, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", dst], { encoding: "utf8" });
  if (r.status) console.log(r.stderr.slice(-300));
};
run(gain);
// The limiter takes some of it back: one correction.
const k = measure(dst);
gain += -14 - parseFloat(k.input_i);
run(gain);
const e = measure(dst);
console.log(`in ${j.input_i} LUFS -> out ${e.input_i} LUFS, ${e.input_tp} dBTP`);
