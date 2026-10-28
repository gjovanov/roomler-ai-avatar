#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 G ROX EOOD
#
# Starts ComfyUI (comfy-server.sh) inside a root SYSTEM scope with a hard memory cap, for a machine where the user's
# own systemd manager is missing, so comfy-server.sh cannot cap it by itself (`comfy-server.sh cap` says which).
# ComfyUI runs as the normal user inside the scope. Why (2026-10-27, a WSL VM booted without a user manager):
# uncapped, ComfyUI kept 26 GB of model files mapped on top of its working memory, the VM never needed to evict them,
# the Windows host starved, and the renders' memory guard stopped clip after clip. Inside the cap the kernel evicts
# those clean pages first, and only then OOM-kills ComfyUI alone. tools/podcast/chain.ts runs it when it has to.
#   (as root) comfy-capped.sh <user> [memory cap, 24G] [AVATAR_WORK as Linux sees it]
#   wsl -u root -e bash tools/avatar/comfy-capped.sh "$(wsl -e id -un)" 24G /mnt/c/Users/<you>/roomler-avatar-work
set -euo pipefail
USER_NAME="${1:?usage: comfy-capped.sh <user> [memory cap] [work dir]}"
MEM="${2:-24G}"
[ "$(id -u)" -eq 0 ] || { echo "comfy-capped.sh runs as root (it makes a system scope)" >&2; exit 2; }
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"
[ -n "$HOME_DIR" ] || { echo "no user $USER_NAME" >&2; exit 2; }
SERVER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/comfy-server.sh"
if curl -sf "http://127.0.0.1:${AVATAR_PORT:-8188}/system_stats" >/dev/null; then echo "already up"; exit 0; fi
ENVS=(HOME="$HOME_DIR" USER="$USER_NAME" LOGNAME="$USER_NAME" AVATAR_CAPPED_BY="a root system scope, MemoryMax $MEM")
if [ -n "${3:-}" ]; then ENVS+=(AVATAR_WORK="$3"); fi
systemd-run --scope --quiet --unit "roomler-avatar-comfy-$(date +%s)" -p "MemoryMax=$MEM" -p MemorySwapMax=0 \
  runuser -u "$USER_NAME" -- env "${ENVS[@]}" bash "$SERVER" start
