# The series prompt (every demo starts from this, then adds its own six blocks)

Make a short Roomler film from recordings that already exist. Claude writes code that draws every frame:
Blender 5 (Python, headless, Cycles on the GPU) makes the 3D plate, HyperFrames (HTML + GSAP, seeked frame by frame)
adds the type, the sound and the footage of people on top, ffmpeg finishes it. No AI video model draws anything new.

RULES
- Existing footage only: the podcast's lip-synced clips and voice, the published videos' real screen recordings.
  No new voice, no generated product UI.
- A real person's face never passes through the renderer, denoiser, bloom or an upscaler: their clip sits on top as
  its own <video> (at most cut out from its background and resampled). No label on the tiles; the end card discloses.
- Machine names and overlay addresses are never readable: use the boxed terminal cuts.
- Every word on screen comes from the approved script, the product's real footage, or the end card.
  Numbers only from videos/podcast-studio/brief.yaml. No em dashes, no slogans.
- The script's own jokes and analogies are the storyboard: what Goran says, the world builds.

LOOK (Roomler noir)
- Near-black set with a teal cast (#061412), black glossy glass, screens that glow, lights hidden from glossy rays.
- Standard view transform, so a recording keeps its own colours. Brand colours: teal #009688, #4db6ac, #80cbc4,
  coral #ef5350, amber #ffc107 (Helen's ring #f5b84a). The pack's logo is never redrawn or recoloured.
- Poppins for headlines, Inter 900 for captions.

CHECKS
- One timeline: voice times come from the narration's word timings; every 3D beat and every word of type lands on them.
- Half-size stills as a grid before any full render; exact fixes in numbers; re-render only what broke.
- Sound: every effect has a cause on screen, music under the voice, -14 LUFS, -1.5 dBTP.
- Privacy OCR (check.ts --deny) on the finished file.
