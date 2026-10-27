// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 G ROX EOOD
//
// The ComfyUI workflows the avatar tools queue, built as API-format JSON. Node and input names are
// those of ComfyUI 0.42 and ComfyUI-WanVideoWrapper at the commits in versions.lock; read them from
// GET /object_info when a node pack moves. Model file names are what setup.sh saves.
import type { Workflow } from "./comfy.ts";

export const NEGATIVE =
  "bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, " +
  "worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn " +
  "faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, many people in the background, walking backwards";

export interface PortraitOptions {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  /** Z-Image-Turbo is distilled for 8-9 steps at cfg 1. */
  steps?: number;
  shift?: number;
  batch?: number;
  prefix: string;
}

/** A presenter's portrait from Z-Image-Turbo (Apache-2.0): the ComfyUI template's graph (Qwen3-4B text
 *  encoder, AuraFlow-style shift, res_multistep at cfg 1). Several seeds per presenter, a person picks. */
export function portrait(o: PortraitOptions): Workflow {
  return {
    unet: { class_type: "UNETLoader", inputs: { unet_name: "z_image_turbo_bf16.safetensors", weight_dtype: "default" } },
    clip: { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_4b.safetensors", type: "lumina2", device: "default" } },
    vae: { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
    shift: { class_type: "ModelSamplingAuraFlow", inputs: { model: ["unet", 0], shift: o.shift ?? 3 } },
    pos: { class_type: "CLIPTextEncode", inputs: { clip: ["clip", 0], text: o.prompt } },
    neg: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["pos", 0] } },
    latent: { class_type: "EmptySD3LatentImage", inputs: { width: o.width, height: o.height, batch_size: o.batch ?? 1 } },
    sample: {
      class_type: "KSampler",
      inputs: { model: ["shift", 0], seed: o.seed, steps: o.steps ?? 9, cfg: 1, sampler_name: "res_multistep", scheduler: "simple", positive: ["pos", 0], negative: ["neg", 0], latent_image: ["latent", 0], denoise: 1 },
    },
    decode: { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["vae", 0] } },
    save: { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: o.prefix } },
  };
}

export interface EditOptions {
  /** Staged name of the person's own photo: the identity reference. */
  image: string;
  /** Staged name of a second reference ("image 2" in the prompt): a scene, a garment, a prop. The output
   *  keeps image 1's framing (or the width/height canvas); image 2 only informs it. */
  image2?: string;
  prompt: string;
  seed: number;
  /** An output canvas of its own size (re-framing); omit to keep the photo's own framing. */
  width?: number;
  height?: number;
  prefix: string;
}

/** Qwen-Image-Edit-2511 (Apache-2.0) with lightx2v's 4-step Lightning merged in: the ComfyUI template's
 *  graph (image_qwen_image_edit_2511) at 4 steps and cfg 1. The photo goes in as a reference image; with
 *  width/height the output is a fresh canvas, so a selfie can become a centred presenter portrait. */
export function qwenEdit(o: EditOptions): Workflow {
  const ref = (prompt: string) => ({ class_type: "TextEncodeQwenImageEditPlus", inputs: { clip: ["clip", 0], prompt, vae: ["vae", 0], image1: ["scaled", 0], ...(o.image2 ? { image2: ["scaled2", 0] } : {}) } });
  return {
    unet: { class_type: "UNETLoader", inputs: { unet_name: "qwen_image_edit_2511_fp8_e4m3fn_scaled_lightning_comfyui_4steps_v1.0.safetensors", weight_dtype: "default" } },
    clip: { class_type: "CLIPLoader", inputs: { clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors", type: "qwen_image", device: "default" } },
    vae: { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
    img: { class_type: "LoadImage", inputs: { image: o.image } },
    scaled: { class_type: "FluxKontextImageScale", inputs: { image: ["img", 0] } },
    ...(o.image2 ? {
      img2: { class_type: "LoadImage", inputs: { image: o.image2 } },
      scaled2: { class_type: "FluxKontextImageScale", inputs: { image: ["img2", 0] } },
    } : {}),
    shift: { class_type: "ModelSamplingAuraFlow", inputs: { model: ["unet", 0], shift: 3.1 } },
    norm: { class_type: "CFGNorm", inputs: { model: ["shift", 0], strength: 1 } },
    pos0: ref(o.prompt),
    neg0: ref(""),
    pos: { class_type: "FluxKontextMultiReferenceLatentMethod", inputs: { conditioning: ["pos0", 0], reference_latents_method: "index_timestep_zero" } },
    neg: { class_type: "FluxKontextMultiReferenceLatentMethod", inputs: { conditioning: ["neg0", 0], reference_latents_method: "index_timestep_zero" } },
    latent: o.width
      ? { class_type: "EmptySD3LatentImage", inputs: { width: o.width, height: o.height ?? o.width, batch_size: 1 } }
      : { class_type: "VAEEncode", inputs: { pixels: ["scaled", 0], vae: ["vae", 0] } },
    sample: {
      class_type: "KSampler",
      inputs: { model: ["norm", 0], seed: o.seed, steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", positive: ["pos", 0], negative: ["neg", 0], latent_image: ["latent", 0], denoise: 1 },
    },
    decode: { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["vae", 0] } },
    save: { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: o.prefix } },
  };
}

export interface TalkOptions {
  /** Staged file names (comfy.stage). */
  image: string;
  /** The clip's first frame, when it is not the portrait: the last frame of the same presenter's clip before it,
   *  so a chain of clips keeps its pose at every cut. The portrait (`image`) still gives the CLIP identity embeds. */
  startImage?: string;
  /** A staged multi-frame image (APNG) of the previous clip's last frames up to its cut (4k+1 of them): the clip
   *  CONTINUES their motion, while the portrait (`image`) stays the reference of every window. Needs the local
   *  wrapper patch (`motion_frames` on WanVideoImageToVideoMultiTalk, 2026-10-27). The audio must lead in by as many
   *  frames, and the wrapper drops them from the output. Unlike `startImage`, it does not make a generated frame the
   *  next clip's reference, so a chain of clips does not drift. */
  motionFrames?: string;
  audio: string;
  width: number;
  height: number;
  /** Upper bound on generated frames at 25 fps; the audio's own length ends the run sooner. */
  maxFrames: number;
  seed: number;
  /** lightx2v-distilled sampling: 4-8 steps at cfg 1. */
  steps: number;
  shift: number;
  prompt: string;
  negative?: string;
  prefix: string;
  /** Transformer blocks kept in system RAM and streamed to the GPU (0-40); more = less VRAM, slower. */
  blocksToSwap: number;
  attention: "sdpa" | "sageattn";
  loraStrength?: number;
  /** InfiniteTalk's audio guidance; 1 = off (one pass per step). */
  audioCfg?: number;
  /** How strongly the speech features drive the clip (1 = as trained). 0.85 against 1 was hard to tell
   *  apart in a test (2026-10-21): for a calmer face, the talk prompt does more. */
  audioScale?: number;
  /** Keep the transformer on the GPU after sampling (the next segment starts at once). Offloading it
   *  sends it back to a CPU copy that is memory-mapped from the weights file, and with the weights on the
   *  Windows disk every reload re-reads 16 GB through WSL's 9p bridge (measured 7.5 min, 2026-10-20). */
  keepLoaded?: boolean;
}

/** Only the umT5 text encode, written to the wrapper's disk cache. talk.ts runs it for every presenter
 *  prompt BEFORE the 14B model loads: the encoder is 11 GB, and loading it beside the model is what ran
 *  the WSL VM out of memory on 2026-10-20. With the prompt cached, the talk workflow never loads it. */
export function encodePrompt(prompt: string, negative = NEGATIVE): Workflow {
  return {
    text: {
      class_type: "WanVideoTextEncodeCached",
      inputs: { model_name: "umt5-xxl-enc-bf16.safetensors", precision: "bf16", positive_prompt: prompt, negative_prompt: negative, quantization: "disabled", use_disk_cache: true, device: "gpu" },
    },
    show: { class_type: "PreviewAny", inputs: { source: ["text", 2] } },
  };
}

/** InfiniteTalk (single speaker) on Wan2.1-I2V-14B-480P: a portrait + speech -> a talking video at
 *  25 fps, generated in 81-frame windows that hand 9 frames of motion to the next, so any length works.
 *  The graph is wanvideo_2_1_14B_I2V_InfiniteTalk_example_03 without the vocal separator (our audio is
 *  clean speech) and without torch.compile. */
export function infiniteTalk(o: TalkOptions): Workflow {
  return {
    vae: { class_type: "WanVideoVAELoader", inputs: { model_name: "Wan2_1_VAE_bf16.safetensors", precision: "bf16" } },
    clipv: { class_type: "CLIPVisionLoader", inputs: { clip_name: "clip_vision_h.safetensors" } },
    img: { class_type: "LoadImage", inputs: { image: o.image } },
    fit: {
      class_type: "ImageResizeKJv2",
      inputs: { image: ["img", 0], width: o.width, height: o.height, upscale_method: "lanczos", keep_proportion: "crop", pad_color: "0, 0, 0", crop_position: "center", divisible_by: 16, device: "cpu" },
    },
    clipenc: {
      class_type: "WanVideoClipVisionEncode",
      inputs: { clip_vision: ["clipv", 0], image_1: ["fit", 0], strength_1: 1, strength_2: 1, crop: "center", combine_embeds: "average", force_offload: true, tiles: 0, ratio: 0.5 },
    },
    ...(o.startImage ? {
      startimg: { class_type: "LoadImage", inputs: { image: o.startImage } },
      startfit: {
        class_type: "ImageResizeKJv2",
        inputs: { image: ["startimg", 0], width: o.width, height: o.height, upscale_method: "lanczos", keep_proportion: "crop", pad_color: "0, 0, 0", crop_position: "center", divisible_by: 16, device: "cpu" },
      },
    } : {}),
    ...(o.motionFrames ? { motionimg: { class_type: "LoadImage", inputs: { image: o.motionFrames } } } : {}),
    audio: { class_type: "LoadAudio", inputs: { audio: o.audio } },
    w2v: { class_type: "Wav2VecModelLoader", inputs: { model: "wav2vec2-chinese-base_fp16.safetensors", base_precision: "fp16", load_device: "main_device" } },
    embeds: {
      class_type: "MultiTalkWav2VecEmbeds",
      inputs: { wav2vec_model: ["w2v", 0], audio_1: ["audio", 0], normalize_loudness: true, num_frames: o.maxFrames, fps: 25, audio_scale: o.audioScale ?? 1, audio_cfg_scale: o.audioCfg ?? 1, multi_audio_type: "para" },
    },
    talk: { class_type: "MultiTalkModelLoader", inputs: { model: "Wan2_1-InfiniteTalk-Single_fp8_e4m3fn_scaled_KJ.safetensors" } },
    lora: {
      class_type: "WanVideoLoraSelect",
      inputs: { lora: "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors", strength: o.loraStrength ?? 1, low_mem_load: false, merge_loras: false },
    },
    swap: {
      class_type: "WanVideoBlockSwap",
      inputs: { blocks_to_swap: o.blocksToSwap, offload_img_emb: false, offload_txt_emb: false, use_non_blocking: true, vace_blocks_to_swap: 0, prefetch_blocks: 1, block_swap_debug: false },
    },
    model: {
      class_type: "WanVideoModelLoader",
      inputs: {
        model: "Wan2_1-I2V-14B-480p_fp8_e4m3fn_scaled_KJ.safetensors", base_precision: "fp16_fast", quantization: "disabled", load_device: "offload_device",
        attention_mode: o.attention, block_swap_args: ["swap", 0], lora: ["lora", 0], multitalk_model: ["talk", 0],
      },
    },
    text: {
      class_type: "WanVideoTextEncodeCached",
      inputs: { model_name: "umt5-xxl-enc-bf16.safetensors", precision: "bf16", positive_prompt: o.prompt, negative_prompt: o.negative ?? NEGATIVE, quantization: "disabled", use_disk_cache: true, device: "gpu" },
    },
    i2v: {
      class_type: "WanVideoImageToVideoMultiTalk",
      inputs: { vae: ["vae", 0], width: o.width, height: o.height, frame_window_size: 81, motion_frame: 9, force_offload: false, colormatch: "disabled", start_image: [o.startImage ? "startfit" : "fit", 0], tiled_vae: false, clip_embeds: ["clipenc", 0], mode: "infinitetalk", output_path: "", ...(o.motionFrames ? { motion_frames: ["motionimg", 0] } : {}) },
    },
    sample: {
      class_type: "WanVideoSampler",
      inputs: {
        model: ["model", 0], image_embeds: ["i2v", 0], steps: o.steps, cfg: 1, shift: o.shift, seed: o.seed, force_offload: !o.keepLoaded, scheduler: "dpm++_sde",
        riflex_freq_index: 0, text_embeds: ["text", 0], multitalk_embeds: ["embeds", 0], rope_function: "comfy",
      },
    },
    frames: { class_type: "WanVideoPassImagesFromSamples", inputs: { samples: ["sample", 0] } },
    save: {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["frames", 0], audio: ["embeds", 1], frame_rate: 25, loop_count: 0, filename_prefix: o.prefix, format: "video/h264-mp4",
        pingpong: false, save_output: true, pix_fmt: "yuv420p", crf: 8, save_metadata: false, trim_to_audio: false,
      },
    },
  };
}
