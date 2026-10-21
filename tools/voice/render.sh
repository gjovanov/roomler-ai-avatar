#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 G ROX EOOD
#
# The voice engine, on the Linux side: starling's podcast-server (VibeVoice-1.5B, MIT) renders the
# lines, and Whisper in the same venv times their words. tools/voice/lines.ts and tools/avatar/words.ts
# call this (through WSL on Windows).
#
#   render.sh render <script.txt> <out.wav> <seed> <cfg> <steps>   one line of `speaker: text`
#   render.sh align  <audio> [align-words.py options]              Whisper word times, JSON on stdout
#   render.sh voices                                                the voice names, one per line
#
# STARLING_PODCAST_DIR  starling's apps/podcast-server with a built .venv
#                       (https://github.com/gjovanov/starling; default ~/starling/apps/podcast-server)
# AVATAR_VOICES_DIR     a voices folder of your own (voices.json + one .wav prompt per voice), for
#                       example a cloned voice kept outside every repository; default: the server's
#                       own voices, michael and emma (Kokoro-82M samples, Apache-2.0)
set -euo pipefail
# Settings can live in ~/.config/roomler-avatar/env (KEY=value lines): under WSL that is where the
# Windows-launched tools find them, since Windows environment variables do not reach WSL.
CONF="${XDG_CONFIG_HOME:-$HOME/.config}/roomler-avatar/env"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
APP="${STARLING_PODCAST_DIR:-$HOME/starling/apps/podcast-server}"
if [ ! -x "$APP/.venv/bin/podcast-tts" ]; then
  echo "no podcast-server with a built .venv at $APP: clone https://github.com/gjovanov/starling," >&2
  echo "run ./init.sh in apps/podcast-server, and point STARLING_PODCAST_DIR at it" >&2
  exit 3
fi
if [ -n "${AVATAR_VOICES_DIR:-}" ]; then export PODCAST_VOICES_DIR="$AVATAR_VOICES_DIR"; fi
VOICES="${PODCAST_VOICES_DIR:-$APP/voices}"
case "${1:-}" in
  render) cd "$APP" && exec .venv/bin/podcast-tts "$2" -o "$3" --seed "$4" --cfg-scale "$5" --diffusion-steps "$6" ;;
  align) exec "$APP/.venv/bin/python" "$(dirname "$0")/align-words.py" "$2" "${@:3}" ;;
  voices) exec "$APP/.venv/bin/python" -c 'import json, sys; print("\n".join(json.load(open(sys.argv[1]))))' "$VOICES/voices.json" ;;
  *) echo "usage: render.sh render <script> <out.wav> <seed> <cfg> <steps> | align <audio> [opts] | voices" >&2; exit 2 ;;
esac
