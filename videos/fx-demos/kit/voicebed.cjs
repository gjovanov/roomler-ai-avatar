// How far each voice stands above everything else (music + effects), measured, since nobody here can listen.
// node kit/voicebed.cjs <NN-slug> [--save]: rebuilds the HyperFrames mix from out/<id>/hf/index.html as two stems,
// voice and bed, then reads both in the speech band (300-4000 Hz, where words are understood) in 250 ms windows.
// Prints, per voice clip, the worst window and the median: voice minus bed in dB. Below ~8 dB words start to drown.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const id = process.argv[2], save = process.argv.includes("--save");
const dir = path.join(ROOT, "out", id, "hf");
const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
const total = +/data-composition-id="main" data-start="0" data-duration="([\d.]+)"/.exec(html)[1];
const tags = [...html.matchAll(/<audio ([^>]*)><\/audio>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]])));
const SR = 16000;
function stem(list) {
  if (!list.length) return new Float32Array(Math.ceil(total * SR));
  const args = ["-hide_banner", "-loglevel", "error", "-y"], fl = [];
  list.forEach((a, i) => {
    args.push("-i", path.join(dir, a.src));
    const st = +a["data-start"], d = a["data-duration"] ? +a["data-duration"] : 0, ms = +(a["data-media-start"] || 0);
    const v = +(a["data-volume"] || 1), fi = +(a["data-fade-in"] || 0), fo = +(a["data-fade-out"] || 0);
    let f = `[${i}:a]aformat=sample_fmts=fltp:channel_layouts=mono,aresample=${SR},atrim=start=${ms}${d ? `:duration=${d}` : ""},asetpts=PTS-STARTPTS`;
    if (fi > 0) f += `,afade=t=in:d=${fi}`;
    if (fo > 0 && d) f += `,afade=t=out:st=${Math.max(0, d - fo)}:d=${fo}`;
    fl.push(`${f},volume=${v},adelay=${Math.round(st * 1000)}:all=1[s${i}]`);
  });
  fl.push(`${list.map((_, i) => `[s${i}]`).join("")}amix=inputs=${list.length}:normalize=0:duration=longest,apad=whole_dur=${total},atrim=duration=${total},highpass=f=300,lowpass=f=4000[o]`);
  args.push("-filter_complex", fl.join(";"), "-map", "[o]", "-f", "f32le", "-");
  const buf = execFileSync("ffmpeg", args, { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
const voice = tags.filter((a) => /^voice/.test(a.id)), bed = tags.filter((a) => !/^voice/.test(a.id));
const V = stem(voice), B = stem(bed);
const W = SR / 4, db = (x) => 10 * Math.log10(x + 1e-12);
const rms = (x, a) => { let s = 0; for (let i = a; i < a + W && i < x.length; i++) s += x[i] * x[i]; return s / W; };
console.log(`${id}: ${voice.length} voice clips, ${bed.length} bed sounds; speech band, 250 ms windows, voice minus bed`);
for (const a of voice) {
  const st = +a["data-start"], en = st + +a["data-duration"], rows = [];
  for (let t = st; t + 0.25 <= en; t += 0.25) {
    const i = Math.round(t * SR), v = db(rms(V, i)), b = db(rms(B, i));
    if (v > -45) rows.push({ t, d: v - b });
  }
  if (!rows.length) continue;
  const ds = rows.map((r) => r.d).sort((x, y) => x - y), worst = rows.reduce((m, r) => (r.d < m.d ? r : m));
  console.log(`  ${a.id.padEnd(8)} ${st.toFixed(2)}-${en.toFixed(2)} s  worst ${worst.d.toFixed(1)} dB at ${worst.t.toFixed(2)} s  median ${ds[Math.floor(ds.length / 2)].toFixed(1)} dB  under 8 dB: ${rows.filter((r) => r.d < 8).length}/${rows.length} windows`);
}
if (save) for (const [n, x] of [["voice", V], ["bed", B]]) fs.writeFileSync(path.join(ROOT, "out", id, `stem-${n}.f32`), Buffer.from(x.buffer));
// --check: is this rebuild the mix HyperFrames made? Compare its window levels with raw.mp4's (a constant offset is fine).
if (process.argv.includes("--check")) {
  const buf = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path.join(ROOT, "out", id, "raw.mp4"), "-vn", "-af", `aformat=channel_layouts=mono,aresample=${SR},highpass=f=300,lowpass=f=4000`, "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  const R = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4), M = V.map((x, i) => x + B[i]), d = [];
  for (let i = 0; i + W <= Math.min(R.length, M.length); i += W) if (db(rms(M, i)) > -50) d.push(db(rms(R, i)) - db(rms(M, i)));
  const s = [...d].sort((x, y) => x - y), med = s[Math.floor(s.length / 2)];
  console.log(`  check against raw.mp4: offset ${med.toFixed(2)} dB, windows within 1 dB of it: ${d.filter((x) => Math.abs(x - med) < 1).length}/${d.length}`);
}
if (process.env.VB_ROWS) for (const a of voice.filter((x) => x.id === process.env.VB_ROWS)) for (let t = +a["data-start"]; t + 0.25 <= +a["data-start"] + +a["data-duration"]; t += 0.25) { const i = Math.round(t * SR); console.log(`    ${t.toFixed(2)}  voice ${db(rms(V, i)).toFixed(1)}  bed ${db(rms(B, i)).toFixed(1)}`); }
