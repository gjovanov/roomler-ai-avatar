# FX demos: 3D and motion graphics around existing recordings

Ten short films glued from recordings that already exist, to find out what Blender and HyperFrames add to the avatar videos. Claude
writes code that draws every frame: Blender makes the 3D plate, HyperFrames adds the type, the sound and the footage of people on top,
ffmpeg finishes it. All the new picture is code, with no AI video model, and no new voice or face is made: the avatars are the existing clips.

The idea that holds them together: **a script's jokes and analogies are already a storyboard, so the world builds what the speaker says.**
A "sports car for your mouse pointer" becomes a mouse pointer that is a sports car, racing across the real recording.

| Demo | The effect | Blender | HyperFrames |
|---|---|---|---|
| 01 Three Into One | product launch: three slabs fuse into the logo | slabs, floor mirror, merge, 3D logo, the call's gallery in flat colours | tile, type on the words, an 8-person call tracked onto slab 3, sound |
| 02 A Sports Car | an analogy taken literally | car, recording as a road, motion blur | gauge, kinetic type, tiles |
| 03 One Second, Sliced | an abstract number as an object | 120 slabs of real frames, one camera move | numerals, 120 boxes in one second, one slot opened to scale |
| 04 The Frustrated Postman | a security claim as a character | toy diorama, keyframed acting | scramble, captions, action sound |
| 05 Friday Night | vertical comedy, a freeze | rigid bodies, a second layer with alpha | cut-out between 3D layers, kinetic captions |
| 06 The Daemon, Exploded | a teardown of software | machined puck, footage on hexagons | leader lines tracked to the 3D |
| 07 The Keynote He Never Gave | a presenter on a 3D stage | stage, curved LED wall, desk layer | cut-out tracked to the camera, title behind him |
| 08 Across Town | one shot from a driveway to the planet | toy town, dot globe from map data | card, captions |
| 09 Remote Inception | a perfect loop for muted feeds | self-similar devices, a pure zoom | labels on the beat |
| 10 Hex-Flip | a trailer and a transition pack | hex wave, slabs, cube turn | base cut, two registry shaders |

## How a demo is made

Each demo has `prompt.md` (BRAND, FORMAT, BEATS, CAMERA, LOOK, CHECKS, after [MASTER-PROMPT.md](MASTER-PROMPT.md)), `scene.py` (Blender),
`build.mjs` (HyperFrames) and `rounds.md` (what was wrong, and the exact change).

```bash
bash kit/run.sh <id> stills 1,60,120   # half-size stills as a grid: look, fix in numbers, repeat
bash kit/run.sh <id> full              # or add <id> to out/queue.txt: kit/queue.sh renders one at a time
bash kit/run.sh <id> plate             # frames to the plate: bloom, vignette, a keyframe a second
bash kit/run.sh <id> hf                # writes the HyperFrames project in out/<id>/hf
bash kit/run.sh <id> check
bash kit/run.sh <id> render
bash kit/run.sh <id> final             # loudness, then the specs and privacy check
node kit/review.cjs                    # the review page with every demo, its prompt and its rounds
node kit/serve.cjs                     # serves it on 127.0.0.1 only
```

`tools/blender/rb.py` is the Blender side's small kit: Cycles on the GPU, the Standard view transform, footage as emission, the logo from the
pack's vector numbers, and a render loop whose frames each stand alone, so a killed render resumes and a bad range re-renders alone. It waits
while the GPU hold file exists or the host is short of memory. `kit/hf.mjs` is the HyperFrames side: one plain, editable `index.html` per demo.

`out/env.sh`, ignored by git, holds this machine's paths: `BLENDER`, `HF`, `HF_WIN`, `FX_MUSIC`, `AVATAR_GPU_HOLD`, `DENY`.

## Rules these demos keep

- **A real person's face never enters the renderer.** Their clip sits on top as its own video, cut out at most, moved and resampled only.
  It never passes through Blender, a denoiser, bloom or an upscaler. An edge of the cut-out that would show (the clip's sides lower down) is
  hidden by the frame or by a desk layer in front of it.
- **Existing footage only.** A segment the podcast showed full frame has no lip-synced clip: it is voice only, and the 3D takes the picture.
- **Machine names and overlay addresses are never readable:** the terminal clips here have their boxes burned in.
- **Every word on screen comes from the approved script, the real footage or the end card**, and every number from the brief.
- **A claim in the picture must survive what else is in the picture.** A fixed 119 on a gauge read as wrong under a live counter showing 133.

## What the rounds taught

- Bloom has to blend in RGB (`format=gbrp` first). A screen blend on YUV planes turned a whole plate magenta.
- A flat plane lying down must be rotated -90 degrees about X, or it faces down and the footage comes out mirrored.
- Lights stay out of glossy rays by default, or glass shows white blocks. Paint is the exception: it needs something to reflect.
- `hide_render` on an empty does not hide its children.
- An emission strength above 1 clips the channels and turns a colour white. To light a logo in its own colour, stay near 1 and let the bloom glow.
- Loudness: `loudnorm` will not lift a mix past its impacts' peaks; set the gain by measurement and catch the impacts with a limiter.
- Keep one render queue. Stopping a monitor does not stop the shell it started: run a long queue detached and watch its log.
- Look at full-size frames before calling a cut done. A contact sheet hid mesh lines showing through the logo's R and the gauge contradicting the counter.
- `hyperframes check --json` (0.8) keeps its findings inside each section (`layout`, `contrast`, ...). A summary that read only the top level
  printed 0 errors under `ok false`, and two real faults reached the review page: one numeral drawn over another, and a caption at 1.02:1
  contrast. `ok false` is a fault until a full-size frame says otherwise.
- A voice is measured, not heard. `node kit/voicebed.cjs <id>` rebuilds the HyperFrames mix as two stems, voice and bed (within 1 dB of
  a render in every 250 ms window, `--check`), and prints voice over bed in the speech band. In 02 the bed sat 14.8 dB over a line its
  speaker said he could not hear. `d.duck()` mixes music and effects into one bed that dips under every voice: a 20 dB median after.
- A design that reads in 3D can still not read: 03's rail of 120 slots was a row of teal tiles from above. A count and a proportion
  belong in flat graphics, with the 3D behind them.
- Where two words run together, Whisper's boundary can be 0.3 s off. Cut on the measured trough of the voice (01's pause, at -52.6 dB).
- Move things with transforms or SVG attributes, never CSS `left`/`top` (they snap to whole pixels), and never put a timed wrapper around
  timed videos: time it by opacity, as a tracked tile is. `hyperframes check` flags both.
- New invented faces come as stills first and move only once a person picks them (`kit/people.ts`).
