# The LLM and the models

## The LLM: Claude, for the plan

Claude is the only call to a hosted model, and it is used for one step: planning the edit
(`tools/avatar/storyboard.ts`). It never writes a word that is spoken.

| | |
|---|---|
| What it decides | a layout for every turn, the on-screen cards (each citing a claim of the brief), three alternative opening lines for an A/B test, a cover text and face |
| How it is called | headless Claude Code: `claude -p` with `--json-schema`, no tools, no MCP servers, no saved session (`tools/llm/claude.ts`) |
| Model | `opus` by default (the current Claude Opus; `claude-opus-5-5` when this was written), `--model sonnet` or any model id for a cheaper run; a comma-separated list falls back when a model is out of usage |
| Authentication | whatever Claude Code is logged in with: a Claude plan, or an API key (`ANTHROPIC_API_KEY`) |
| Time | 35 s for the four-turn example, 70-90 s for a 23-turn video |
| What it sees | the brief's claims, the narration's turns with their times, and your description of the recording's shots |
| Checked after | every rule of the plan in code; a plan that breaks one goes back once with the problems, and is refused if the answer still breaks one, never patched (docs/how-it-works.md) |

The [Claude Code skill](../.claude/skills/avatar-video/SKILL.md) in this repository lets Claude Code drive
the whole process interactively, including drafting the script with you, and the
[demo-first-scriptwriter skill](../.claude/skills/demo-first-scriptwriter/SKILL.md) writes a one-presenter
product demo that leads with what the recording proves. That is Claude working with you in a session; no
tool here calls an LLM to write a script.

Language models also sit inside some of the open models below, as text encoders or backbones: Qwen2.5-1.5B
inside VibeVoice, Qwen3-4B in front of Z-Image-Turbo, Qwen2.5-VL-7B in front of Qwen-Image-Edit, and umT5-XXL
in front of Wan2.1. They run locally with the model they belong to.

## The open models, all local

| Model | Role | Licence | Size on disk | Source |
|---|---|---|---|---|
| **InfiniteTalk** (MeiGen-AI), single speaker | the talking clips: portrait + speech → video | Apache-2.0 | 2.7 GB (fp8) | [MeiGen-AI/InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk), repacked by Kijai |
| **Wan2.1-I2V-14B-480P** (Alibaba) | InfiniteTalk's base video model | Apache-2.0 | 16.6 GB (fp8 scaled) | [Wan-AI](https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-480P), `Kijai/WanVideo_comfy_fp8_scaled` |
| **lightx2v I2V 480p step-distill LoRA**, rank 64 | 6 sampling steps instead of 40 | Apache-2.0 | 0.7 GB | `Kijai/WanVideo_comfy` |
| umT5-XXL encoder | Wan's text encoder (the talk prompt) | Apache-2.0 | 11 GB | `Kijai/WanVideo_comfy` |
| CLIP ViT-H vision | the portrait's image embedding | MIT (OpenCLIP) | 1.3 GB | `Comfy-Org/Wan_2.1_ComfyUI_repackaged` |
| chinese-wav2vec2-base (TencentGameMate) | speech features for lip sync | MIT | 0.2 GB | `Kijai/wav2vec2_safetensors` |
| Wan2.1 VAE | video latents | Apache-2.0 | 0.25 GB | `Kijai/WanVideo_comfy` |
| **Z-Image-Turbo** (Alibaba Tongyi-MAI), 6B | invented presenters' portraits, 9 steps | Apache-2.0 | 12.3 GB + Qwen3-4B encoder 8 GB | `Comfy-Org/z_image_turbo` |
| **Qwen-Image-Edit-2511** (Alibaba Qwen) + lightx2v Lightning, 4 steps | a portrait from a real person's own photo | Apache-2.0 | 20.5 GB + Qwen2.5-VL-7B encoder 9.4 GB | `lightx2v/Qwen-Image-Edit-2511-Lightning`, `Comfy-Org/Qwen-Image_ComfyUI` |
| **VibeVoice-1.5B** (Microsoft Research) | the voices, one line at a time | MIT, with a research-use statement | 5.4 GB | via [starling's podcast-server](https://github.com/gjovanov/starling/tree/master/apps/podcast-server) |
| Kokoro-82M | made the michael and emma voice prompts | Apache-2.0 | | shipped with the podcast-server |
| **Whisper** base.en / medium.en (OpenAI) | checks each line, times the words | MIT | 0.3 / 1.5 GB | Hugging Face transformers |

Every file is pinned by repository and path in `tools/avatar/setup.sh`, and the code that runs them in
`tools/avatar/versions.lock`.

## The programs

| Program | Role | Licence |
|---|---|---|
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | runs the image and video models, headless on loopback | GPL-3.0 |
| [ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper) | InfiniteTalk and the Wan loaders | Apache-2.0 |
| [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) | image resize | GPL-3.0 |
| [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) | writes the clips | GPL-3.0 |
| ffmpeg | every cut, overlay, caption and encode | LGPL/GPL, per build |
| tesseract | the optional privacy OCR in `check.ts` | Apache-2.0 |

ComfyUI and its node packs run as a separate program that the tools talk to over HTTP. Nothing here
links or ships them.

## Why these

The choice came from an evaluation of open audio-driven avatar models in October 2026, for a company in
the EU making promotional videos on one 24 GB laptop GPU:

- **InfiniteTalk** for the clips: the best lip sync and natural head movement of what runs on 24 GB, any
  length through its windows, and Apache-2.0. Its native two-person mode was weaker than one speaker per
  clip cut like a video call, which is what the tools do.
- **Z-Image-Turbo** for invented faces: photographic, 9 steps, Apache-2.0.
- **Qwen-Image-Edit-2511** for a real person's portrait: it keeps the identity of a reference photo while
  changing the framing or the room around it.
- **VibeVoice-1.5B** for the voices: a natural two-voice conversation from voice prompts, MIT.
- Left out: the Hunyuan video family and MiniMax's models (their licences exclude the EU), and the
  FusionX LoRA merges (non-commercial parts).

## VibeVoice's terms, in short

The weights are MIT. Microsoft's model card says the model is "limited to research purpose use" and
recommends against commercial use "without further testing and development", asks that AI use be
disclosed, and rules out voice impersonation without explicit, recorded consent. The MIT licence permits
commercial use; the card's statement is Microsoft's intent. Whether to publish its audio commercially is
the publisher's decision. The podcast-server's README has the details, including what it found about
watermarks.
