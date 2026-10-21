# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2026 G ROX EOOD
"""Word timestamps for a rendered voice track, printed as one JSON object.

    <podcast-server venv>/bin/python align-words.py <audio> [--model openai/whisper-base.en]
        [--windows a:b,c:d,...] [--cpu]

Run it with starling's podcast-server venv (torch + transformers, already there for VibeVoice);
tools/voice/render.sh align does. Whisper (MIT) only transcribes here: the turn boundaries come from
matching its words to the script we already have (podcast-lib.ts, alignByWords), so a misheard
word costs nothing as long as most of a turn is heard.

--windows transcribes each window (seconds) on its own and offsets its words back onto the track
(tools/avatar/words.ts passes one per turn). Over a whole track Whisper runs long-form, and there it
drops lines and loops: on 2026-10-21 whisper-base.en wrote "We live!" 29 times over a 1.6 s pause
and lost the last three lines of another. A window shorter than 30 s is one short-form pass.
--cpu keeps it off the GPU (while ComfyUI holds it).
"""
import json
import subprocess
import sys

import numpy as np
import torch
from transformers import pipeline

args = sys.argv[1:]
if not args:
    sys.exit("usage: align-words.py <audio> [--model openai/whisper-base.en] [--windows a:b,...] [--cpu]")
audio = args[0]
model = args[args.index("--model") + 1] if "--model" in args else "openai/whisper-base.en"
windows = [tuple(float(v) for v in w.split(":")) for w in args[args.index("--windows") + 1].split(",")] if "--windows" in args else []
gpu = torch.cuda.is_available() and "--cpu" not in args

raw = subprocess.run(
    ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", audio, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
    check=True, capture_output=True,
).stdout
x = np.frombuffer(raw, dtype="<f4").copy()

asr = pipeline(
    "automatic-speech-recognition",
    model=model,
    device=0 if gpu else -1,
    torch_dtype=torch.float16 if gpu else torch.float32,
)


def transcribe(seg, offset):
    out = asr({"raw": seg, "sampling_rate": 16000}, return_timestamps="word", chunk_length_s=30, batch_size=8)
    words = [
        {"word": c["text"].strip(), "start": round(float(c["timestamp"][0]) + offset, 3),
         "end": round(float(c["timestamp"][1] if c["timestamp"][1] is not None else c["timestamp"][0]) + offset, 3)}
        for c in out.get("chunks", []) if c["text"].strip()
    ]
    return out["text"].strip(), words


if windows:
    texts, words = [], []
    for a, b in windows:
        t, w = transcribe(x[int(a * 16000):int(b * 16000)], a)
        texts.append(t)
        words += w
    text = " ".join(texts)
else:
    text, words = transcribe(x, 0.0)
result = {"model": model, "seconds": round(len(x) / 16000, 3), "text": text, "words": words}
if windows:
    result["windows"] = [[a, b] for a, b in windows]
print(json.dumps(result))
