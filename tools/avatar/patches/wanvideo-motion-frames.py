# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 G ROX EOOD
#
# A local patch of ComfyUI-WanVideoWrapper (Apache-2.0, kijai; verified on the pinned 088128b): InfiniteTalk can
# CONTINUE a previous clip. WanVideoImageToVideoMultiTalk gets an optional `motion_frames` input; in infinitetalk mode
# those frames become the first window's motion frames (fixed latents, dropped from the output, exactly like a later
# window's overlap), while start_image stays every window's identity reference.
#
# Why: InfiniteTalk's start image is not just the first frame, it is the REFERENCE of every window (multitalk_loop.py
# encodes it into `y` for each one; a later window only takes its motion from the previous window's last frames). A
# chain of clips that hands the next clip the previous clip's last frame as its start image therefore makes a
# generated frame the next reference, and the face drifts further at every link: measured 2026-10-27 on the podcast,
# by the 13th link an orange cast and a smoothed face that no longer looked like him. With motion_frames the portrait
# stays the reference and a cross-clip continuation is the same as one long InfiniteTalk run (talk.ts --motion,
# workflows.ts motionFrames).
#
#   python3 wanvideo-motion-frames.py <ComfyUI-WanVideoWrapper dir>      (idempotent; setup.sh runs it)
import os
import shutil
import sys

root = os.path.join(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/roomler-avatar/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper"), "multitalk")
MARK = "roomler patch"
edits = {
    "nodes.py": [
        ('''                "output_path": ("STRING", {"default": "", "tooltip": "If set, will save each window's resulting frames to this folder, also DISABLES returning the final video tensor to save memory"}),

            }
        }

    RETURN_TYPES = ("WANVIDIMAGE_EMBEDS", "STRING",)''',
         '''                "output_path": ("STRING", {"default": "", "tooltip": "If set, will save each window's resulting frames to this folder, also DISABLES returning the final video tensor to save memory"}),
                "motion_frames": ("IMAGE", {"tooltip": "roomler patch: frames to CONTINUE from (a previous clip's last frames, 4k+1 of them): the first window's motion frames, dropped from the output; start_image stays the reference of every window"}),

            }
        }

    RETURN_TYPES = ("WANVIDIMAGE_EMBEDS", "STRING",)'''),
        ('''    def process(self, vae, width, height, frame_window_size, motion_frame, force_offload, colormatch, start_image=None, tiled_vae=False, clip_embeds=None, mode="multitalk", output_path=""):''',
         '''    def process(self, vae, width, height, frame_window_size, motion_frame, force_offload, colormatch, start_image=None, tiled_vae=False, clip_embeds=None, mode="multitalk", output_path="", motion_frames=None):'''),
        ('''            resized_start_image = resized_start_image.unsqueeze(0)
        ''',
         '''            resized_start_image = resized_start_image.unsqueeze(0)
        resized_motion = None
        if motion_frames is not None:
            resized_motion = common_upscale(motion_frames.movedim(-1, 1), W, H, "lanczos", "disabled").movedim(0, 1)
            resized_motion = (resized_motion * 2 - 1).unsqueeze(0)
        '''),
        ('''            "multitalk_start_image": resized_start_image if start_image is not None else None,
            "frame_window_size": num_frames,
            "motion_frame": motion_frame,
            "target_h": H,''',
         '''            "multitalk_start_image": resized_start_image if start_image is not None else None,
            "multitalk_motion_frames": resized_motion,
            "frame_window_size": num_frames,
            "motion_frame": motion_frame,
            "target_h": H,'''),
    ],
    "multitalk_loop.py": [
        ('''    current_condframe_index = 0
''',
         '''    current_condframe_index = 0
    # roomler patch: continue a previous clip from given motion frames; start_image stays the reference.
    init_motion = image_embeds.get("multitalk_motion_frames", None)
    continued = init_motion is not None and mode == "infinitetalk"
    if continued:
        cond_frame = init_motion
        cur_motion_frames_num = init_motion.shape[2]
        log.info(f"InfiniteTalk continues from {cur_motion_frames_num} given motion frames; start_image stays the reference")
'''),
        ('''                cond_ = cond_image if is_first_clip else cond_frame
                latent_motion_frames = vae.encode(''',
         '''                cond_ = cond_image if (is_first_clip and not continued) else cond_frame
                latent_motion_frames = vae.encode('''),
        ('''            num_frames_to_save = video_np.shape[0] if is_first_clip else video_np.shape[0] - cur_motion_frames_num''',
         '''            num_frames_to_save = video_np.shape[0] if (is_first_clip and not continued) else video_np.shape[0] - cur_motion_frames_num'''),
        ('''            start_idx = 0 if is_first_clip else cur_motion_frames_num''',
         '''            start_idx = 0 if (is_first_clip and not continued) else cur_motion_frames_num'''),
        ('''            gen_video_list.append(videos if is_first_clip else videos[:, cur_motion_frames_num:])''',
         '''            gen_video_list.append(videos if (is_first_clip and not continued) else videos[:, cur_motion_frames_num:])'''),
    ],
}
# Check every anchor in both files before writing either, so a wrapper that moved on is refused whole.
plans = {}
for name, reps in edits.items():
    path = os.path.join(root, name)
    src = open(path, encoding="utf-8").read()
    if MARK in src:
        print(f"{name}: already patched")
        continue
    for old, _ in reps:
        n = src.count(old)
        if n != 1:
            sys.exit(f"{name}: an anchor was found {n} times (a different wrapper version?): {old[:80]!r}")
    plans[name] = (path, src, reps)
for name, (path, src, reps) in plans.items():
    for old, new in reps:
        src = src.replace(old, new)
    shutil.copy2(path, path + ".orig")
    open(path, "w", encoding="utf-8").write(src)
    print(f"patched {name}")
