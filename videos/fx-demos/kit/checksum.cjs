// hyperframes check --json, in a few lines.
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try {
    const j = JSON.parse(s.slice(s.indexOf("{")));
    // Since 0.8 the findings sit in each section (lint, layout, craft, ...), not at the top: read both.
    const f = [...(j.findings || j.issues || []), ...Object.values(j).flatMap((v) => (v && Array.isArray(v.findings) ? v.findings : []))];
    const sev = (x) => x.severity || x.level;
    console.log("ok", j.ok, "errors", f.filter((x) => sev(x) === "error").length, "warnings", f.filter((x) => sev(x) === "warning").length);
    for (const x of f.filter((x) => sev(x) === "error").slice(0, 10)) console.log("E", x.code || x.rule, x.time ?? "", x.selector || "", String(x.text || x.message || "").slice(0, 150));
    const seen = {};
    for (const x of f.filter((x) => sev(x) === "warning")) seen[x.code || x.rule] = (seen[x.code || x.rule] || 0) + 1;
    console.log("W", JSON.stringify(seen));
  } catch (e) {
    console.log(s.slice(0, 800));
  }
});
