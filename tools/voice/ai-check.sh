#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 G ROX EOOD
#
# Optional: run the avoid-ai-writing detector (a Claude Code plugin, installed under
# ~/.claude/plugins) on a script's words and print the label, the score and every issue. lines.ts
# runs it before spending GPU minutes on a render; exit 2 means the detector is not installed.
#
#   tools/voice/ai-check.sh <text file> [technical|general|personal|marketing]
#
# "Clean" means none of the catalogued AI-writing patterns were found. It is not a certificate that
# the text reads as human: read it aloud yourself.
set -u
FILE="${1:?usage: ai-check.sh <text file> [context]}"
CTX="${2:-technical}"
BINS=( "$HOME"/.claude/plugins/marketplaces/*/bin/avoid-ai-writing.js )
BIN="${BINS[0]}"
[ -f "$BIN" ] || { echo "avoid-ai-writing detector not found under ~/.claude/plugins" >&2; exit 2; }
command -v node >/dev/null || { echo "node is required for the detector" >&2; exit 2; }

JSON="$(node "$BIN" --context "$CTX" --source-mode rendered-markdown -- "$FILE")"
RC=$?
[ $RC -eq 0 ] || { echo "detector failed (rc=$RC)" >&2; exit $RC; }

node -e '
const r = JSON.parse(process.argv[1]);
const p = r.class_probabilities || {};
const s = r.stats || {};
console.log(`label: ${r.label} | score: ${r.score} | class: ${r.document_classification}` +
            ` (human ${p.human} / mixed ${p.mixed} / ai ${p.ai}, ${r.confidence_category})` +
            ` | words: ${s.wordCount}`);
for (const i of r.issues || []) {
  const where = i.line ? ` L${i.line}` : "";
  const text = String(i.match ?? i.text ?? i.excerpt ?? "").replace(/\s+/g, " ").slice(0, 110);
  console.log(`  [${i.severity ?? i.tier ?? ""}] ${i.category ?? i.rule ?? i.type ?? "?"}${where}: ${text}`);
}
' "$JSON"
