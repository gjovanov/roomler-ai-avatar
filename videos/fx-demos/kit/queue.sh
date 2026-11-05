#!/usr/bin/env bash
# One Blender at a time: renders what out/queue.txt lists, as lines are added; one output line per finished entry; ends on
# STOP. An entry is <id>, or <id>:<layer>:<first>-<last> for a second layer (frames in out/<id>/frames_<layer>).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
Q="$ROOT/out/queue.txt"; touch "$Q"
DONE="$ROOT/out/queue.done"; touch "$DONE"
while true; do
  if [ -s "$DONE" ]; then E=$(grep -v -x -F -f "$DONE" "$Q" 2>/dev/null | head -1); else E=$(head -1 "$Q"); fi
  if [ -z "$E" ]; then sleep 5; continue; fi
  [ "$E" = "STOP" ] && { echo "QUEUE_STOP"; exit 0; }
  ID="${E%%:*}"; mkdir -p "$ROOT/out/$ID"
  case "$E" in
    *:*:*) L="${E#*:}"; LAYER="${L%%:*}"; RANGE="${L#*:}"
       bash "$ROOT/kit/run.sh" "$ID" full --out "$ROOT/out/$ID/frames_$LAYER" --layer "$LAYER" --frames "$RANGE" > "$ROOT/out/$ID/full_$LAYER.log" 2>&1
       echo "RENDERED $E: $(tail -1 "$ROOT/out/$ID/full_$LAYER.log" | cut -c1-80)" ;;
    *) bash "$ROOT/kit/run.sh" "$ID" full > "$ROOT/out/$ID/full.log" 2>&1
       echo "RENDERED $ID $(ls "$ROOT/out/$ID/frames" 2>/dev/null | wc -l) frames: $(tail -1 "$ROOT/out/$ID/full.log" | cut -c1-80)" ;;
  esac
  echo "$E" >> "$DONE"
done
