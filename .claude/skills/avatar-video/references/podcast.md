# The studio conversation (podcast) format

The pilot is `videos/podcast-studio`: its `script.txt` (49 lines, two speakers) and its `brief.yaml`,
whose `qa`, `qa_v2` ... `qa_v5` lists record every edition. Published 2026-10-28: 6:29, 1920x1080 at 30 fps.
Its tools started in its own `out/` folder and are now in the repository (`tools/podcast/`,
`tools/voice/`, `tools/avatar/`), checked against the pilot's own renders (below).

Contents: what it looks like · the pieces · the tools · the run, in order · plan.json · listening clips ·
the chain · reusing clips across editions · numbers · tried and dropped.

## What it looks like

- **two** (every turn the plan does not list): the host's camera on the left, the guest's on the right,
  rounded 600x900 tiles over the blurred studio. The one speaking plays their talking clip inside a ring
  of their colour (`ring` in the registry); the listener plays their own listening clip, a touch
  dimmer. At a change of speaker the dimming and the ring ease over 0.3 s instead of snapping.
- **cards**: the guest's camera on the right, a stack of cards on the left (an HTML page's states, each
  shown from its trigger word on). A cards beat is always the guest's.
- **screen**: a demo full frame, with no camera: a cut of an earlier video's screen track, a diagram,
  or a real page with highlights. The voice runs on over it.
- A title (3.2 s, a slow push into the studio) before the narration, an end card (5 s) after it, both
  over music. The music dips under the first lines, is gone by the tenth second, and comes back under
  the last line.
- Captions burned in: the script's words at Whisper's times, the word being said in its speaker's colour.
- No presenter labels on the tiles: the owner's choice (main skill, section 10). The end card says
  "AI-generated hosts · real screen recordings", and every platform's AI flag is set.

One segment has one layout: the composer refuses a segment whose turns were planned differently. So
wherever the layout changes inside one speaker's run of lines, the pause there must be longer than the
clips' `group_gap` (main skill, section 3).

## The pieces

| Piece | How the pilot made it |
|---|---|
| The host | an invented woman: Z-Image-Turbo from a prompt that names no one (`portrait.ts render`), the pick cropped to the guest's face size; her voice a synthetic prompt (a Kokoro preset) for VibeVoice |
| The guest | the owner's avatar put in front of the studio wall: `portrait.ts edit --keep-framing --ref2 <empty plate>`, then his original head pasted back through a person mask |
| The studio | a generated wide studio shot, blurred behind the tiles |
| Cards, title, end card, thumbnail, the install page | small HTML pages, one PNG per state (`html-frames.ts <page> <dir> states <n>`: the page's `window.setState(k)` shows state k). Cards lie over the studio: render them with `--transparent` |
| A diagram that moves | an HTML page with CSS animations, rendered frame by frame (`html-frames.ts ... anim <seconds>`) and encoded |
| Demos | cuts of the screen tracks of earlier published videos, already checked; a `sync` puts a moment of the footage under a word |
| Privacy | solid boxes with generic labels ("work laptop", "server") over every machine name, and over both address columns of a table of machines |
| Music | a licensed track: its opening under the title, and a strong passage under the end card (`music_out`, 112 s into a 135 s track whose own last ten seconds fade to silence) |

## The tools

| Tool | What it does |
|---|---|
| `tools/voice/qa-lines.ts <script> <narration> [--only n,...] [--seeds 43-46] [--fuzzy w,...]` | Whisper reads every line under the rules of the main skill's section 3, step 1 (`qa-lib.ts`); a flagged line is rendered again with the seeds and the best take wins; writes `qa.json` and `qa-use.txt` (the `--use` list for `lines.ts`). `--score <wav> "<text>"` scores one take: test the rules on known bad takes first |
| `tools/voice/fix-lines.ts <narration> --lines 5,7 [--seeds 101-106] [--max-st 3] [--max-st-up 3] [--max-wps 4] [--sandwich 10] [--variant "10=Oh, no...\|Oh no."] [--fuzzy w,...]` | re-voices lines and picks the take by measurement (steps 1-3 of section 3); `--sandwich` renders a line inside its exchange; takes are cached as `takes/l<n>-<sha6 of the wording>-s<seed>[-sw].wav`, the picks written to `fix-lines.json`; a failing take never replaces a line |
| `tools/podcast/chain.ts <plan.json> --dry` | the segments: `talk.ts --dry` with the plan's clip settings, so they match the chain's |
| `tools/podcast/chain.ts <plan.json> [--alias-from <old talk dir>] [--plan-only] [--until k] [--need-mb 20000] [--uncapped]` | renders both presenters' clips in timeline order, each continuing the one before it, under the memory and GPU rules of the main skill's section 7 |
| `tools/podcast/listen.ts <talk.json> <plan.json> [--only k] [--motion <apng>] [--alias <clip>] [--dry]` | the listener's clip for every two-camera segment (the chain calls it); writes `<talk dir>/listen.json` |
| `tools/podcast/compose.ts <plan.json> [--parts a-b] [--audio-only]` | the picture and the sound, and `<out>.srt`; `--parts` writes a preview of a few segments with their sound; `--audio-only` rebuilds the sound under the existing picture |
| `tools/podcast/seams.ts <video> <plan.json> [--only k,...] [--json <out>]` | measures every tile cut (the chain, below) |
| `tools/podcast/placeholder.ts <plan.json> [--out <dir>]` | stand-in clips (each segment's portrait, still), to test the composer before any GPU work |
| `tools/avatar/html-frames.ts <page.html> <out dir> states <n> \| anim <seconds> [fps] [--transparent]` | HTML to PNG at 1920x1080, offline, through chrome-headless-shell (`AVATAR_CHROME`, or Playwright's) |
| `tools/share.ts <video> [--max-mib 28] [--short-side 720]` | the share copy for review |
| `tools/avatar/comfy-capped.sh`, `tools/avatar/dropcache-loop.sh` | ComfyUI inside a root memory scope, where no user manager can cap it; the page-cache drop every 30 s under WSL. The chain runs both when it needs them |

The pilot's `out/tools/` still holds the originals and the one-off scripts of each edition; the
repository's tools replace them. Checked against the pilot on 2026-10-28: the listening tool computes
the same cache key and mood for all 35 of its listening clips; the composer builds lossless parts
identical frame for frame (six segments of all three layouts, and every shared still);
`chain.ts --plan-only` reuses 46 and renders 26 of v5's clips against v4's, as the v5 run did;
`seams.ts` reads the same numbers; `html-frames.ts` draws the title and every card state pixel for
pixel; `shiftSrt` gives the uploaded captions byte for byte.

## The run, in order

From the repository root, with `N=videos/<slug>/out`, `AVATAR_PRESENTERS` set when the presenters live
in a private registry, and `AVATAR_GPU_HOLD` when another job shares the GPU:

```bash
# 1. the narration: every line, read back, retaken, then the lines the person flags
L="--between 0.6 --pause <n:s,...> --no-ai-check --min-heard 0"          # the same in every lines.ts call
bun tools/voice/lines.ts render videos/<slug>/script.txt $N/narration $L
bun tools/voice/qa-lines.ts videos/<slug>/script.txt $N/narration --fuzzy <product names>
bun tools/voice/lines.ts render videos/<slug>/script.txt $N/narration $L --use "$(cat $N/narration/qa-use.txt)"   # if it lists any
bun tools/voice/fix-lines.ts $N/narration --lines <n,...> --sandwich <the short ones> --fuzzy <product names>
bun tools/voice/lines.ts render videos/<slug>/script.txt $N/narration $L --safe-end <n,...>   # no --only, no old --use
bun tools/voice/pitch.ts $N/narration
# 2. sound and word times (again after every change to the narration)
bun tools/voice/mix.ts $N/narration
bun tools/avatar/words.ts $N/narration --out $N/narration/words.json
# 3. the plan's settings, the segments, then the beats
bun tools/podcast/chain.ts $N/plan.json --dry
# 4. the clips, both presenters, chained
bun tools/podcast/chain.ts $N/plan.json [--alias-from $N/talk-<previous>]
# 5. compose, check, measure the cuts, the share copy
bun tools/podcast/compose.ts $N/plan.json
bun tools/check.ts $N/<name>.mp4 --deny <terms.txt> --json $N/check.json
bun tools/podcast/seams.ts $N/<name>.mp4 $N/plan.json
bun tools/share.ts $N/<name>.mp4
```

The GPU works in steps 1 and 2 too (VibeVoice, and Whisper in `words.ts` unless it is given `--cpu`),
not only in step 4, so a GPU hold applies to them as well; steps 3 and 5 run on the CPU. On a new face,
render the first segments alone (`chain.ts plan.json --until <k>`) and look at them.

## plan.json

```json
{
  "host": "helen", "guest": "goran3f",
  "narration": "narration", "talk": "talk/talk.json", "words": "narration/words.json", "mix": "narration/mix.wav",
  "faces": { "goran3f": "goran-studio-r5" },
  "clips": { "size": "512x768", "audio_scale": 0.9, "group_gap": 1.1, "dir": "talk-clips",
             "negative_extra": "looking away, looking to the side, touching face, touching nose, hand on face" },
  "amused": ["sports car", "call it management", "^ha"],
  "studio": "<the studio picture>", "music": "<licensed track>", "music_in": 0, "music_out": 112,
  "out": "podcast.mp4", "work": "compose", "pre": 3.2, "post": 5,
  "title_png": "visuals/title/state-0.png", "end_png": "visuals/end/state-0.png",
  "beats": [
    { "line": "One open-source app", "layout": "cards", "visual": { "states": "visuals/what", "at": ["one", "remote", "private", "chat"] } },
    { "line": "Windows had a hidden speed limit", "layout": "screen", "visual": { "file": "<footage.mp4>", "sync": { "word": "unless", "at": 12.3 } }, "chip": "Real command output" },
    { "line": "Every machine I own", "layout": "screen", "visual": { "file": "<footage.mp4>", "in": 0 },
      "boxes": [{ "x": 158, "y": 224, "w": 300, "h": 31, "label": "work laptop" }] }
  ]
}
```

- `host` and `guest` are the script's speaker names; `faces` maps a speaker to the presenter who shows
  it (`talk.ts --face`). `clips` holds the clip settings, part of every clip's cache key, so they live
  in one place: the chain passes them to `talk.ts` and `listen.ts`. `amused` lists the lines (regular
  expressions, case-insensitive) whose listener smiles a little more. Paths are relative to the plan's
  folder.
- A beat names its turn by the words its line starts with (`line`), or by number (`turn`, 0-based: turn
  n is the (n+1)-th spoken line, `lines/l<n+1>.wav`; the `#` lines do not count). A `line` that starts
  no turn, or several, is refused. `lines.ts --pause n:s` and `--only n`, and `fix-lines.ts --lines`,
  count spoken lines from 1; `talk.ts` segments (`k`, one per clip) are a third numbering.
- `visual.states` with `at`: state 0 from the beat's start, state k from the k-th word in `at` (each one
  looked for after the one before it).
- `visual.file` starts at `in` seconds into the footage, or `sync` puts the footage's moment `at` under the
  start of `word`. A shot shorter than its beat holds its last frame.
- `boxes` are in output pixels (1920x1080), filled; `label` is drawn in place of what the box hides,
  `from` starts the box that many seconds into the visual.
- `chip` is the label at the top right: "Real screen recording", "Real command output". A generated
  diagram gets none.
- The pilot's own plan in this form: `videos/podcast-studio/out/plan-v5-repo.json` on the machine that
  made it.

## Listening clips

The first edition showed the listener as a dimmed still of the portrait; the owner asked for "actual
listener video". InfiniteTalk driven by silent audio keeps the mouth moving (the idle clip of
`docs/real-person.md`); `MultiTalkSilentEmbeds`, the model's trained "not speaking" input, keeps it shut.
`listen.ts` renders with it (`workflows.ts` `listenClip`):

- The prompt names only small movements: blinking, a slow nod now and then, a slight smile; the hands
  still; the camera and the studio still. A named gesture repeats in every window. A presenter's own
  prompts are `listen_prompt` and `listen_prompt_amused` in the registry (describe the person: the
  pilot's said "a man with an athletic build in a red polo shirt ... stands at a studio microphone");
  without them, generic ones.
- The negative prompt (`LISTEN_NEGATIVE`) adds talking, an open mouth, lip movement, touching the face
  or the nose, a hand to the chin, raised hands, looking away or to the side, a profile view.
- Two moods: amused (a smile that grows) for a segment of 9 s or less whose lines match `amused`, calm
  otherwise.
- 6 steps, seed 3000 plus the segment's number, at the plan's clip size; content-addressed in the clips
  folder.

Every one of the pilot's 35 two-camera segments got one (v3: 19 calm, 16 amused).

## The chain: cuts that do not jump

Every clip used to start from the portrait, so each cut between a listening and a speaking clip snapped
back to the portrait's pose: to the owner, "two diff scenes glued up together".

- **The wrong fix:** give each clip the frame on screen at the previous cut as its start image
  (`--start`). The start image is the reference of every InfiniteTalk window, so each link made a
  generated frame the next reference: by the 9th link deeper wrinkles and generic features, by the 13th
  an orange cast and a smoothed face that was no longer his. It was thrown away.
- **The fix:** a local patch of ComfyUI-WanVideoWrapper (`tools/avatar/patches/wanvideo-motion-frames.py`,
  applied by `setup.sh`) lets the first window take a previous clip's last frames as its motion frames,
  while the portrait stays the reference of every window: a continuation across clips is the same as one
  long InfiniteTalk run. `talk.ts --motion <apng>` and `listen.ts --motion <apng>` pass the 9 frames up
  to the cut (4k+1 frames, in a lossless APNG so they reach the model pixel-exact; the audio leads in
  with as many frames of silence, which the wrapper drops).
- **Which 9 frames.** A clip is not its segment: InfiniteTalk renders 81, 153, 225 ... frames (windows
  of 81 stepping 72), up to 71 frames past the segment, at 25 fps, and the composer trims them at 30 fps.
  The frame on screen at the cut is frame n-1 of the segment in the composer's 30 fps stream: extract it
  through the composer's own `fps=30,tpad,select` filters, find the 25 fps frame with the same RGB hash,
  and take the 9 frames that end there. A first chain took each clip's last frame, and every cut would
  still have jumped.
- Each presenter's clips render in timeline order. A chain starts again from the portrait only where
  that presenter's tile was hidden (a demo full frame; for the host also the guest's card beats), where
  nobody sees the reset.
- Failures: a clip the memory guard stopped is tried again once the host has room (up to six tries);
  any other failure gets one more try after 60 s. A clip that still fails ends its presenter's chain
  (the next clip starts from the portrait), and three failed clips in a row stop the whole run (exit 2).
  The motion frames are part of a clip's cache key, so a run started again resumes from its cache.
- At its start the chain empties the talk folder's clip references (`talk.json`'s `clips`, and
  `listen.json`): `--dry` wrote references computed without motion frames, and only the clips the chain
  registers may reach the composer. Clips still in the cache come back at once by their keys.

**Measure the cuts:** `seams.ts` compares, for each tile at each cut between two two-camera segments,
the change across the cut (the PSNR of the last frame before it against the first after it) with the
changes just before and just after. A cut more than 6 dB under its neighbours, or under 28 dB, is
flagged. The second edition jumped at 48 of its 48 tile cuts, the third at none: its one flag was a
hand gesture running through the cut, so look at each flag before you believe it.

## Reusing clips across editions

`chain.ts --alias-from <old talk dir>` reuses an old clip for a segment when everything that shapes the
clip is the same: the turns, their text and speakers, the takes (byte-identical line files), the frame
count (the segment may move by whole frames, never by a fraction of one), and the start (a fresh start
from the portrait, or this presenter's previous clip reused as well, so the motion frames are the old
ones). It hands the old file to `talk.ts --alias` or `listen.ts --alias`; `--plan-only` prints which
clips would be reused and which rendered, and touches nothing. What it needs:

- the old talk folder's `talk.json` and `listen.json` (without the second, no listening clip is reused);
- the old narration folder, where it compares the takes (without it, nothing is reused);
- the same segment numbers: it matches segments by index, so after an inserted or deleted line nothing
  later is reused.

Each edition gets its own talk folder (`talk-v4`, `talk-v5`): `--alias-from` refuses the edition's own.

## Numbers

| | |
|---|---|
| The video | 389 s: the 3.2 s title, the narration, the 5 s end card; -14.1 LUFS, -1.6 dBTP |
| Clips per edition | 72: 37 talking, 35 listening |
| Speed | about 50 s of GPU per second of video at 512x768 (48-54 per edition; a 5.7 s clip in 281 s) |
| A full night's run | v2: voices, all 72 clips and the compose in about seven hours |
| A revision | 26 clips rendered and 46 reused: about three hours (3.1 h and 3.4 h), memory waits included |
| The checks | `check.ts` passed every edition (one frame a second OCR'd, 0 hits); `seams.ts` 0 jumps in 48 tile cuts from v3 on |

## Tried and dropped

- **Both presenters in one two-person InfiniteTalk clip:** faithful, with natural listening, but
  1024x768 needs about 36 GB of GPU; at 832x624 with 40 swapped blocks it took 108 s of GPU per second
  of video, about ten hours for the whole video. Not chosen.
- **LongCat-Video-Avatar 1.5** (Q8 GGUF with its DMD LoRA, 8 steps): more expressive, but slower (184 s
  per second of video), and the guest's face drifted generic, the lips went pink, and it re-posed him
  seated.
- **The listener as a dimmed still** (v1): replaced by listening clips at the owner's request.
