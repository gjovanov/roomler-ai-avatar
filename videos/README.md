# Videos made with it

The sources of real videos made with this toolkit, kept as worked examples: the script (`script.txt`,
the form `tools/voice/lines.ts` reads) and the brief (`brief.yaml`, every claim the video makes with its
source). The screen recordings, voices and renders are not here: media never enters the repository, and
each folder's `out/` is ignored.

| Folder | What it is | Presenter | Made with |
|---|---|---|---|
| [wayland-asahi](wayland-asahi/) | Roomler controlling a Wayland desktop on a Mac mini (Asahi Linux) from a browser tab, at 56 fps in software ([on YouTube](https://youtu.be/q1Fgc3nM3W4)) | Goran, as two AI avatars with his consent (`goran-r5-close`, `goran-mint-jacket-talk`, in a registry of his own: `AVATAR_PRESENTERS`), in his own cloned voice | the [demo-first-scriptwriter](../.claude/skills/demo-first-scriptwriter/SKILL.md) skill's draft, rewritten by him; `talk.ts --size 512x768 --group-gap 1.1 --audio-scale 0.9`; `compose16.ts --layout tutor` |
| [avatar-making-of](avatar-making-of/) | How these videos are made: the script, the voice, the face, the real screen recordings and the compose, with the mistakes that taught each rule ([on YouTube](https://youtu.be/eTX3KQ3Ogys)) | Goran, as the same two AI avatars, in his own cloned voice | a script written for him in the style of his own, plus his line; the same `talk.ts` and `compose16.ts` settings |

A voice that belongs to a real person is named in a script (`goran3`) but never stored here: the
renderer finds it in a private folder (`AVATAR_VOICES_DIR`, [docs/real-person.md](../docs/real-person.md)),
so these scripts render only on a machine that holds that voice with its owner's consent.
