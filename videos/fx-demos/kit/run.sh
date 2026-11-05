#!/usr/bin/env bash
# One demo's stages:  run.sh <NN-slug> stills <frames> | full | plate [--nobloom] | alpha <dir> <first> | hf | check | render | final
# Paths that belong to this machine come from out/env.sh (ignored by git): BLENDER, HF, FX_MUSIC, AVATAR_GPU_HOLD, DENY.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
source "$ROOT/out/env.sh"
ID="$1"; STAGE="$2"; shift 2
SCENE="$ROOT/demos/$ID/scene.py"; BUILD="$ROOT/demos/$ID/build.mjs"; O="$ROOT/out/$ID"; mkdir -p "$O"
case "$STAGE" in
  stills)
    rm -rf "$O/stills"; "$BLENDER" -b -P "$SCENE" -- --out "$O/stills" --scale 50 --samples "${SAMPLES:-20}" --stills "$1" 2>&1 | grep -E "RENDER_DONE|Traceback|Error|error:|File \"" | head -20 | cut -c1-200
    ls "$O/stills"/*.png >/dev/null 2>&1 || { echo NO_STILLS; exit 1; }
    N=$(ls "$O/stills"/*.png | wc -l); COLS=${COLS:-4}
    (cd "$O/stills" && i=0; for f in f_*.png; do cp "$f" "s_$(printf %04d $i).tmp.png"; i=$((i+1)); done; ffmpeg -hide_banner -loglevel error -y -i "s_%04d.tmp.png" -vf "scale=${TILE:-480}:-2,tile=${COLS}x$(( (N + COLS - 1) / COLS )):padding=4" -frames:v 1 -q:v 3 "$O/stills.jpg" 2>/dev/null; rm -f s_*.tmp.png)
    echo "$O/stills.jpg"
    ;;
  full)
    "$BLENDER" -b -P "$SCENE" -- --out "$O/frames" --samples "${SAMPLES:-48}" "$@" 2>&1 | grep -E --line-buffered "rendered|RENDER_DONE|waiting|Traceback|Error|error:|File \"" | cut -c1-200
    ;;
  plate)
    # Bright things glow (per channel, so colours stay); a soft vignette. Then H.264 with a keyframe a second for seeking.
    BLOOM="format=gbrp,split[a][b];[b]curves=all='0/0 0.72/0 1/1',gblur=sigma=14[g1];[a][g1]blend=all_mode=screen"
    [ "${1:-}" = "--nobloom" ] && BLOOM="null"
    ffmpeg -hide_banner -loglevel error -y -framerate "${FPS:-30}" -start_number "${START:-1}" -i "$O/frames/f_%05d.png" -filter_complex "[0:v]$BLOOM,vignette=angle=PI/7,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" -c:v libx264 -crf 14 -preset slow -g 30 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart "$O/plate.mp4" 2>&1 | tail -3 | cut -c1-200
    ffprobe -v error -show_entries format=duration -of csv=p=0 "$O/plate.mp4"
    ;;
  alpha)
    # A foreground layer with alpha: alpha <frames dir> <first frame> -> <frames dir>.webm
    ffmpeg -hide_banner -loglevel error -y -framerate 30 -start_number "$2" -i "$O/$1/f_%05d.png" -c:v libvpx-vp9 -pix_fmt yuva420p -crf 22 -b:v 0 -g 30 -auto-alt-ref 0 -row-mt 1 "$O/$1.webm" 2>&1 | tail -2 | cut -c1-200
    ls -la "$O/$1.webm" | cut -c20-100
    ;;
  hf)    (cd "$ROOT/demos/$ID" && FX_MUSIC="$FX_MUSIC" node "$BUILD") ;;
  check) (cd "$O/hf" && $HF check --json 2>/dev/null | node "$HERE/checksum.cjs") ;;
  render)
    (cd "$O/hf" && $HF render --quality "${QUALITY:-delivery}" -o "$O/raw.mp4" 2>&1 | grep -E "Render (complete|failed)|error|Error|✗|Fix:" | head -8 | cut -c1-220)
    ;;
  final)
    # Two passes, so a short film lands on the target loudness.
    node "$HERE/loud.cjs" "$O/raw.mp4" "$O/$ID.mp4"
    ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate:format=duration,size -of csv=p=0 "$O/$ID.mp4" | tr '\n' ' '; echo
    (cd "$ROOT/../.." && bun tools/check.ts "$O/$ID.mp4" --deny "$DENY" --json "$O/check.json" 2>&1 | grep -E "PASS|FAIL|hits|error" | head -8 | cut -c1-200)
    ;;
  sheet)
    # A look at the finished picture: every Nth frame.
    ffmpeg -hide_banner -loglevel error -y -i "$O/raw.mp4" -vf "select='not(mod(n,${1:-50}))',scale=${TILE:-430}:-2,tile=${COLS:-4}x${ROWS:-4}:padding=3" -frames:v 1 -q:v 3 "$O/sheet.jpg"; echo "$O/sheet.jpg"
    ;;
  *) echo "unknown stage $STAGE"; exit 2 ;;
esac
