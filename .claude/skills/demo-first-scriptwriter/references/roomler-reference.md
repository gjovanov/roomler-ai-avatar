# Roomler voice reference

## Provenance and limits

Use this historical example from the user's approved conversation to calibrate
voice and structure. Treat it as a writing sample, not current product documentation
or an independent benchmark. Do not reuse its measurements, implementation details,
security rules, UI descriptions, or release timing without evidence for the new
brief. Do not assume this full example fits the default runtime budget.

Preserve these distinctions when adapting a Roomler brief:
- Treat 27 to 56 fps as the user's supplied earlier/current demo comparison, not a
  universal result or automatically a controlled benchmark of one scheduler change.
- Treat the scheduler explanation as specific to the described Linux setup. Keep
  any performance request qualified to encoding work; do not imply global maximum
  CPU clocks, hard affinity, or a general Linux bug without supporting evidence.
- Treat active, visible, unlocked-session capture and the Disconnect surface as
  behavior of the demonstrated configuration, not all Roomler or Wayland modes.
- Recheck open-source, licensing, self-hosting, and installation claims when needed.
  Do not claim that a browser-based viewer eliminates the host-side agent.

Use these user-supplied starting points only when verification is required:
https://roomler.ai/
https://github.com/gjovanov/roomler-ai
Read them through available tools before treating their contents as evidence.

## User-approved style sample

### Wayland. Mac mini. One browser tab.

*[Browser chrome visible. Drag a window across the desktop, then resize it.]*

**goran:**
Looks local, doesn't it?

That's a Mac mini running Linux and Wayland - and I'm controlling it from this
browser tab.

A big thank-you to the Asahi Linux team for the Linux-on-a-Mac part.

The remote control? That's Roomler. No separate viewer to install.

*[Keep moving windows. Bring the frame counter into view.]*

**goran:**
Watch the movement. Fifty-six frames per second in this demo. Every frame encoded
in software.

Last week, this setup managed twenty-seven.

Same Mac. More than twice the frame rate.

*[Add a brief overlay: "27 -> 56 FPS." Keep the desktop moving underneath.]*

**goran:**
The interesting part is why.

The encoder pauses between frames. Linux saw those pauses and decided it didn't
need much performance - so it put the work on an efficiency core at a lower clock.

Roomler now explicitly asks the scheduler for performance while encoding.

The CPU wasn't out of horsepower. It was in economy mode.

*[Open a text editor. Type a sentence, make a typo, and correct it.]*

**goran:**
But I don't spend my day admiring frame counters. Let's actually use it.

Open an editor. Type. Make a correction.

That feels local.

Unfortunately, so does my spelling. We haven't fixed that yet.

*[Show the sharing banner. Hover over Disconnect without clicking it yet.]*

**goran:**
And the person at the other end shouldn't have to guess whether someone's watching.

In this setup, Roomler only captures while that user's session is on screen and
unlocked.

The banner shows who's connected. The Disconnect button lets the person at the
machine end the session.

Remote access shouldn't mean giving up control.

*[Return to the full browser view. Continue using the desktop naturally.]*

**goran:**
That's Roomler: a Wayland desktop you can actually work with, right in your browser.

Open source. Self-hostable.

Try it on your own setup - or take a look under the hood. The project and GitHub
links are below.

Talk to you soon!
