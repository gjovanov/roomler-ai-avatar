# What to expect

Everything below was measured on one machine: an RTX 5090 Laptop GPU (24 GB), 94 GB of RAM, Windows 11
with WSL2 (Ubuntu 24.04), October 2026. A desktop GPU with more power will be faster; a GPU with less
VRAM will be slower or not fit.

## Time

| Step | Measured | Notes |
|---|---|---|
| One narration line (VibeVoice) | 10-20 s | plus a few seconds of Whisper checking it |
| A 4-line narration, end to end | 82 s | the example |
| Word times, Whisper medium per turn | 13 s for 4 turns | on the GPU |
| The plan (Claude Opus, via Claude Code) | 34-37 s for 4 turns, 71-86 s for 23 | per run; a plan that breaks a rule gets one repair run |
| A talking clip, 640x640, 6 steps | **42-70x real time**, i.e. 0.7-1.2 min of GPU per second of video | with `--swap 8`, the model unloaded between clips, the host not paging |
| ... the same, under memory pressure | 92-107x real time | the night the host was paging hard (the crash below) |
| A talking clip, 512x768 (tutor), 6 steps | **37-43x real time** | six block clips of 16-27 s, 124.8 s of video in 84 minutes |
| Model load from ext4 / from a Windows drive (9p) | 7 s / 12-20 min | per clip, see setup |
| A portrait (Z-Image-Turbo / Qwen-Image-Edit) | 10-20 s each | after a first load of about a minute |
| Compose, either format, for a 75 s video | under a minute | lossless parts, one final encode |

So a 75-second two-host video with 50-55 seconds of one presenter's speech takes one to two hours of
GPU for its clips from scratch. Re-voicing one presenter re-renders only that presenter. A second edition
of the same narration with another face renders that face's turns only, and an edition that combines faces
already rendered renders nothing.

The example in `example/` (four turns, 19.5 s) took 82 s for the voices, 37 s for the plan, 18.3
minutes for its four clips (54-61x real time) and 6 s per format to compose. The one-presenter
[wayland-asahi](../videos/wayland-asahi/) video (23 lines, 124.8 s) took 84 minutes for its six tutor
clips, 71-86 s per plan, and about a minute to compose each of its two voices.

## Quality

**What works.** Lip sync is tight on clean speech, including fast lines. The presenters blink, raise
their eyebrows on stressed words, nod, and move their heads naturally; identity holds for the length of
a clip. Cuts land in the silence between turns, so a presenter's reset to their portrait pose at the
start of a clip is hidden by the cut to the other.

**Where it shows.** The clips are 640x640: sharp in the 16:9 bubble (380 px) and the 9:16 tiles
(440 px), a little soft in a solo tile, which is an upscale. The tutor layout's 512x768 clips fill a
667x1000 panel, a 1.3x upscale. Hands move only when the portrait shows them and the prompt asks: from a
waist-up portrait with both hands in front of the chest, and a talk prompt for a calm face and
presentation gestures, the presenter talks with open palms, points, counts on his fingers and rests his
hands in the pauses, with well-formed hands in the frames we checked (one every two seconds of a 125 s
video). A selfie with an arm reaching
out keeps the arm frozen. The background holds still when the prompt asks for it, plain backgrounds best.

**The voices.** VibeVoice sounds like a conversation, but it is a generative model, and takes vary:

| What happens | How often | What to do |
|---|---|---|
| A line comes out mumbled; Whisper hears under 60% of it | now and then | the run stops; render it with another seed |
| A line comes out in another register (an octave up) | rare, short exclamations | `pitch.ts` flags it; another seed, and "." for "!" |
| A short line comes out rushed and sounds cut off | short lines | render it with a word after it, cut before that word, add a pause |
| A cloned voice sounds like it is in a tunnel | a sample recorded in a reverberant room | record the sample in a quiet, dead room |

Listen to every line before the GPU renders faces for it.

**Captions** show the script's words, timed by Whisper per turn: misheard names never show, and a turn
Whisper missed entirely still gets times between its neighbours.

**The plan.** Claude's cards are short and tied to the claims; its layouts follow the rules because the
rules are checked. Its hook variants and cover are proposals for a person to choose from. It plans from
your descriptions of the shots and the words of the narration, not from the pictures: once it told the
editor to keep "the typos" visible because a line joked about spelling, in a recording with no typo in
it. Read its notes against the recording. It also miscounts now and then (a seven-word card twice in a
row as six); that is what the repair run is for.

## Hardware and memory

- **VRAM.** The talking-clip workflow fills a 24 GB GPU (22-24 GB) and spills 3-5 GB past it into the
  host's shared GPU memory. Fewer GB of VRAM may work with a higher `--swap` (blocks kept in system
  RAM), slower; that is untested.
- **Host RAM.** The WSL VM takes about 45 GB of a 94 GB host during a render, plus the GPU spill. 32 GB
  is the floor, 64 GB comfortable. Watch the host's available memory, not only the VM's.
- **Disk.** 54-84 GB of weights; keep them on the Linux filesystem.

## Things that went wrong, and what the tools do about them

| Symptom | Cause | Now |
|---|---|---|
| The laptop hung and reset itself, no crash dump, at night during a render | the render spilled into Windows' memory while other builds had Windows paging hard; the GPU timed out (a TDR) | the server unloads models before each clip (a boundary had overflowed the GPU by 5 GB in 22 s); a run stops when the host has under 6 GB available (`AVATAR_MIN_FREE_MB`) |
| WSL stopped answering for every program for hours | the 11 GB text encoder loaded beside the 14B model, with WSL's swap already full | prompts are encoded first, alone; the server runs in a 26 GB memory cap |
| Each clip took 12-20 minutes to start | the model was read over WSL's 9p bridge, and the node pack reloads it every clip | weights on ext4 (`setup.sh localize` otherwise) |
| The model reloaded after every clip anyway | ComfyUI's default cache evicts under RAM pressure, and WSL is always under it | `--cache-classic` |
| A render "lost" its client after the laptop slept | the server finished, the client's connection was refused on wake | the client polls through ten minutes of refusals and finds the clip by its name |
| Captions skipped lines; one track was captioned "We live!" 29 times | Whisper's long-form mode | Whisper runs once per turn |
| An opening syllable peaked at -0.5 dBTP in the final file | AAC overshoot on a sharp onset after silence | the compose measures and limits only when needed |
| A presenter's idle "listening" clip looked unnatural on a real face | InfiniteTalk driven by silence keeps the mouth moving | the 16:9 shows the speaker only; the 9:16's listener is a still; the studio format's listening clips use the model's trained silence instead (`tools/podcast/listen.ts`), which keeps the mouth closed |
| A line passed every check, and the person heard "What actually happ?" | VibeVoice stopped inside the last syllable, the end fade took the rest, and Whisper still wrote the whole word | `tools/voice/fix-lines.ts` checks the voice itself (the pitch track and the level of the take's last moments); `lines.ts --safe-end` keeps a soft last syllable |
| Every cut between a listening and a speaking clip jumped back to the portrait's pose | each clip started from the portrait | `tools/podcast/chain.ts` continues each clip from the previous one's motion frames (`--motion`); passing the cut frame as the next start image instead made the face drift further at every link |
| The host had 4 MB available during a chain of clips, though ComfyUI was capped at 24 GB | CUDA's pinned host memory and the GPU's spill into shared system memory are outside the cap, and PyTorch keeps them until the process exits | the chain restarts ComfyUI after every clip that rendered |
| ComfyUI ran uncapped on a machine that had a user manager | one failed unit (an old ComfyUI scope the cap had killed) made the manager `degraded`, and the cap's check wanted `running` | `comfy-server.sh` accepts `degraded`, clears its own failed scopes, and says whether it is capped (`comfy-server.sh cap`) |
| The privacy check flagged a city's name that was not on screen | OCR read a window's title-bar buttons as the word | look at the frame before deciding; the check stays as it is |
| The privacy check flagged an IPv4 address in the tutor layout | at 60% scale, OCR read a kernel version, "6.19.14-400", as "6.19.14.4" | the same: look at the frame; the check stays as it is |

## What it is not

- Not real time, and not a one-click service: the tools leave the judgement calls (which take, which
  face, which plan) to a person, on purpose.
- Not a way to fake a product: the tools never generate the product, and the recording is labelled real.
- Not a way to impersonate anyone: a real person's likeness needs their consent, and is labelled.
