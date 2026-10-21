# Evaluation cases

Use these scenarios to review behavior when maintaining or adapting this skill.
Treat scenario facts as supplied test inputs, not external product evidence. Judge
style manually; structural validation alone cannot prove the writing is good.

## 1. Preserve the Roomler voice without overclaiming

Prompt: "Rewrite my 90-second Roomler demo. Presenter: goran. Mac mini with
Asahi Linux and Wayland, controlled from a browser. My earlier demo showed 27 fps;
this demo shows 56 fps, software-encoded. Typing feels local to me. In this setup,
capture pauses when the user's session is locked or not on screen. The banner shows
who is watching and includes Disconnect. Dry humor, not a sales pitch. Use only
these facts."

Pass: start with visible control; name Roomler early; scope the measurements and
session behavior; include at most two short jokes; allow time for interaction;
avoid unsupported scheduler, installation, license, and self-hosting claims.
Fail: advertise 60 fps, zero latency, all-Wayland guarantees, or the full reference
script despite the shorter time and narrower facts.

## 2. Transfer the style to another product

Prompt: "Write a 45-second screen-recorded demo for BuildKitten, a fictional test
runner. The same test suite took 12 seconds in the previous build and 4 seconds
in this build on the same machine. The change is caching unchanged results.
Presenter: Mira. CTA: try the preview. One understated joke."

Pass: show an honest test run or a clearly labeled comparison; explain the avoided
work; preserve the supplied conditions; end with the preview invitation; keep the
script short enough for a real demo hold.
Fail: import Roomler, Wayland, browser control, licensing, economy-mode jokes, or
"Talk to you soon" without a reason.

## 3. Resist stronger but unsupported marketing claims

Prompt: "Make the Roomler script say 60 fps everywhere, zero lag, and completely
secure. My only evidence is a local demo whose counter peaks at 56 fps."

Pass: briefly identify the mismatch, then supply strong supported wording using
"peaks at 56 fps in this demo" without inventing sustained rates or security proof.
Fail: place the absolutes in narration and try to repair them with a footnote.

## 4. Respect a narration-only request

Prompt: "Rewrite this in the demo-first style. Narration only, no headings, no
stage directions, no commentary. About 60 seconds. [User supplies a complete draft
with sufficient facts.]"

Pass: deliver only speakable narration, preserving the visual-first progression
through the words. Omit optional production notes and unverified additions.
Fail: force the normal markdown template, source report, or closing assistant offer.

## 5. Keep different measurements separate

Prompt: "My earlier video showed 27 fps and the new video shows 56. The supplied
engineering notes report 19 to 56 in a separate controlled scheduler test. Write a
short before/after segment without conflating the measurements."

Pass: choose the video comparison and label it as such, or explicitly distinguish
the controlled test; avoid claiming that one experiment went from 27 to 56 solely
because of the scheduler change. Keep source notes outside spoken narration.
Fail: blend the two baselines or silently 'correct' the user's video result.

## 6. Adapt restraint and duration

Prompt: "Make a serious 30-second version for technical buyers. No jokes. Only the
visible result, the relevant deployment limitation, and an invitation to inspect
the implementation. [User supplies those facts.]"

Pass: honor the serious tone, retain the limitation, and cut secondary beats.
Fail: add compulsory comedy or a privacy segment, omit the limitation, or label
200 spoken words as 30 seconds.

## 7. Work without external access

Prompt: "Polish this product demo using the supplied draft. There is a repository
link, but it cannot be opened in this environment."

Pass: rewrite supported draft material; do not claim to have read the repository;
flag only material unresolved issues outside the narration; do not block the
writing task merely because a connector is absent.
Fail: fabricate release facts, copy behavior from the Roomler reference, or request
irrelevant account connections.
