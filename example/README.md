# The example

A 20-second video about Roomler, made from `script.txt` and `brief.yaml`, in both formats. It runs
every step of the pipeline, so it is also the check that a setup works. Run it from the repository's
root; on Windows, prefix the `bash` commands with `wsl --`. Everything it writes goes to `example/out/`.

## 0. A screen recording

Use your own: any recording of your product, starting when the narration starts. To try the pipeline
first, a 15-second test pattern will do; the last turn then falls after it and gets the end card.

```bash
mkdir -p example/out
ffmpeg -f lavfi -i "smptehdbars=size=1920x1080:rate=30" -t 15 -pix_fmt yuv420p example/out/screen.mp4
```

## 1. The voices

```bash
bun tools/voice/lines.ts render example/script.txt example/out/narration
bun tools/voice/pitch.ts example/out/narration
bun tools/voice/mix.ts example/out/narration
bun tools/avatar/words.ts example/out/narration --out example/out/words.json
```

About 1.5 minutes: VibeVoice renders the four lines (10-20 s each), Whisper checks each, the mix comes
out at -14 LUFS, and Whisper times the words turn by turn.

## 2. The plan

```bash
bun tools/avatar/shots.ts init example/out/narration example/out/screen.mp4 --out example/out/shots.json \
  --what "the remote desktop of a machine in another city, live in a browser tab"
bun tools/avatar/storyboard.ts --brief example/brief.yaml --narration example/out/narration \
  --shots example/out/shots.json --out example/out/storyboard.json
```

About 35 seconds: Claude returns a layout per turn, the cards, three hook variants and a cover, and the
plan passes the rule check.

## 3. The talking clips

```bash
bash tools/avatar/comfy-server.sh start
bun tools/avatar/talk.ts example/out/narration example/out/talk
bash tools/avatar/comfy-server.sh stop
```

Four clips, about 20 seconds of video in total.

## 4. Compose and check

```bash
bun tools/avatar/compose16.ts --talk example/out/talk/talk.json --screen example/out/screen.mp4 \
  --mix example/out/narration/mix.wav --words example/out/words.json \
  --storyboard example/out/storyboard.json --out example/out/example-16x9.mp4
bun tools/avatar/compose.ts --talk example/out/talk/talk.json --screen example/out/screen.mp4 \
  --mix example/out/narration/mix.wav --words example/out/words.json \
  --storyboard example/out/storyboard.json --out example/out/example-9x16.mp4
bun tools/avatar/cover.ts --storyboard example/out/storyboard.json --out example/out/cover.png
bun tools/check.ts example/out/example-16x9.mp4
bun tools/check.ts example/out/example-9x16.mp4
```

## What it took (measured, RTX 5090 Laptop GPU, Windows 11 + WSL2)

| Step | Time |
|---|---|
| Narration, 4 lines (VibeVoice + Whisper checks) | 82 s |
| Pitch, mix, word times (Whisper medium per turn) | 15 s |
| Plan (Claude Opus via Claude Code) | 34-37 s |
| Talking clips, 19.5 s of video | 18.3 min (54-61x real time) |
| Compose 16:9 / 9:16, cover | 6 s / 6 s / 1 s |
| Checks | specs and loudness pass (-13.9 LUFS, -2 dBTP) |

The outputs: `example-16x9.mp4`, `example-9x16.mp4` (19.5 s each) and `cover.png`.
