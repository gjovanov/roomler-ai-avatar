---
name: avatar-video
description: Make a video with AI presenters using this repository (roomler-ai-avatar), in either of its formats - presenters beside a real screen recording (9:16 and 16:9), or a studio conversation like a podcast (a host interviews a guest on two framed cameras, demos full frame). Covers the brief and the script with the person, the presenters' faces and voices, the narration rendered and checked line by line, the edit plan, the talking and listening clips, the compose, the checks, the review rounds, and re-voicing a few lines without rendering the whole video again. Use whenever asked to make, re-cut, re-voice or fix an avatar, presenter or podcast video, to add or change a presenter's face or voice, or to debug any step of tools/avatar or tools/voice, even when the request does not say "avatar".
---

# Make an avatar video

The repository's docs are the reference: `docs/run.md` for every step and option, `docs/expectations.md`
for times and known traps, `docs/real-person.md` before any real person's face or voice. This skill is
the order of work and the judgement calls. It also carries the studio conversation format (its tools in
`tools/podcast/`, its details in [references/podcast.md](references/podcast.md)) and the lessons of its
pilot, `videos/podcast-studio`, which went through five editions (2026-10-26 to 10-28) before it was
published.

## Pick the format

| | Beside a recording | Studio conversation |
|---|---|---|
| The picture | the screen recording, with the speaker in a bubble (16:9), as two call tiles (9:16) or in a tutor panel | host left, guest right on two framed cameras over a blurred studio; the speaker live, the listener in a listening clip of their own; cards; demos full frame; a title and an end card over music |
| The plan | `shots.ts`, then `storyboard.ts` (Claude) | `plan.json`, written by hand: the speakers, the clip settings, and one beat for each turn that is not on the two cameras |
| The clips | `talk.ts` | `tools/podcast/chain.ts`: talking clips (`talk.ts`) and listening clips (`tools/podcast/listen.ts`), chained |
| The compose | `compose16.ts`, `compose.ts` | `tools/podcast/compose.ts`, then `tools/podcast/seams.ts` |
| Worked examples | `videos/wayland-asahi`, `videos/mesh-network` | `videos/podcast-studio` |

Most steps are shared; where the formats differ, the step says so.

## 0 · Before anything renders

- Read the brief (`brief.yaml`): the product, and the claims with sources. A claim without a source gets
  one or goes. Lines written for fun (a joke, a laugh, a reaction) go under `invented`, and what the
  video must not imply under `not_claimed`: the brief is the record of what the video says and why.
- A real person's face or voice: only with their recorded consent, written into the presenter's
  `consent` field. Their voice prompt stays outside the repository, always; their face too, unless their
  consent says it may be published (`docs/real-person.md`). Stop and ask if it is not there.
- Check the machine: `bash tools/avatar/setup.sh doctor` (prefix `wsl --` on Windows), and the host's
  available memory (section 7). Under 16 GB available, find out why first; never start a render beside a
  big build.

## 1 · The script, with the person

Draft it with them, from the brief. For one presenter demoing the product, use the
`demo-first-scriptwriter` skill: the proof on screen first, then the why, in blocks that each end on a
longer pause.

- One or two sentences a turn, and the other one reacts. A conversation sounds real when it has what
  people do in one: a short reaction, a laugh at a joke, a bridge to the next topic. The pilot's first
  edition had none, and its owner asked for it to be "not so robotic".
- Write for the ear: "fifty-six frames a second", "port four four three". A line that must land gets its
  own turn.
- A laugh needs words around it: VibeVoice answers a bare "Hahaha." with silence, while "Hahaha, nicely
  reframed." works.
- Mark every change of picture with a `#` line in the script (`# [The relay diagram.]`): the plan follows
  them. Every action a line mentions must be on screen: a line about a typo needs a typo in the recording.
- The presenters host and explain. They are never a customer or a user, and never the product's owner
  speaking in the first person unless it is the owner's own avatar, with their consent, saying only what
  they approved word for word. An invented host is nobody's likeness: asked for a look-alike of a real
  person, describe an original face instead (a look-alike reads as that person's endorsement), and say
  so in the presenter's note.
- Every claim is in the brief. Read the script out loud, and get the person's OK before any GPU work: an
  edit costs nothing, a render costs hours.

## 2 · The faces

- **An invented presenter:** `portrait.ts render <id> --seeds 31,32,33 [--wh 832x1248]`; the person
  picks. Crop the pick so its face is as large in its tile as the other presenter's (the pilot's host:
  seed 31 at 832x1248, cropped to 710x1065).
- **A real person in other clothes or another room:** `portrait.ts edit <id> --from photo.png
  --keep-framing --prompt "..."` (the registry entry needs `"real_person": true` and its `consent`
  first; `portrait.ts pick <id> <seed>` records the chosen one). The edit comes back with the face
  smoothed, so put the photo's original head back over it: a feathered ellipse cut at the chin, and for
  a new room intersected with a person mask, so the old room does not come back with the head. Never
  retouch a real person's face, however lightly: they see someone else.
- **A room taken from a reference image** (`--ref2 <image>`): Qwen copies a person's head out of image 2
  into the result. Make an empty plate first (an edit of the room shot that removes the person and
  whatever they hold), and pass the plate.
- In the registry: `ai_label`, `ring` (the tile's colour), `voice`, a calm `talk_prompt`, and `consent`
  for a real person.
- Show the person a still and a short test clip of a new face before the full render.

## 3 · The narration, line by line

```bash
bun tools/voice/lines.ts render script.txt out/narration --between 0.6 --pause 2:0.4,11:0.8 --min-heard 0 --no-ai-check
bun tools/voice/pitch.ts out/narration
```

- **Pauses.** 0.6 s at a hand-over sounds like a lively conversation; 0.35-0.5 s before a quick reaction
  or a laugh. Where the picture changes between two lines of one speaker (a camera line, then a demo),
  make that gap longer than the clips' `--group-gap` (1.2 s against 1.1), so they become separate clips.
- **Settle every pause before any clip renders.** A clip's cache key holds its segment's audio and its
  index: a changed pause changes the audio of the segments around it, one that crosses `--group-gap`
  regroups the lines and moves every later index, and in the studio chain every later clip continues
  from the changed ones.
- **The AI-writing check.** When the avoid-ai-writing detector is installed, `lines.ts` refuses a script
  it does not rate Clean. Run it on the draft if you want its view, and render the approved script with
  `--no-ai-check`, as the pilot did: an approved line is never rewritten to please a detector.
- **Numbers.** Whisper writes them as digits ("56, not 60"), so a line full of numbers fails `lines.ts`'s
  word check at 0%: render with `--min-heard 0` and read every line's transcript instead.
- **Takes.** `--only <n> --seed <s>` renders another take of a line; `--use <n>=<take.wav>` puts a chosen
  one in its place. A line that comes back silent ("no speech found": a bare laugh, a drawn-out "noooo")
  gets the next seed.

Then check every line, in this order. `tools/voice/qa-lines.ts` and `tools/voice/fix-lines.ts` do it by
measurement (give them the product's names Whisper misspells with `--fuzzy`; references/podcast.md):

1. **Whisper reads each line back:** the script's words in order (90% of them, 75% for a line of four
   words or fewer), the first two words heard (a garbled opening), no two words heard before the line's
   first word (a stray sound), not said twice (speech far longer than its words need), no stall over
   1.4 s. A flagged line gets other seeds.
2. **Then the voice itself, because Whisper fills in what the voice never said.** VibeVoice sometimes
   stops inside the last syllable ("What actually happ?", "I like that anal") and the end fade takes the
   rest, while Whisper still writes "happened". A take whose pitch track still runs in its last 100 ms,
   with its very end less than 40 dB under the speech, was cut off: take another. Keep a take within 3
   semitones of its speaker's median and at most 4 words a second (a shocked "Oh, noooo!" came back
   almost an octave up; `pitch.ts` flags 4 semitones and 5 words a second over the whole narration). A
   line that came out pitched up often settles with "." or "..." in place of "!".
3. **A short line renders better inside its exchange:** the line before, the line and the line after
   rendered as one take, then the line cut out at the pauses between speakers. Alone, "Oh, no!" came back
   as silence or noise half the time. For a line with no neighbour, render it with a word after it and
   cut before that word.
4. **`lines.ts --safe-end <n,...>` on a re-voiced line** ends it at the later of the speech detector and
   Whisper's last word: a soft ending ("-ogy", "-ened") sits under the detector's threshold. It is opt-in
   per line, so every other line stays byte-identical.
5. **The person listens to the whole narration.** Their ear is the gate; the numbers rank the takes and
   catch the obvious. Give them a listening copy of the lines that changed, and let them choose between
   wordings ("Oh, no..." at -2.3 semitones was the owner's pick of three, "natural shock without
   yelling").

**A take swapped into `lines/` is not in the narration yet.** `voice.wav`, `turns.json` and
`captions.srt` still hold the old one, and everything after reads them. Run `lines.ts render` again with
the same pauses and `--safe-end` on the swapped lines, but without `--only` for them (it would render
them again over the pick) and without an old `--use` list (it would copy the old takes back). Then run
`mix.ts` and `words.ts` again.

A voice a little deeper: `retune.ts` (run.md).

## 4 · Audio and words

```bash
bun tools/voice/mix.ts out/narration [--music <licensed track> --music-start <s>]
bun tools/avatar/words.ts out/narration --out out/narration/words.json
```

The studio format takes no music here: its composer lays the music under the title and the end card.

## 5 · The plan

**Beside a recording:**

```bash
bun tools/avatar/shots.ts init out/narration recording.mp4 --out out/shots.json
```

Edit `shots.json` with the person: where the recording changes subject, and what each part shows.

```bash
bun tools/avatar/storyboard.ts --brief brief.yaml --narration out/narration --shots out/shots.json --out out/storyboard.json
```

Read its notes, hooks and cover with the person, and check its notes against the recording (it plans
from your descriptions, and once assumed typos that were never typed). A plan that breaks a rule goes
back to Claude once by itself; one refused after that prints the rules it broke: run it again, or fix
the shots. After a re-voice, `storyboard.ts retime` keeps an approved plan.

**Studio conversation:** write `plan.json`'s settings first (the speakers, their faces, the clip
settings: references/podcast.md), get the segments with `bun tools/podcast/chain.ts plan.json --dry`
(`talk.ts --dry` with the plan's settings), then add the beats: one for each turn that shows cards or a
demo, with its visual, its chip and its privacy boxes. Place a beat by the words its line starts with
(`"line"`), not by turn number, so an inserted reaction never moves a demo onto the wrong line.

## 6 · The clips

```bash
bash tools/avatar/comfy-server.sh start
bun tools/avatar/talk.ts out/narration out/talk --dry      # what will render, reuse or hit the cache
bun tools/avatar/talk.ts out/narration out/talk
```

- Look at the first clip before the rest render (a contact sheet of every 22nd frame is enough): the
  identity holds, the background stays still, the mouth follows the words.
- **Name no gesture in a prompt.** InfiniteTalk applies its prompt again in every window of 81 frames, so
  a gesture it names comes back every few seconds (a listening clip touched its nose three times). Name
  only blinking, a slow nod and a smile; put the rest in `--negative-extra "touching face, touching nose,
  hand on face, looking to the side, ..."`.
- Expect about one minute of GPU per second of video at 640x640; the pilot's 512x768 clips took about
  50 s per second of video. Keep the machine awake through a long queue, and stop the server when done
  (it holds the GPU).
- Re-voicing one presenter: `--reuse old/talk.json` keeps the other's clips, but not together with
  `--group-gap` (`talk.ts` refuses it): then reuse clip by clip with `--alias`, or with the studio
  chain's `--alias-from` (section 9). Several editions of one narration: one `--clips` folder.
- One presenter who teaches with their hands: a waist-up portrait with the hands in it (`portrait.ts
  edit --wh 832x1248`), a talk prompt for a calm face and presentation gestures, and `talk.ts --size
  512x768 --group-gap 1.0 --audio-scale 0.9`, so each block is one continuous take. Plan with the same
  `storyboard.ts --group-gap 1.0`: one clip has one layout.
- **The studio format** renders its clips with `bun tools/podcast/chain.ts plan.json`: a talking clip
  for whoever speaks and a listening clip for the other one, each presenter's clips chained so that no
  cut jumps back to the portrait's pose (`--motion`, with the wrapper patch in `tools/avatar/patches/`):
  references/podcast.md. The chain starts ComfyUI itself, under the cap, and replaces one that is
  already running.

## 7 · The machine

A night of clips on a computer that also runs builds is where the pilot lost most of its time. What held
in the end:

- **Watch the host's available memory, not only the VM's.** `comfy.ts` interrupts a clip under 6 GB
  available (`AVATAR_MIN_FREE_MB`), because host paging once timed out the GPU and reset the machine:
  never lower it. Start a clip only with room to spare (the pilot waited for 20 GB, up to 45 minutes)
  rather than let the guard stop it: a clip that fails ends its presenter's chain (the next one starts
  from the portrait), a clip that waits does not.
- **ComfyUI runs under its memory cap, or not at all.** Uncapped, it once kept 26 GB of model files
  mapped and starved the host. `comfy-server.sh` caps it in a systemd user scope when the user manager
  answers, `degraded` included (one failed unit makes it so, and a ComfyUI scope the cap itself killed
  is such a unit: until 2026-10-28 that alone dropped the cap); it also clears its own failed scopes
  before it starts. `comfy-server.sh cap` says what `start` would do, and the start message says it
  again. With no user manager at all, start it as root inside a system scope:
  `tools/avatar/comfy-capped.sh <user> 24G <work dir>`. `tools/podcast/chain.ts` picks between the
  two by itself, and refuses to run uncapped unless given `--uncapped`.
- **Restart ComfyUI after every clip that rendered** (the chain does). The cap bounds the VM only.
  CUDA's pinned host memory and the GPU's spill into shared system memory sit on the Windows side, and
  PyTorch keeps them until the process exits (`/free` does not give them back). Over a chain they
  piled up to about 60 GB; stopping ComfyUI returned them at once.
- **Drop the VM's page cache** every 30 s while clips render and builds share the VM
  (`tools/avatar/dropcache-loop.sh` as root, which the chain runs under WSL): WSL kept 25 GB of cache
  and never gave it back by itself.
- **A GPU shared with other jobs:** `AVATAR_GPU_HOLD` names a file that the other job creates when it
  needs the GPU; the chain checks it between clips, stops ComfyUI while it exists, and waits.
- **A killed session can leave its renders running.** When Claude Code stops background tasks because
  the host is low on memory, their bun and python children live on: find them by command line before
  starting anything, and restart a stopped run only with the person's OK. `comfy-server.sh stop`
  through WSL can time out at the WSL service (`Wsl/Service/0x8007274c`): retry until ComfyUI stops
  answering.

## 8 · Compose, check, watch

**Beside a recording:**

```bash
bun tools/avatar/compose16.ts --talk out/talk/talk.json --screen recording.mp4 --mix out/narration/mix.wav --words out/narration/words.json --storyboard out/storyboard.json --out out/video-16x9.mp4
bun tools/avatar/compose.ts   --talk out/talk/talk.json --screen recording.mp4 --mix out/narration/mix.wav --words out/narration/words.json --storyboard out/storyboard.json --out out/video-9x16.mp4
bun tools/avatar/cover.ts --storyboard out/storyboard.json --out out/cover.png
```

For tall tutor clips, add `--layout tutor` to `compose16.ts`: the recording on the left, the presenter
in a tall panel on the right.

**Studio conversation:** `bun tools/podcast/compose.ts plan.json` (beside the video it also writes
`<out>.srt`, the captions for an upload; `--parts a-b` previews a few segments with their sound), then
`bun tools/podcast/seams.ts <video> plan.json` for the cuts (references/podcast.md).

**Both:**

```bash
bun tools/check.ts out/video.mp4 --deny terms.txt --json out/check.json
```

- Look at frames from every turn: the bubble or tiles never cover what a card claims; captions sit clear
  of the presenters; the end card reads.
- A machine's name, an address or anything private on screen gets a solid box, with a generic label in
  its place ("work laptop", "server").
- A privacy hit: look at the frame before deciding. OCR misreads (a window's title-bar buttons once read
  as a city's name). Never weaken the check to make a hit go away; an allowed term is the person's call.
- For review, give the person the full-quality file and a share copy: `bun tools/share.ts <video>` (720
  on the short side, two-pass under 28 MiB, into `share/` beside the video).
- Captions for an upload: the narration's `captions.srt`, shifted by any title before the narration (the
  studio composer writes them).

## 9 · Review rounds, and re-voicing a few lines

The pilot went through five editions: a more natural conversation, calmer listeners, invisible cuts,
and the person's own rewording of lines that sounded wrong. For each round:

- **Record it.** A `qa_v<n>` list in `brief.yaml` (the checks and their numbers, which takes changed and
  why, the person's own words), and a commit of the script and the brief.
- **A script edit is not a full re-render.** `lines.ts` normalises the loudness of the whole narration,
  so three new lines change every segment's audio, and with it every clip's cache key: seven hours of
  GPU for three lines. Instead:
  1. Copy the previous narration's `lines/` into the new narration folder, without the changed lines and
     their entries in `lines.json`: `lines.ts` renders only what is missing.
  2. Keep the timing after the change: let the pauses of segments that render again anyway absorb the
     new lengths, so the rest keeps its timing to the millisecond; or move everything after the change
     by a multiple of 0.1 s, a whole number of frames at 30 fps and of milliseconds.
  3. Reuse every clip whose turns, takes (byte-identical line files), frame count and start are
     unchanged: `talk.ts --alias <old clip>` for one segment, or `tools/podcast/chain.ts plan.json
     --alias-from <old talk dir>` (with `--plan-only` it prints what it will reuse and render, without
     touching the GPU). The pilot's last two editions rendered 26 of their 72 clips.
- **Show the change:** a before/after of the cut in question, a preview of a few segments with their
  sound, a listening copy of the re-voiced lines.

## 10 · Publishing

The person approves the finished video before it goes anywhere. Each platform's AI-content flag is set,
and the post's text says that a real person's avatar is an AI likeness made with their consent. In the
picture, `compose16.ts` and `compose.ts` label every presenter from the first frame (the README's
rules: the EU AI Act's Art. 50 asks for a visible label at first exposure). Leaving the labels out is
the person's own decision, never a default: the pilot's owner chose no labels on the tiles, with the end
card's "AI-generated hosts · real screen recordings" and the platforms' flags as the disclosure, and the
brief's `disclosure` records that choice.

## Never

- Generate product footage or UI: the recording is the proof.
- Remove or shrink the AI labels or the "Real screen recording" chip on your own initiative, or publish
  without a disclosure: dropping the labels is the person's decision, recorded in the brief (section 10).
- Commit a real person's voice sample, their portrait unless their consent says it may be published, or
  any render with them in it.
- Retouch a real person's face, however lightly.
- Show a silence-driven idle clip of a real person: InfiniteTalk driven by silent audio keeps the mouth
  busy (`--listener still` is the default for a reason). The studio format's listening clips use another
  input, the model's trained silence, and keep the mouth closed; use them once the person has seen one
  and agreed.
- Chain clips through `talk.ts --start`: the start image is the reference of every window, so each link
  made a generated frame the next reference, and by the 13th link the face was no longer the person's.
  Chain with `--motion`.
- Lower the host-memory guard to get a render through.
