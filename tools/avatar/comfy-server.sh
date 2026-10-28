#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 G ROX EOOD
#
# The ComfyUI server the avatar tools drive (tools/avatar/comfy.ts): headless, on loopback only
# (ComfyUI has no authentication). Under WSL, mirrored or localhost forwarding makes 127.0.0.1:8188
# reachable from Windows, where the bun tools run.
#
#   comfy-server.sh start | stop | status | log [n] | cap     (cap: what start would do about the memory cap)
#
# AVATAR_HOME      the setup.sh install       (default ~/roomler-avatar)
# AVATAR_WORK      ComfyUI's input/output     (default: under WSL, %USERPROFILE%\roomler-avatar-work
#                  seen as /mnt/c/...; on Linux ~/roomler-avatar-work). The tools must see the same folder.
# AVATAR_PORT      default 8188
# AVATAR_MEM_MAX   the server's memory cap    (default 26G)
set -euo pipefail
CONF="${XDG_CONFIG_HOME:-$HOME/.config}/roomler-avatar/env"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
AV="${AVATAR_HOME:-$HOME/roomler-avatar}"
PORT="${AVATAR_PORT:-8188}"
PIDF="$AV/comfy.pid"
LOG="$AV/comfy.log"

default_work() {
  # Under WSL the tools run on Windows and default to %USERPROFILE%\roomler-avatar-work.
  if grep -qi microsoft /proc/version 2>/dev/null && command -v cmd.exe >/dev/null 2>&1; then
    local up; up="$(cd /mnt/c 2>/dev/null && cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')"
    if [ -n "$up" ] && [ "$up" != "%USERPROFILE%" ]; then echo "$(wslpath -u "$up")/roomler-avatar-work"; return; fi
  fi
  echo "$HOME/roomler-avatar-work"
}
WORK="${AVATAR_WORK:-$(default_work)}"

running() { [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; }

# ⚠️ A hard memory cap, so an overreach kills ComfyUI and nothing else. Uncapped, the 11 GB text
# encoder loading beside the 14B model and a parallel build ran a WSL VM out of memory with its swap
# already full, and WSL stopped answering until the distro was terminated. Inside this scope the
# kernel reclaims ComfyUI's own page cache first and then OOM-kills ComfyUI alone; MemorySwapMax=0
# keeps it from thrashing swap.
# The user manager counts as there when it is `degraded` too: one failed unit is enough for that, and a
# ComfyUI scope this very cap once killed is such a unit (2026-10-28: `is-system-running` failed on it,
# and ComfyUI would have started uncapped). AVATAR_CAPPED_BY: the caller already put this process in a
# scope of its own (tools/avatar/comfy-capped.sh, a root system scope), so no second cap is needed.
cap_plan() {
  CAP=(); CAP_NOTE=""
  if [ -n "${AVATAR_CAPPED_BY:-}" ]; then CAP_NOTE="capped by the calling scope ($AVATAR_CAPPED_BY)"; return; fi
  local state=""
  if command -v systemd-run >/dev/null; then state="$(systemctl --user is-system-running 2>/dev/null || true)"; fi
  case "$state" in
    running|degraded|starting)
      CAP=(systemd-run --user --scope --quiet --unit "roomler-avatar-comfy-$$" -p "MemoryMax=${AVATAR_MEM_MAX:-26G}" -p MemorySwapMax=0)
      CAP_NOTE="capped at ${AVATAR_MEM_MAX:-26G} in a systemd user scope (user manager: $state)" ;;
    *) CAP_NOTE="WITHOUT a memory cap: no systemd user manager (${state:-none}); start it inside tools/avatar/comfy-capped.sh as root" ;;
  esac
}

case "${1:-}" in
  cap) cap_plan; echo "$CAP_NOTE" ;;
  start)
    if running; then echo "running (pid $(cat "$PIDF")) on 127.0.0.1:$PORT, work $WORK"; exit 0; fi
    [ -d "$AV/ComfyUI" ] || { echo "no ComfyUI at $AV: run setup.sh base" >&2; exit 2; }
    mkdir -p "$WORK/input" "$WORK/output" "$WORK/temp"
    cd "$AV/ComfyUI"
    # A failed scope of ours from an earlier run is what leaves the user manager degraded: clear it.
    systemctl --user reset-failed 'roomler-avatar-comfy-*' >/dev/null 2>&1 || true
    cap_plan
    [ ${#CAP[@]} -gt 0 ] || [ -n "${AVATAR_CAPPED_BY:-}" ] || echo "ComfyUI runs $CAP_NOTE" >&2
    # --cache-classic: ComfyUI 0.42's default "RAM pressure" cache evicts node outputs whenever free
    # RAM falls under 10%, and WSL's free RAM is near zero most of the time (page cache): it evicted
    # the loaded model after every clip. Classic caching keeps an output until its inputs change.
    nohup "${CAP[@]}" "$AV/venv/bin/python" main.py --listen 127.0.0.1 --port "$PORT" \
      --input-directory "$WORK/input" --output-directory "$WORK/output" --temp-directory "$WORK/temp" \
      --disable-auto-launch --preview-method none --cache-classic ${AVATAR_COMFY_ARGS:-} > "$LOG" 2>&1 &
    echo $! > "$PIDF"
    for _ in $(seq 1 180); do
      if curl -sf "http://127.0.0.1:$PORT/system_stats" >/dev/null; then echo "up (pid $(cat "$PIDF")) on 127.0.0.1:$PORT, work $WORK, $CAP_NOTE"; exit 0; fi
      running || { echo "ComfyUI exited during start:" >&2; tail -40 "$LOG" >&2; exit 1; }
      sleep 1
    done
    echo "ComfyUI did not answer in 180 s; see $LOG" >&2; exit 1 ;;
  stop)
    if running; then kill "$(cat "$PIDF")"; sleep 2; running && kill -9 "$(cat "$PIDF")" || true; fi
    rm -f "$PIDF"; echo stopped ;;
  status) if running; then echo "running (pid $(cat "$PIDF")), work $WORK"; else echo "not running"; exit 1; fi ;;
  log) tail -"${2:-60}" "$LOG" ;;
  *) echo "usage: comfy-server.sh start | stop | status | log [n] | cap" >&2; exit 2 ;;
esac
