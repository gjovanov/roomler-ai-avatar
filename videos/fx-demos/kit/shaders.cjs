// Pulls the transition shaders out of the HyperFrames registry blocks installed in a project (hyperframes add <block>), so a demo can
// run them between two frames. node shaders.cjs <project dir> <out.json> <block...>
const fs = require("fs");
const path = require("path");
const [dir, out, ...blocks] = process.argv.slice(2);
const res = {};
for (const b of blocks) {
  const s = fs.readFileSync(path.join(dir, "compositions", `${b}.html`), "utf8");
  const grab = (name) => {
    const m = s.match(new RegExp(`var ${name} =\\s*([\\s\\S]*?);\\n`));
    return m ? m[1] : '""';
  };
  const H = grab("H");
  const NQ = grab("NQ");
  const m = s.match(/var progTrans = mkProg\(\s*([\s\S]*?)\n\s*\);/);
  if (!m) {
    console.log("no shader in", b);
    continue;
  }
  const frag = new Function("H", "NQ", `return (${m[1].replace(/,\s*$/, "")});`)(eval(H), eval(NQ));
  res[b] = frag;
  console.log(b, frag.length);
}
fs.writeFileSync(out, JSON.stringify(res, null, 1));
