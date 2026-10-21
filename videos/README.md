# Videos made with it

The sources of real videos made with this toolkit, kept as worked examples: the script (`script.txt`,
the form `tools/voice/lines.ts` reads) and the brief (`brief.yaml`, every claim the video makes with its
source). The screen recordings, voices and renders are not here: media never enters the repository, and
each folder's `out/` is ignored.

| Folder | What it is | Presenter | Made with |
|---|---|---|---|
| [wayland-asahi](wayland-asahi/) | Roomler controlling a Wayland desktop on a Mac mini (Asahi Linux) from a browser tab, at 56 fps in software | Goran, as an AI avatar with his consent (`goran-tutor`), in his own cloned voice | the [demo-first-scriptwriter](../.claude/skills/demo-first-scriptwriter/SKILL.md) skill; `talk.ts --size 512x768 --group-gap 1.0 --audio-scale 0.9`; `compose16.ts --layout tutor` |

A voice that belongs to a real person is named in a script (`goran3`) but never stored here: the
renderer finds it in a private folder (`AVATAR_VOICES_DIR`, [docs/real-person.md](../docs/real-person.md)),
so these scripts render only on a machine that holds that voice with its owner's consent.
