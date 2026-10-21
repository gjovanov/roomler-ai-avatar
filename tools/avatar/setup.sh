#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 G ROX EOOD
#
# The GPU side's one-time setup, on Linux or in WSL: ComfyUI and the three custom node packs the
# workflows use, in a venv; then the model weights.
#
#   setup.sh base                  ComfyUI + nodes + venv, pinned to versions.lock
#   setup.sh models <set>...       download weights: wan infinitetalk portrait edit | all
#   setup.sh localize <set>...     copy a set's big files into ComfyUI/models (when AVATAR_MODELS is slow)
#   setup.sh doctor                check the install: GPU, torch, the node packs, every model file
#   setup.sh lock                  write the checked-out commits to versions.lock
#
# AVATAR_HOME          code + venv              (default ~/roomler-avatar)
# AVATAR_MODELS        model weights, ~70 GB    (default $AVATAR_HOME/models)
# AVATAR_TORCH_INDEX   the PyTorch wheel index  (default cu130: RTX 50xx needs CUDA >= 12.8)
#
# Keep AVATAR_MODELS on the Linux filesystem. Under WSL, /mnt/c is read through the 9p bridge at
# 25-40 MB/s, and the talking-clip workflow re-reads its 16.6 GB model on every clip: 12-20 minutes a
# clip from /mnt/c, 7 seconds from ext4. If the weights must live on /mnt/c, `localize` the sets you
# render with (infinitetalk, edit).
#
# Licences: ComfyUI GPL-3.0, ComfyUI-WanVideoWrapper Apache-2.0, ComfyUI-KJNodes GPL-3.0,
# ComfyUI-VideoHelperSuite GPL-3.0. They run as a separate program; nothing here links them.
set -euo pipefail
# Settings can live in one file on the Linux side (KEY=value lines); under WSL that is where Windows-
# launched tools find them, since Windows environment variables do not reach WSL.
CONF="${XDG_CONFIG_HOME:-$HOME/.config}/roomler-avatar/env"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
HERE="$(cd "$(dirname "$0")" && pwd)"
AV="${AVATAR_HOME:-$HOME/roomler-avatar}"
MODELS="${AVATAR_MODELS:-$AV/models}"
TORCH_INDEX="${AVATAR_TORCH_INDEX:-https://download.pytorch.org/whl/cu130}"
LOCK="$HERE/versions.lock"
PY="$AV/venv/bin/python"

# name|url  (versions.lock pins each to a commit)
REPOS=(
  "ComfyUI|https://github.com/comfyanonymous/ComfyUI"
  "ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper|https://github.com/kijai/ComfyUI-WanVideoWrapper"
  "ComfyUI/custom_nodes/ComfyUI-KJNodes|https://github.com/kijai/ComfyUI-KJNodes"
  "ComfyUI/custom_nodes/ComfyUI-VideoHelperSuite|https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite"
)

pinned() { [ -f "$LOCK" ] && awk -v n="$1" '$1 == n { print $2 }' "$LOCK"; }

base() {
  command -v git >/dev/null || { echo "git is required" >&2; exit 2; }
  command -v python3 >/dev/null || { echo "python3 (3.10+, with venv) is required" >&2; exit 2; }
  mkdir -p "$AV" "$MODELS"
  for r in "${REPOS[@]}"; do
    local dir="${r%%|*}" url="${r#*|}"
    [ -d "$AV/$dir/.git" ] || git clone --quiet --filter=blob:none "$url" "$AV/$dir"
    local c; c="$(pinned "$dir" || true)"
    if [ -n "$c" ]; then git -C "$AV/$dir" fetch --quiet origin && git -C "$AV/$dir" checkout --quiet "$c"; fi
    echo "$dir @ $(git -C "$AV/$dir" rev-parse --short HEAD)"
  done
  [ -x "$PY" ] || python3 -m venv "$AV/venv"
  "$PY" -m pip install --quiet --upgrade pip wheel
  "$PY" -m pip install --quiet torch torchvision torchaudio --index-url "$TORCH_INDEX"
  "$PY" -m pip install --quiet -r "$AV/ComfyUI/requirements.txt"
  for n in ComfyUI-WanVideoWrapper ComfyUI-KJNodes ComfyUI-VideoHelperSuite; do
    local req="$AV/ComfyUI/custom_nodes/$n/requirements.txt"
    [ -f "$req" ] && "$PY" -m pip install --quiet -r "$req"
  done
  "$PY" -m pip install --quiet "huggingface_hub[cli]" soundfile
  # ⚠️ Pinned: the wrapper's wav2vec2 subclass (multitalk/wav2vec2.py) overrides forward() and asks
  # the encoder for hidden states. Under transformers 5.x the encoder no longer returns them unless the
  # top-level forward records them, so InfiniteTalk dies with "'NoneType' object is not subscriptable".
  # transformers 4.57.6 needs huggingface-hub < 1.0, which diffusers 0.41 refuses; diffusers 0.35.2
  # takes it. `pip check` is clean with this trio.
  "$PY" -m pip install --quiet "transformers==4.57.6" "diffusers==0.35.2"
  cat > "$AV/ComfyUI/extra_model_paths.yaml" <<EOF
roomler_avatar:
  base_path: $MODELS
  checkpoints: checkpoints
  diffusion_models: diffusion_models
  text_encoders: text_encoders
  clip_vision: clip_vision
  vae: vae
  loras: loras
  wav2vec2: wav2vec2
EOF
  "$PY" -c "import torch; print('torch', torch.__version__, 'cuda', torch.version.cuda, torch.cuda.get_device_name(0), torch.cuda.get_device_capability(0))"
}

lock() {
  : > "$LOCK.tmp"
  for r in "${REPOS[@]}"; do
    local dir="${r%%|*}"
    echo "$dir $(git -C "$AV/$dir" rev-parse HEAD)" >> "$LOCK.tmp"
  done
  "$PY" -c "import torch; print('torch', torch.__version__)" >> "$LOCK.tmp"
  mv "$LOCK.tmp" "$LOCK"; cat "$LOCK"
}

# MODEL SETS: <subdir>|<hf repo>|<file in repo>[|<saved name>]. Every file is pinned by repo + path.
# Kijai's repackagings are the upstream releases cast to fp8/bf16 for ComfyUI.
declare -A SETS
# Shared by the Wan 2.1 audio-driven models: the VAE, the umT5 text encoder, CLIP vision and the
# wav2vec2 speech encoder. About 13 GB.
SETS[wan]="vae|Kijai/WanVideo_comfy|Wan2_1_VAE_bf16.safetensors
text_encoders|Kijai/WanVideo_comfy|umt5-xxl-enc-bf16.safetensors
clip_vision|Comfy-Org/Wan_2.1_ComfyUI_repackaged|split_files/clip_vision/clip_vision_h.safetensors
wav2vec2|Kijai/wav2vec2_safetensors|wav2vec2-chinese-base_fp16.safetensors"
# InfiniteTalk (MeiGen-AI, Apache-2.0) on Wan2.1-I2V-14B-480P (Apache-2.0), with the lightx2v
# step-distill LoRA (Apache-2.0) for 4-8 steps. About 20 GB.
SETS[infinitetalk]="diffusion_models|Kijai/WanVideo_comfy_fp8_scaled|I2V/Wan2_1-I2V-14B-480p_fp8_e4m3fn_scaled_KJ.safetensors
diffusion_models|Kijai/WanVideo_comfy_fp8_scaled|InfiniteTalk/Wan2_1-InfiniteTalk-Single_fp8_e4m3fn_scaled_KJ.safetensors
loras|Kijai/WanVideo_comfy|Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors"
# Z-Image-Turbo (Alibaba Tongyi-MAI, Apache-2.0, 6B, 8-9 steps) for invented presenters' portraits,
# with its Qwen3-4B text encoder and the FLUX.1 [schnell] autoencoder (Apache-2.0). About 20 GB.
SETS[portrait]="diffusion_models|Comfy-Org/z_image_turbo|split_files/diffusion_models/z_image_turbo_bf16.safetensors
text_encoders|Comfy-Org/z_image_turbo|split_files/text_encoders/qwen_3_4b.safetensors
vae|Comfy-Org/z_image_turbo|split_files/vae/ae.safetensors"
# Qwen-Image-Edit-2511 (Alibaba Qwen, Apache-2.0) merged with lightx2v's 4-step Lightning LoRA
# (Apache-2.0), its Qwen2.5-VL-7B text encoder and VAE: turns a person's own photo into a presenter
# portrait. About 30 GB. Optional: only for a real person's face.
SETS[edit]="diffusion_models|lightx2v/Qwen-Image-Edit-2511-Lightning|qwen_image_edit_2511_fp8_e4m3fn_scaled_lightning_comfyui_4steps_v1.0.safetensors
text_encoders|Comfy-Org/Qwen-Image_ComfyUI|split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors
vae|Comfy-Org/Qwen-Image_ComfyUI|split_files/vae/qwen_image_vae.safetensors"

fetch() {
  local line sub repo file name
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    IFS='|' read -r sub repo file name <<< "$line"
    name="${name:-$(basename "$file")}"
    mkdir -p "$MODELS/$sub"
    if [ -s "$MODELS/$sub/$name" ]; then echo "have $sub/$name"; continue; fi
    echo "get  $repo/$file -> $MODELS/$sub/$name"
    "$AV/venv/bin/hf" download "$repo" "$file" --local-dir "$MODELS/.hf-dl/$repo" --quiet >/dev/null
    mv "$MODELS/.hf-dl/$repo/$file" "$MODELS/$sub/$name"
  done <<< "$1"
}
models() {
  [ $# -gt 0 ] || { echo "usage: setup.sh models <set>... (sets: ${!SETS[*]} all)" >&2; exit 2; }
  [ -x "$AV/venv/bin/hf" ] || { echo "run setup.sh base first" >&2; exit 2; }
  local s
  for s in "$@"; do
    if [ "$s" = all ]; then for k in "${!SETS[@]}"; do fetch "${SETS[$k]}"; done; continue; fi
    [ -n "${SETS[$s]:-}" ] || { echo "no model set '$s' (sets: ${!SETS[*]})" >&2; exit 2; }
    fetch "${SETS[$s]}"
  done
  du -sh "$MODELS"/* 2>/dev/null | grep -v '\.hf-dl' || true
}

# ComfyUI searches its own models/ before extra_model_paths, so a local copy wins.
localize() {
  [ $# -gt 0 ] || { echo "usage: setup.sh localize <set>..." >&2; exit 2; }
  local s line sub repo file name
  for s in "$@"; do
    [ -n "${SETS[$s]:-}" ] || { echo "no model set '$s'" >&2; exit 2; }
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      IFS='|' read -r sub repo file name <<< "$line"
      name="${name:-$(basename "$file")}"
      case "$sub" in diffusion_models|loras|text_encoders) ;; *) continue ;; esac
      mkdir -p "$AV/ComfyUI/models/$sub"
      if [ -s "$AV/ComfyUI/models/$sub/$name" ]; then echo "local $sub/$name"; continue; fi
      echo "copy  $sub/$name"
      cp "$MODELS/$sub/$name" "$AV/ComfyUI/models/$sub/$name.part" && mv "$AV/ComfyUI/models/$sub/$name.part" "$AV/ComfyUI/models/$sub/$name"
    done <<< "${SETS[$s]}"
  done
  df -h "$AV" | tail -1
}

doctor() {
  local bad=0
  ok() { echo "ok    $*"; }
  no() { echo "MISS  $*"; bad=1; }
  command -v nvidia-smi >/dev/null && ok "$(nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader)" || no "nvidia-smi (an NVIDIA GPU and driver)"
  [ -x "$PY" ] && ok "venv $AV/venv" || no "venv: run setup.sh base"
  [ -x "$PY" ] && "$PY" -c "import torch, transformers; assert torch.cuda.is_available(); print('ok    torch', torch.__version__, 'cuda', torch.version.cuda, '| transformers', transformers.__version__)" 2>/dev/null || no "torch with CUDA in the venv"
  for r in "${REPOS[@]}"; do local dir="${r%%|*}"; [ -d "$AV/$dir/.git" ] && ok "$dir @ $(git -C "$AV/$dir" rev-parse --short HEAD)" || no "$dir: run setup.sh base"; done
  local s line sub repo file name slow=0
  case "$(findmnt -n -o FSTYPE --target "$MODELS" 2>/dev/null)" in 9p|v9fs|drvfs) slow=1 ;; esac
  for s in wan infinitetalk portrait edit; do
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      IFS='|' read -r sub repo file name <<< "$line"
      name="${name:-$(basename "$file")}"
      if [ -s "$AV/ComfyUI/models/$sub/$name" ]; then ok "[$s] $sub/$name (ComfyUI/models)"
      elif [ -s "$MODELS/$sub/$name" ]; then
        ok "[$s] $sub/$name"
        # The talking-clip model is re-read on every clip: from a Windows drive that is minutes a clip.
        if [ $slow -eq 1 ] && [ "$s" = infinitetalk ]; then echo "WARN  $sub/$name is on a Windows drive (9p): run setup.sh localize infinitetalk"; fi
      else echo "----  [$s] $sub/$name not downloaded$([ "$s" = edit ] && echo ' (optional: real-person portraits)')"; [ "$s" = edit ] || bad=1; fi
    done <<< "${SETS[$s]}"
  done
  echo "RAM   $(free -g | awk '/Mem:/ {print $2 " GB in this VM, " $7 " GB available"}')"
  [ $bad -eq 0 ] && echo "ready" || { echo "not ready"; exit 1; }
}

case "${1:-}" in
  base) base ;;
  lock) lock ;;
  models) shift; models "$@" ;;
  localize) shift; localize "$@" ;;
  doctor) doctor ;;
  *) echo "usage: setup.sh base | models <set>... | localize <set>... | doctor | lock" >&2; exit 2 ;;
esac
