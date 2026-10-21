---
name: avatar-video
description: Make a product video with AI presenters beside a real screen recording using this repository (roomler-ai-avatar) - draft the two-host script from a brief, render and check the voices, plan the edit with Claude, render the talking clips, compose 9:16 and 16:9, and check the result. Use when asked to make, re-cut or re-voice an avatar or presenter video, add or change a presenter's face or voice, or debug any step of tools/avatar or tools/voice.
---

# Make an avatar video

The repository's docs are the reference: `docs/run.md` for every step and option, `docs/expectations.md`
for what to expect and every known trap, `docs/real-person.md` before any real person's face or voice.
This skill is the order of work and the judgement calls.

## 0 · Before anything renders

- Read the brief (`brief.yaml`): the product, and the claims with sources. If a claim has no source, ask
  for one or drop it. Every card on screen will cite one of these.
- Check the machine: `bash tools/avatar/setup.sh doctor` (prefix `wsl --` on Windows), and the host's
  available memory. A render needs headroom on the host, not only in WSL: with the host paging hard, a
  render once timed out the GPU and reset the machine. Under 16 GB available, find out why before
  starting; never start a render beside a big build.
- A real person's face or voice: only with their recorded consent, written into the presenter's
  `consent` field, and kept outside the repository (`docs/real-person.md`). Stop and ask if it is not
  there.

## 1 · The script, with the person

Draft it with them, from the brief: two hosts, one or two sentences a turn, the second host reacting.
Write for the ear ("56 frames a second", not "56fps"). Every claim in the script must be in the brief.
The presenters host and explain; they are never a customer, a user, or the person who owns the product
speaking in the first person. Read it out loud before rendering: a render costs GPU minutes, an edit
costs nothing.

## 2 · Voices: render, then listen with numbers

```bash
bun tools/voice/lines.ts render script.txt out/narration
bun tools/voice/pitch.ts out/narration
```

- A line `pitch.ts` flags (more than 4 semitones off its speaker, or over 5 words a second) gets
  re-rendered: `--only <n> --seed <another>`, and "." for "!" if it went up.
- A short line that sounds cut off: render it with a word after it, cut the take before that word, put
  it back with `--use`, and add `--pause n:1.3` after it.
- Then the person listens to the whole narration. Their ear is the gate; the numbers only catch the
  obvious.

## 3 · Audio and words

```bash
bun tools/voice/mix.ts out/narration [--music <licensed track> --music-start <s>]
bun tools/avatar/words.ts out/narration --out out/words.json
```

## 4 · The plan

```bash
bun tools/avatar/shots.ts init out/narration recording.mp4 --out out/shots.json
```

Edit `shots.json` with the person: where the recording changes subject, and what each part shows.

```bash
bun tools/avatar/storyboard.ts --brief brief.yaml --narration out/narration --shots out/shots.json --out out/storyboard.json
```

Read its notes, hooks and cover with the person. A refused plan prints the rules it broke: run it again,
or fix the shots. After a re-voice, `storyboard.ts retime` keeps an approved plan.

## 5 · Talking clips

```bash
bash tools/avatar/comfy-server.sh start
bun tools/avatar/talk.ts out/narration out/talk --dry      # what will render, reuse or hit the cache
bun tools/avatar/talk.ts out/narration out/talk
```

- Look at the first clip before the rest render (a contact sheet of every 22nd frame is enough): the
  identity holds, the background stays still, the mouth follows the words.
- Expect about one minute of GPU per second of video. Long queues: keep the machine awake, and stop the
  server when done (it holds the GPU).
- Re-voicing one presenter: `--reuse old/talk.json` keeps the other's clips. Several editions of one
  narration: one `--clips` folder.

## 6 · Compose, check, watch

```bash
bun tools/avatar/compose16.ts --talk out/talk/talk.json --screen recording.mp4 --mix out/narration/mix.wav --words out/words.json --storyboard out/storyboard.json --out out/video-16x9.mp4
bun tools/avatar/compose.ts   --talk out/talk/talk.json --screen recording.mp4 --mix out/narration/mix.wav --words out/words.json --storyboard out/storyboard.json --out out/video-9x16.mp4
bun tools/avatar/cover.ts --storyboard out/storyboard.json --out out/cover.png
bun tools/check.ts out/video-16x9.mp4 [--deny terms.txt]
```

- Look at frames from every turn: the bubble or tiles never cover what a card claims; captions sit clear
  of the presenters; the end card reads.
- A privacy hit: look at the frame before deciding. OCR misreads (a window's title-bar buttons once read
  as a city's name). Never weaken the check to make a hit go away; an allowed term is the person's call.
- The person approves the finished video before it goes anywhere, and the platforms' AI flags are set
  when it does.

## Never

- Generate product footage or UI: the recording is the proof.
- Remove or shrink the AI labels, or the "Real screen recording" chip.
- Commit a real person's portrait or voice sample, or a render with them in it.
- Show a silence-driven idle clip of a real person (`--listener still` is the default for a reason).
