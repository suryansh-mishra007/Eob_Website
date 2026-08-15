# Slime Mold Algorithm — Project Notes / Recovery Doc

Last updated: 2026-08-16

## 2026-08-16 — Added top-level tabs: Model / Presentation / Team

Per direct request ("sir liked it but we gotta add our pictures and info
about the project and our ppt inside the website, make multiple tabs 1 for
model, 1 for ppt and 1 for about the team section"). The single-page site
(Model demo + About section) is now wrapped as the **Model** tab, with two
new tabs added alongside it. **Not committed/pushed** — sitting as local
uncommitted changes per the standing workflow (see below), waiting for the
user to review at `localhost:8765` and say go.

**New tab shell**: `.top-tabs` button row added to `.site-header` (the site
previously had zero nav — this is the first real navigation it's had since
the THIRD PIVOT). Existing `app-section`+`about-section` wrapped in
`#panelModel`; two new sibling `.tab-panel` divs (`#panelPresentation`,
`#panelTeam`), toggled by new `site-tabs.js` (`.hidden` class, `display:
none`) — modeled on the archived `archive_tabs_maze_network/tabs.js`'s
"don't pause the hidden tab's own script" philosophy, though this version
has no per-tab simulation to keep alive on the two new tabs, so it's
simpler (no `ResizeObserver` handling needed).

**Presentation tab**: renders the team's real slide deck
(`D:\Slime_Mould_Deck copy - full algorithm comparison.pptx`, 41 slides) as
a 40-slide image viewer (`presentation.js` + `images/slides/slide-02.jpg`
… `slide-41.jpg`, 1280×720 each, ~6MB total). Slide 1 (a video-intro
placeholder slide with no static content) is excluded — see "How the
slides were rendered" below for why. Prev/next buttons, left/right arrow
keys (ignored while an `<input>`/`<textarea>` has focus, and while this tab
isn't visible), a clickable horizontal thumbnail strip, and a "Download the
full deck (.pptx)" link to `downloads/Slime-Mould-Optimization.pptx` (a
copy of the original file, ~5MB). Numbering: internally 0-indexed
(`current`), mapped to real slide numbers via `FIRST_SLIDE_NUM = 2`.

**How the slides were rendered to images (useful if this ever needs
re-running for an updated deck)**: this machine has **no LibreOffice**
installed, and the `pptx` skill's `soffice.py` wrapper doesn't work on
Windows anyway (`AttributeError: module 'socket' has no attribute
'AF_UNIX'` — that wrapper assumes a Unix socket shim). **What worked**:
Microsoft 365 (PowerPoint) *is* installed, but the obvious COM approach —
`Presentation.Slides.Item(i).Export(path, "JPG", w, h)`, even with
`Application.Visible = true` — produced garbage (a black rectangle top-left
on flat gray, every single slide) **in this sandboxed/no-real-display
environment**, regardless of visibility. **What actually rendered
correctly**: `Presentation.SaveAs(folderPath, 17)` (`ppSaveAsJPG = 17`),
which exports every slide as `Slide1.JPG`, `Slide2.JPG`, … in one call via
a different internal PowerPoint code path than `Slide.Export`. Verified
directly by opening several output images (not just checking file sizes) —
real photos, real text, correct layout, matching the deck's own dark/
lime-green/orange theme. If `Slide.Export` is ever tried again on this
machine, don't trust file size alone as a correctness signal — the broken
black/gray output was still a plausible-looking non-zero JPG.

**Team tab**: 4 cards (name + roll number: Vinayak Mangal C-304, Suryansh
Mishra C-315, Krishna Mistry C-318, Soha Nanal C-326 — sourced from the
deck's own title/closing slides, not invented), each with a colored
initials-circle placeholder avatar (no bios/roles shown — none were
supplied, and none were invented). **Real team photos are still
outstanding**: the user pasted two photos of the team in front of a
presentation screen directly into chat, but this environment has no
filesystem access to inline-pasted/vision-only image attachments — Read/
Glob/Bash all confirmed nothing was written to disk from them (checked
`scratchpad`, `Downloads`, `Desktop`, `Pictures`, and a broad recent-file
sweep of the user profile — see below). A placeholder block
(`#teamPhotoSlot`, dashed border, "ask Claude to add them") sits below the
card grid as a visible reminder. **If a future session is asked to finish
this**: ask the user for an actual file path (or have them drop the
photo(s) directly into `EOB_Website/images/team/`), don't assume a repeat
of the same paste-into-chat approach will work.

**Workflow note, followed this round**: per the standing instruction
higher up in this file, nothing was committed or pushed — this is sitting
as an uncommitted local change (`git status` will show `index.html`,
`style.css` modified; `site-tabs.js`, `presentation.js`, `images/`,
`downloads/` untracked) until the user reviews and explicitly says to
commit.

This file exists so that if this conversation/session is ever lost, a fresh
Claude Code session (or a human) can read this and understand exactly what
has been built, why, and what's left. Working directory for the actual site
files is:

```
C:\Users\gangs\OneDrive\Pictures\Documents\EOB_Website
```

**Site is renamed.** It was called "EOB" / "Elements of Biology" (the school
subject this was made for) through 2026-08-08. As of 2026-08-12 every
user-visible "EOB"/"Elements of Biology" string is gone, replaced with
"Slime Mold Algorithm" (title, header brand, footer, intro wordmark). If you
find "EOB" anywhere in the live site again, that's a regression, not a
leftover to leave alone.

**Site is live**, hosted on Vercel, deployed from a GitHub repo:
- Live URL: `https://eob-website.vercel.app/` (URL itself still says "eob" —
  that's just the Vercel project's slug from before the rename, cosmetic,
  not worth the churn of renaming the project to fix).
- GitHub repo: `https://github.com/suryansh-mishra007/Eob_Website` (`main`
  branch, that's the only branch).
- Local folder above is a real git repo now (`git init` was run 2026-08-11),
  with `origin` pointing at that GitHub repo. Deploys are git-triggered:
  Vercel is connected to the repo, so `git push` to `main` auto-redeploys in
  well under a minute. `vercel.json` (`buildCommand`/`installCommand: ""`,
  `outputDirectory: "."`) tells Vercel this is a zero-build static site —
  don't remove it or Vercel may try to detect a framework and get it wrong.
- **Workflow going forward, per explicit user instruction**: make edits
  locally, let the user review/test at `http://localhost:8765` first
  (`.claude/launch.json` in this folder has that preview config already),
  and only `git add`/`commit`/`push` when the user explicitly says to commit
  — don't push proactively just because a fix looks done.
- One real incident: mid-session the live URL started 404ing with
  `X-Vercel-Error: DEPLOYMENT_NOT_FOUND` — the production deployment pointer
  broke on Vercel's side for no code-related reason (confirmed: no new
  commits existed at the time). It self-resolved the moment a new commit was
  pushed and Vercel cut a fresh deployment. If this happens again, a push is
  the first thing to try before assuming a real bug.
- Git identity for commits in this repo: `suryansh-mishra007` /
  `mishrasuryansh690@gmail.com` (set locally via `git config user.name`/
  `user.email` in this folder, not global — Claude is not able to run
  `git config` itself per its own safety rules, so if this ever needs
  resetting on a fresh machine, the human has to run those two commands,
  not the assistant).

## 2026-08-11/12 — THIRD PIVOT (never documented until now): back to the Mumbai point-to-point map

**This above all: the "SECOND PIVOT" entry below, and everything under it
about `maze.js`/`network-builder.js`/tabs/Maze Solver/Network Builder, is
now history too.** Sometime around 2026-08-09 (before this note was ever
written — discovered mid-session by noticing `archive_tabs_maze_network/`
existed with an Aug-9 timestamp, one day *after* this doc's previous
"current state," and reading actual file contents rather than trusting this
doc) the site was reverted a third time, back to the **original Mumbai
point-to-point address-to-address map** — the very first version, from
before the "SECOND PIVOT" entry below ever happened. Nobody had updated this
file when that happened, which is exactly the kind of drift this file exists
to prevent — if you're reading this file to understand "current state,"
always spot-check it against what's actually in `index.html`/`app.js`
before trusting it, the same way this correction was found.

**Current live site**: single page, no tabs. Search-by-address (Nominatim
geocoding) or click-the-map to drop a start and end point on real Mumbai
streets, then watch a tendril-growth heuristic find a route between them.
- `app.js` — the whole point-to-point mechanic, extensively rewritten this
  session (see below). Original comment block at the top of the file still
  says "reconstructed from PROJECT_NOTES.md's description... no source code
  survived" — that's accurate history (the pre-pivot version's source was
  lost, this is a rebuild from screenshots/memory, explicitly a hand-built
  heuristic, NOT the real Tero/Nakagaki PhysarumSolver equations).
- `physarum-solver.js` — unchanged, still only used for its graph-loading/
  cropping helper functions (`buildFullGraph`, `nearestNode`,
  `connectedComponentMasked`, `subgraphFromMask`, `haversineMeters`), not
  for `PhysarumSolver` itself.
- `archive_mumbai_map/` — the OLD point-to-point implementation from the
  very first pivot era (superseded by the current `app.js`, kept for
  reference/rollback, not wired into `index.html`).
- `archive_tabs_maze_network/` — the SECOND pivot's Maze Solver / Network
  Builder tabs implementation (`maze.js`, `network-builder.js`, `tabs.js`,
  `growth-fx.js`, its own `index.html`/`style.css`). Also not wired in.
  If a future session is asked to revive either archived version, both
  folders are complete/self-contained, just missing from the live
  `index.html`'s script tags and needing Leaflet re-added if it's the maze
  version (current `index.html` already has Leaflet for the map version).

## 2026-08-11/12 — This session's rebuild of the tendril-growth mechanic (many rounds)

Several back-to-back rounds fixing real bugs and re-tuning the heuristic in
`app.js`. Condensed by topic rather than blow-by-blow; see git log
(`a9b5696`, `e361602`, `65d4deb`, `ba7566d` at time of writing) for exact
diffs.

**Color**: site-wide green (`--green`/`--green-ink` in `style.css`, plus the
canvas's tendril/start-point colors in `app.js`) changed from the old
saturated `#39d15e` to a lighter `#6fe38a`/`#4cc96c` pair, per direct
request ("make the green light green").

**Retraction animation — two real bugs found and fixed**:
1. Root/tip/depth metadata for each grown edge (`edgeFromNode`/
   `edgeToNode`/`edgeDepth`, used to animate losing tendrils visibly
   shrinking back toward the source rather than just fading in place) was
   being **overwritten on every crossing**, not just the first. Since a
   staggered retraction wave depends on that depth value staying accurate,
   this scrambled the ordering and made losing tendrils look like they were
   randomly fading rather than sweeping back to the host in order. Fixed by
   making `markEdgeGrown()` write those three fields once only
   (`if (edgeGrownBy[e] !== -1) return;` guard) — same write-once pattern
   `edgeGrownBy` itself already used.
2. Retraction pacing (`PRUNE_SECONDS`, `RETRACT_WINDOW_FRAC`) was tuned up
   over several rounds (2.4s → all the way through several intermediate
   values) as part of the broader "make it slower, let people actually see
   it" ask below — see current constants in `app.js` for the settled values.

**Growth speed — one real, dumb bug**: the step-accumulator math added a
fixed amount **once per rendered frame** instead of scaling by real elapsed
time. At ~60fps that meant growth actually ran roughly **60x faster** than
its own `STEPS_PER_SECOND` constant claimed — the literal reason growth used
to look instant/frantic no matter what the "speed" slider said. Fixed by
scaling by `dtSeconds` in `advance()`. Comment in `app.js` right above that
line documents this so nobody reintroduces it.

**Performance — dead tendrils accumulating forever**: `tips` (the array of
growth agents) only ever grew, never shrank, even for tendrils that died
minutes of simulated time ago — every step re-scanned all of them. Fixed
with periodic compaction (`tips = tips.filter(t => t.alive)` every
`TIP_COMPACT_INTERVAL` steps) plus an incrementally-maintained
`aliveTipCount` instead of re-deriving it via `.filter().length` on every
branch-cap check. Also: per-tip `path` arrays (copied on every single-hop
move AND on every branch, `O(path length)` each time) were removed entirely
— the winning route is always recomputed fresh via exact Dijkstra anyway
(see below), so no tip ever actually needed to carry its own path history.

**"Does the growth actually reach the goal, spread out, and look alive" —
went through several designs before landing on the current one**:
- Round 1: raised `GOAL_BIAS`, `MAX_ACTIVE_TIPS`, branch chance. Still
  clustered near the source on routes running along one arterial road with
  few real side-junctions (branching can only happen where a real
  alternative road exists — no amount of tuning "branch chance" fixes a
  corridor that structurally doesn't have one).
- Round 2: tried spawning K=5 deterministic "guide routes" (real Dijkstra +
  edge-penalty-based diverse alternates, see git history for
  `computeDiverseRoutes`/`GUIDE_ROUTE_COUNT` if ever wanted again) racing to
  the goal, with organic branching as pure background texture. Worked, but
  didn't match reference recordings of the pre-pivot original (screen
  recordings the user supplied showed 20-40+ tendrils organically reaching
  the goal over a long, patient run, not a small fixed number racing).
- **Current/final design**: no deterministic guide routes. `GOAL_BIAS`
  raised substantially (to 3.5) so the organic random walk itself reliably
  reaches the goal repeatedly on its own, combined with letting growth run
  until `ROUTES_FOUND_TARGET` (25) tendrils have independently reached the
  goal — NOT a fixed time window — so the mesh has time to actually spread
  across the whole corridor instead of stalling near the source.
  `MAX_GROWTH_STEPS` is purely a safety ceiling. Branching at junctions
  rolls **independently per spare direction** (not one shared coin-flip per
  junction visit) so a real multi-way junction fans out properly. A single
  reactive "homing" tip (Dijkstra-guided, hop-compressed to always finish
  within budget) is the only guaranteed element, spawned only if the
  organic walk is genuinely failing to reach the goal at all — a safety net
  for a pathologically narrow corridor, not the normal path. `CROP_PAD_*`
  constants were also widened (0.55/0.16 → 1.1/0.32) so the cropped
  subgraph itself has real lateral street width to grow into, not just the
  direct line between the two points.

**Correctness — the winning route is always exact, not heuristic-chosen**:
`beginPrune()` always calls a real Dijkstra shortest-path search
(`dijkstraShortestPath()`, exact segment lengths) for the solidifying
route, regardless of what the random tendrils/homing tip happened to find.
The growth animation is explicitly cosmetic; the answer shown is provably
correct if anyone cross-checks it against a real routing engine. Top-of-file
comment in `app.js` documents this split (visual heuristic vs. authoritative
answer) — don't blur it if asked to touch the growth mechanic again.

**If touching the growth mechanic again**: read the top-of-file comment
block in `app.js` first, it's kept up to date with the current
constants/mechanic (unlike this doc, which only gets updated when
explicitly asked). Constants worth knowing the *names* of even if not the
current values: `GOAL_BIAS`, `BRANCH_CHANCE_MAX`, `MAX_ACTIVE_TIPS`,
`ROUTES_FOUND_TARGET`, `MAX_GROWTH_STEPS`, `STEPS_PER_SECOND`,
`HOMING_TRIGGER_FRACTION`, `PRUNE_SECONDS`, `RETRACT_WINDOW_FRAC`,
`CROP_PAD_KM_MIN`/`CROP_PAD_FRACTION`.

## 2026-08-12 — Real bugs found in the address search bar (not the growth mechanic)

User reported the search dropdown "isn't working" / "people can't see it and
choose an address." Investigated properly in devtools (per explicit
instruction not to guess blindly) before touching CSS — two real,
independent bugs, neither was a Leaflet control or map-canvas content
issue as first suspected:

1. **Z-index stacking**: `.suggestions` had `z-index: 20` while `#mapCanvas`
   has `z-index: 1000` (Leaflet's own internal panes go up to `1000` too,
   confirmed by walking every element under `#leafletMap`). `.address-row`
   and `.map-root` are siblings with nothing isolating their stacking, and
   the dropdown (up to 240px tall) genuinely extends down into where the
   map begins — so the map was painting on top of the dropdown wherever
   they overlapped. It was still technically clickable underneath
   (`#mapCanvas` has `pointer-events: none`), which is exactly why this was
   an *invisible* bug rather than an obviously-broken one — clicking blindly
   in the right spot would have worked. Fixed: `.suggestions` raised to
   `z-index: 2000`. Verified by temporarily forcing `pointer-events: auto`
   on the canvas to get a true (not hit-test-skipped) stacking comparison.
2. **Seam/gap**: `.suggestions` sat at `top: calc(100% + 4px)`, a deliberate
   4px gap below the input — but `.address-field` (the shared wrapper) has
   no explicit height beyond the input itself, since the dropdown is
   `position: absolute` and doesn't expand its parent's box. Nothing in the
   input/dropdown's own dark color could ever paint that 4px strip, so it
   exposed `.canvas-wrap`'s lighter card background bleeding through as a
   stray seam. Fixed: gap removed entirely (`top: 100%`, flush against the
   input), doubled border removed, corner rounding adjusted so it reads as
   one continuous surface.
3. Also added, per follow-up request, extra breathing room between the
   search row and the map itself (`.address-row`'s `margin-bottom`: 10px →
   80px) — separate from the z-index/seam fixes, purely visual spacing.

**Also found and fixed while investigating** (not what was reported, found
by testing thoroughly rather than assuming the report was the whole story):
- A real race condition in `attachAddressSearch()` (`app.js`): if a Nominatim
  response was slow (confirmed directly — it can genuinely take 1-2+
  seconds) and the user kept typing, an older request could resolve *after*
  a newer one and silently overwrite the current, correct results with
  stale ones. Fixed with a `requestId` sequence guard — a resolved fetch
  checks it's still the latest before touching the DOM.
- No loading feedback at all while a request was in flight — a
  slow-but-working search looked identical to a broken one for that whole
  stretch. Added a "Searching…" state shown immediately when the debounce
  fires.
- A failed fetch (network error, Nominatim rate-limiting) was silently
  shown as "No matches" — indistinguishable from a real empty result. Now
  shows "Search failed — check your connection and try again" instead.

**Nominatim reliability note for future sessions**: this site calls
`nominatim.openstreetmap.org` directly from client-side JS, with no backend
proxy. Nominatim's usage policy is strict about volume from a single
origin/IP, and heavy testing (by an assistant or a user) against the same
domain in one session can plausibly cause real, temporary slowdowns or rate
limiting that look like "the search is broken" but aren't a code bug. If a
report can't be reproduced after real devtools investigation, this is a
likely explanation — don't assume the code must be broken just because a
user says search "isn't working."

## 2026-08-12 — Netflix-style intro sequence added, adapted from Slime-Mould-Deck

Per explicit request ("add this as intro we made it together... you can
copy code from there"), the intro sequence from
`C:\Users\gangs\OneDrive\Pictures\Documents\ppt\Slime-Mould-Deck\index.html`
(a separate, unrelated project — a slide deck about the Slime Mould
Algorithm) was ported over: veins grow in via SVG path animation, a core
flash pops, a wordmark reveals, all CSS-keyframe-driven (**not** a literal
`<video>` embed, despite files named `Slime_Mould_Netflix_Intro.mp4`
floating around in the *other* project — those are recordings/exports of
the CSS animation for other uses, not something this site plays directly).

New files: `intro.js` (self-contained, no dependency on
Leaflet/PhysarumGraph/app.js, safe to load before them), plus intro CSS
appended to the end of `style.css`, plus `assets/intro-chime.mp3` (copied
from the deck's own `assets/` folder) and markup at the very top of
`<body>` in `index.html`. Recolored to this site's own green/amber palette
(`--green`/`--green-ink` instead of the deck's `--acid`/`--moss`) and using
the site's existing fonts (Space Grotesk/JetBrains Mono) instead of pulling
in the deck's serif display font. Wordmark reads "SLIME MOLD ALGORITHM" /
"GROWING ROUTES ACROSS REAL STREETS" — was briefly "ELEMENTS OF BIOLOGY"
during the rebrand, corrected per explicit follow-up ("keep slime mold
algorithm" — the algorithm's the point, not the "biology" framing).

**Real robustness bug found and fixed vs. the source deck's own version**:
in the deck's original, the click/keydown "skip" listeners were only
attached *after* the animation actually started — which meant if
`document.visibilityState` never resolved to `'visible'` (background tabs,
some automation contexts, in principle any browser edge case), the overlay
could show a plain black screen with genuinely no way to dismiss it. Fixed
here by wiring the skip controls (overlay click, keydown, the dedicated
`#introSkip` button — which the source deck's CSS defined but never
actually rendered an element for) immediately and unconditionally, so the
overlay is always dismissible from the instant it appears regardless of
whether the animation itself ever gets to play.

**Two real audio bugs, both found by testing rather than assumed**:
1. The chime never played at all. Root cause: the intro auto-plays on page
   load with no user gesture yet, so the browser's autoplay policy blocks
   the first `chime.play()` attempt every time (this is guaranteed, not
   occasional) — and the code's own comment claimed "will retry once a real
   gesture unlocks it" but no code actually did that. Fixed with a real
   `chimeNeedsRetry` flag, consumed on the user's first real gesture.
2. Once (1) was fixed, a *second*, subtler bug surfaced: the gesture-unlock
   listener is on `document` with `capture: true` (needed to catch a
   gesture anywhere on the page), which means for a click on the skip
   button specifically, it fires *before* that button's own bubble-phase
   `finish()` handler — even though it's the same click. So clicking skip
   as your very first interaction would start the chime retrying right as
   the intro faded out, meaning it finished playing audibly *after* the
   visual was already gone — reported directly as "the audio and intro
   video aren't in sync... audio plays after the video finishes." Fixed by
   deferring the retry decision one tick (`setTimeout(fn, 0)`) so it
   correctly sees whether `finished` got set by that same click before
   deciding whether to play. Also guarded the "prime" (muted play/pause)
   path against interrupting an already-legitimately-playing chime.
   Verified directly both ways: forced a simulated blocked-autoplay state,
   confirmed a skip-click as the first gesture leaves the chime silent
   (correct — no more late/out-of-sync playback), and confirmed a normal
   non-skip gesture while the intro is still showing still plays it fine.

**If touching the intro again**: the automation environment used for
testing this site (Claude Code's browser tool) reports
`document.visibilityState === 'hidden'` for backgrounded tabs and doesn't
enforce browser autoplay-blocking the way a real browser does — meaning
`chime.play()` can succeed immediately in that harness even with no
gesture, which is *not* representative of real user conditions. Don't trust
"it played" in that harness as proof the retry logic works; verify the
actual state machine (`chimeNeedsRetry`/`finished`/`audioUnlocked`) via a
temporary debug hook instead, the way this round did, and remove the hook
before finishing.

## 2026-08-12 — Rebrand, new content section, humanized copy

- Removed "EOB"/"Elements of Biology" from every user-visible string (page
  title, header brand, footer, intro wordmark) — see top of this file for
  the full rebrand note.
- Added a new "How it works" section to `index.html` (between the live demo
  and the footer, `.about-section` in `style.css`) covering what
  *Physarum polycephalum* actually is, the three behavioral rules the
  growth heuristic mimics, and the 2010 Tokyo rail experiment with real
  comparison numbers (1.75x vs 1.80x cost, 0.85 efficiency both ways).
  Written fresh for this site, not copied verbatim from the reference
  slide deck (`Slime_Mould_Deck copy.pptx` in Downloads) — that deck was
  used for facts/reference only, and slide 39 specifically was excluded
  per explicit instruction.
- Removed the idle placeholder text under the map ("Search an address, or
  click the map, to drop a start point.") entirely — that element
  (`#canvasHint`) still lights up with real status during growth/pruning/
  errors (that's `app.js` writing to it live), it just stays blank at idle
  now instead of showing static instructional copy.
- Passed over the `app.js` status/error strings (the "Growing outward...",
  "Connected — this is the verified shortest route...", coverage-error, and
  no-route-found messages) to sound more like a person wrote them and less
  like a spec sheet — see current strings in `app.js` for the actual
  wording, this doc won't try to keep a duplicate copy in sync.

## 2026-08-08 (latest) — two-stage growth: slowed way down, added the undifferentiated-sheet stage

**User feedback that triggered this round**: supplied the actual Tero et al.
2010 A-F time-lapse figure and pointed out our growth animation was wrong in
two ways: (1) far too fast — a full grow-to-settle cycle finished in under a
second, nothing like the hours-long staged real process; (2) missing an
entire stage — real Physarum spreads first as a diffuse, translucent,
undifferentiated protoplasmic *sheet* (the figure's 5-8hr panels B/C) and
only later resolves into distinct thin veins (11-26hr, panels D-F). Our
demo skipped straight to rendering distinct tube lines growing outward,
never showing the sheet stage at all.

**Fix 1 — actually slow, in both `maze.js` and `network-builder.js`, no
`PhysarumSolver` changes**:
- `GROWTH_BASE_FRAMES`: 220 -> 780 (3.5x, per the "3-4x" ask).
- `GROWTH_RAMP_FRAMES`: 14 -> 50 (scaled proportionally, so individual-tube
  thickening stays the same fraction of the overall sweep).
- **Relaxation itself was the bigger problem and wasn't addressed by the
  growth-phase numbers alone.** It used to run `stepsPerFrame()` (1-6) full
  Euler+CG solves in a single rendered frame, so however many iterations it
  actually took (usually under 300), it visually finished in well under a
  second regardless. Rewrote `advance()` to throttle to **at most one real
  Euler step every `relaxFramesPerStep()` rendered frames**
  (`RELAX_FRAMES_PER_STEP_BASE = 10`, i.e. ~6 steps/sec at speed=1, scaling
  down toward ~30-60/sec at speed=6 — still visibly paced, never instant).
  This removed the old `FRAME_BUDGET_MS`-gated multi-step-per-frame inner
  loop entirely; that constant is gone from both files.
  Measured result: maze settles in ~82 iterations -> ~14-15s total cycle at
  default speed=2; Network Builder (5 terminals) settles in ~299 iterations
  -> ~30s+ total (longer full cycle is expected and fine for the more
  complex multi-terminal case — the ask was "at least 15-20s," not a cap).

**Fix 2 — the undifferentiated-sheet stage, new in both demo files**:
- New `drawSheetWash(e, opacityMul)`: draws each activated edge as a very
  wide (`cellSize * 0.85`), very-low-alpha (`SHEET_WASH_ALPHA` ~0.05-0.055)
  stroke along its existing root->tip line (reusing the `reach`/
  `edgeRootNode`/`edgeTipNode` state the growth-front feature already
  tracks — no new per-edge state needed). Individually near-invisible, but
  since every node has several neighbors, overlapping wash strokes
  accumulate into a soft, textured, translucent fill rather than crisp
  separate lines — approximates the real diffuse-sheet look without actual
  noise/pixel-level rendering.
- New `sheetOpacity` (0-1), eased in `updateVisuals()` toward 1 while
  `phase === 'exploring'` and toward 0 otherwise, at `SHEET_FADE_K = 0.02`
  per frame (~2.5s either direction) — this is what makes the sheet
  *visibly consolidate* into the thin veins once relaxation starts, rather
  than an instant swap. `draw()` renders the wash layer first (when
  `sheetOpacity > 0.004`), then the existing thin-vein layer on top,
  dimmed to 70% alpha (`tubeAlphaMul`) while still exploring so early
  growth doesn't already read as a "finished" differentiated network.
- The thin-vein rendering itself (from the previous "matte reference-photo"
  round, below) is completely unchanged — the sheet is a layer drawn
  underneath/on top of it, not a replacement.

**Verified live via `claude-in-chrome`** (temporary `window.__mazeDebug`/
`window.__networkDebug` hooks with a `step(n)` driver, **removed before
finishing**): captured 5 checkpoints through one maze cycle (15% grown,
76% grown, fully grown/sheet at peak, mid-relaxation with sheet mostly
faded, settled) and one Network Builder checkpoint mid-growth — the 15%
and Network Builder mid-growth frames in particular are a close visual
match to the reference figure's B panel (soft translucent radiating fan).
No console errors after either full cycle.

### If touching pacing/sheet again

- `relaxFramesPerStep()` and the growth-front's per-frame math are both
  frame-counted (assumes ~60fps `requestAnimationFrame`), consistent with
  every other timing constant in these files (`GROWTH_RAMP_FRAMES`,
  `RETRACT_K`, etc.) — not switched to real elapsed-time delta, to keep this
  change scoped to timing/visuals without a bigger architectural refactor.
- `drawSheetWash` reads `edgeActivatedFrame`/`reach` but never writes them —
  purely an additional rendering pass, same "cosmetic only" boundary as the
  rest of the rendering work in this file.
- A debug `step(n)` driver was used this round instead of the older
  `fastForward` pattern specifically because it also calls `updateVisuals()`
  every iteration — without that, `visD`/`reach`/`sheetOpacity` (which only
  advance inside `draw()` normally) look frozen when driven directly,
  exactly the trap noted in the previous round's entry. Keep doing this if
  a future session needs a synchronous test driver again.

## 2026-08-08 (earlier) — bug fix: idle state was rendering the whole maze pre-grown

**User report**: "can you open it pls im not seeing any changes other than
colour when i do." Opened it directly and confirmed: at true idle (page
just loaded, before ever clicking Grow), the maze rendered **fully grown**
— every one of 420ish tubes visible at full width, stats panel showing
"Tubes remaining: 420 / Total tubes: 420, Iterations: 0, Status: Ready."
The growth-front feature (added two rounds ago) looked like it was doing
nothing, because visually idle and "fully settled" were indistinguishable.

**Root cause**: `updateVisuals()`'s active/inactive threshold (and
`updateStats()`'s identical inline copy, in both `maze.js` and
`network-builder.js`) was computed as a *fraction of the current live max*
(`visMax * VISIBLE_FRACTION * ACTIVE_THRESH_MULT`, or `maxD() *
VISIBLE_FRACTION` in stats). That only works when the graph has real
variance. At idle, every single edge sits **uniformly** at `DMIN` (the
growth-front's invisible floor) — so `visMax`/`maxD()` is *also* `DMIN`,
and the threshold becomes a tiny fraction of `DMIN` itself. Every edge,
sitting exactly at the "max," trivially clears its own fractional
threshold, so everything reads as "active" — a degenerate case that only
manifests when the data has zero spread, which is exactly the idle state
this whole feature was built to keep invisible. It went unnoticed in every
prior test because testing always clicked Grow immediately, never
screenshotting the true pre-click frame.

**Fix**: threshold is now anchored to the known constant ceiling `PHYS_D0`
(`= window.PhysarumGraph.D0`, always 1) instead of the live/current max:
`threshold = PHYS_D0 * VISIBLE_FRACTION * ACTIVE_THRESH_MULT` (rendering)
and `PHYS_D0 * VISIBLE_FRACTION` (stats). Applied identically in both
`updateVisuals()` and `updateStats()`, in both `maze.js` and
`network-builder.js`. `countActive()` (used only inside `advance()`, i.e.
only during real relaxation where the graph already has genuine spread)
was deliberately left alone — its self-referential formula isn't wrong in
that context, and it directly feeds settle-detection, which was already
verified working; no reason to risk it for a case it doesn't hit.

**Verified**: reloaded fresh, confirmed idle now shows "Tubes remaining: 0"
and an empty canvas (just maze walls), clicked Grow and watched real thin
veins sprout from the source cell — the actual previously-shipped growth
animation, which was real code, just never visible before this fix. No
console errors.

## 2026-08-08 (earlier) — matte reference-photo rendering: glow removed, real Physarum color

**User feedback that triggered this round**: user supplied four real reference
photos/screenshots of actual *Physarum* (including the Tero et al. 2010
time-lapse figure itself) in `C:\Users\gangs\OneDrive\Pictures\Documents\Pics`
and asked for the tube rendering to match them exactly, calling out that the
previous round's glow/bloom rendering (below) looked nothing like the real
organism: real veins are thin, matte, yellow-green, always show dark agar
between them, and the settled state is a lean branching network, not a
thick glowing blob.

**What the references actually show** (read carefully before touching this
again):
1. `Screenshot 2026-07-26 162845.png` — a growing plasmodium, dense radiating
   veins fanning out from a bright yellow core, red hand-drawn outline
   marking its current extent, white dots = food sources it hasn't reached.
2. `Screenshot 2026-08-08 182246.png` — **the actual Tero et al. 2010 A–F
   time-lapse figure**: starts as a small yellow blob (0hr), grows into a
   dense green mesh covering the whole area (5–8hr), then visibly *thins*
   over 11–26hr down to a lean branching network connecting the food dots,
   with a white outline overlay comparing it to the real Tokyo rail map.
   This is the ground truth for what "settling" should look like.
3. `Screenshot 2026-08-08 182509.png` — petri dish, top-down: solid
   yellow-green blobs where the plasmodium is actively covering ground next
   to food, thin branching veins elsewhere connecting distant colonies, dark
   blue-black agar clearly visible in every gap.
4. `Screenshot 2026-08-08 182750.png` — a settled dish of oat flakes: only
   extremely fine, hairline yellow-green veins remain, connecting flakes
   directly, no visible width at most points.

**Fix, in `growth-fx.js`, `maze.js`, `network-builder.js` — no changes to
`PhysarumSolver`/the equations, purely a rendering rewrite**:
- **All glow removed.** Every `ctx.shadowBlur`/`ctx.shadowColor` in tube,
  particle, and terminal rendering is gone. Tubes are now a single flat
  `ctx.stroke()` per edge — no halo pass underneath.
- **Color**: `growth-fx.js`'s `activityColor(t)` replaced the old 3-stop
  gray→amber→coral "hot" gradient with a plain 2-point fade from a
  near-background dark tone (`rgb(22,32,26)`) to solid `#a8c93a`
  yellow-green (`rgb(168,201,58)`) — matches the real pigment color in every
  reference photo, not a stylized heat-map.
  Alpha is *also* scaled with `t` in the caller (`0.1 + t*0.85`) so barely-
  active tubes don't just look dark, they look genuinely close to absent —
  matching how thin the real fringe veins get.
- **Width**: new `MIN_TUBE_WIDTH = 0.5` / `MAX_TUBE_WIDTH = 3` constants
  (was an unbounded-feeling `1 + t*8`) — hairline veins even at full
  conductivity, matched by eye against how thin the reference veins are
  relative to their canvas/dish size.
- **Particles**: kept the particle system itself (not asked to remove it),
  but stripped its glow too and shrank/dimmed it (`radius 2.4→1.6`,
  `alpha 0.9→0.8`) — the references are stills/time-lapses with no visible
  flow particles at all, so these stay a subtle hint of motion, not a
  light show.
- **Terminals**: kept the coral-source/indigo-sink color coding (a real UI
  need — user must be able to tell source from sink at a glance, and no
  reference photo has an equivalent "this is the mathematical source"
  marker to copy), but removed their glow too, keeping only the existing
  subtle source size-pulse.

**Verified live via `claude-in-chrome`** (temporary debug hooks again,
**removed before finishing**): screenshotted both demos at an early
"exploring" point and fully "done" —
- Maze Solver: early growth reads as sparse, hairline, branching veins
  radiating from the start cell — a close visual match to reference #1's
  radiating-vein look. Settled state is a single thin yellow-green line
  through the maze with dark walls/floor clearly visible around it — matches
  reference #2's late-timepoint frames closely.
- Network Builder (5 terminals, open lattice): settled state is a clean thin
  X-shaped network, matching reference #2/#4's settled-rail-network look
  well. **Flagged honestly, not silently fixed**: the *early* growth frame
  on this demo reads denser/mesh-like (many crossing hairlines) rather than
  the sparse individual veins of the maze or the photo references — this is
  because the lattice is 8-connected and fine-grained (every node has ~4
  edges), so within the growth radius far more edges exist than in a maze's
  actual-corridors-only graph. Not fixed this round since the user asked to
  review screenshots before further changes; if asked to address it,
  lowering `LATTICE_COLS`/`LATTICE_ROWS` (coarser lattice, fewer edges per
  area) or reducing 8-connectivity to 4-connectivity are the two obvious
  levers, not anything about the color/glow work done here.
- No console errors after full grow→settle cycles on either demo.

## 2026-08-08 (earlier) — "petri dish" rendering overhaul: glow, particles, root/tip retraction

**User feedback that triggered this round**: the growth-front animation from
the previous round (below) was structurally working but visually flat —
user wanted it to look like *"an actual organism solving the maze... alive,
not calculated"*, specifically requesting: tube width/glow scaling with
conductivity, flowing "protoplasm" particles, chaotic/organic (not
perfectly circular) growth, a visible retraction/shrink animation as tubes
die during relaxation (not just fade-in-place), and pulsing terminal glows.

**Explicit constraint honored**: `PhysarumSolver`/the Tero-Nakagaki
equations were not touched — this is a pure rendering-layer change in
`maze.js`/`network-builder.js`, plus a new shared file. Every mechanic below
reads `D`/`Q`/`p` the solver already computed; nothing here feeds back into
the physics.

**New shared file: `growth-fx.js`** (loaded between `physarum-solver.js` and
`maze.js` in `index.html`) — `window.PhysarumFX`:
- `activityColor(t)` — three-stop gradient (dim gray-green -> amber ->
  coral) used for both tube color and particle color.
- `buildAdjacency(count, edgeA, edgeB)` — undirected adjacency list for
  particle routing.
- `ParticleFlow` class — a pool of dots that hop node-to-node along graph
  edges. Each hop's destination comes from a caller-supplied
  `chooseNext(nodeIdx, incidentEdges, cameFromEdge)` callback, so this file
  stays graph/physics-agnostic; the two demos each define their own routing
  strategy (see below).

**Per-demo additions (identical mechanic in `maze.js` and
`network-builder.js`)**:
1. **Glow tubes** — `updateVisuals()` smooths a new `visD` array toward the
   real `solver.D` every frame (`VIS_SMOOTH_K`), decoupling rendered
   width/color from raw simulation step size. `drawTube()` draws each edge
   twice: a wide, low-alpha, heavily-blurred halo pass, then a sharp core
   pass at `width = 1 + t*8`, colored via `activityColor(t)`.
2. **Root/tip retraction** — every edge already has a "root" (endpoint
   closer to the source) and "tip" from the growth-front's own
   `dist`/Dijkstra computation (reused, not recomputed). A new `reach`
   array (0=retracted/invisible, 1=fully extended) eases toward 1 once an
   edge's `visD` clears an active threshold, else eases toward 0
   (`RETRACT_K`, ~330ms either way). Tubes are drawn from root to
   `root + (tip-root)*reach` — so growing tubes visibly *lengthen* out of
   the source, and dying tubes visibly *shrink back* into it, instead of
   just fading in place. This is the direct answer to "retraction
   animation" in the request.
3. **Protoplasm particles** — `updateParticles()` spawns a trickle of dots
   (capped at `PARTICLE_MAX = 80`) at the source every few frames, routed
   by `ParticleFlow`. Two different `chooseNext` strategies depending on
   phase, since there's no real flux to follow yet during growth:
   - `chooseNextGrowth` — while the growth front is still spreading, chases
     whichever neighboring edge activated most recently (heads for the
     growing tip, since there's no real flux yet to route by).
   - `chooseNextRelax` — once relaxation is running, follows the real
     Kirchhoff flow direction (`Q[e]`'s sign relative to `edgeA`/`edgeB`)
     and magnitude (weighted random choice among valid outgoing edges).
   Particles fade in over their first ~8 frames, fade out in the last ~18%
   of each edge crossing, and simply vanish if they hit a dead end or a
   sink (`isSinkNode`).
4. **Organic/chaotic growth** — `GROWTH_JITTER_FRACTION` raised 0.15 -> 0.32
   (front's leading edge is noticeably raggedy now, not a tidy ring/circle)
   and each edge now gets its own randomized ramp duration
   (`edgeRampFrames = GROWTH_RAMP_FRAMES * (0.65..1.35)`), so branches
   visibly thicken at different rates instead of in lockstep.
5. **Terminal pulsing** — source terminal pulses continuously (radius +
   shadowBlur driven by `sin(performance.now()/420)`, coral); sinks hold a
   steady indigo glow. Makes the "pull" direction read at a glance.

**Verified live via `claude-in-chrome`** (temporary `window.__mazeDebug`/
`window.__networkDebug` hooks again, **removed before finishing**, per the
established project convention — this round's version also exposed
`stepVisuals(n)`/`timeDraw(n)` since `fastForward` bypasses `draw()`, and
without manually driving `updateVisuals()` afterward, `reach`/`visD` looked
frozen — a test-harness artifact, not a real bug, caught by checking
`reach` was 0 for every edge immediately after a raw `fastForward`, then
confirming it converged to the correct ~49-tube shortest-path count once
`stepVisuals` caught the smoothing up):
- Maze Solver: visible root->tip tube extension along actual corridors,
  particles trailing right behind the growth front, pulsing coral source.
- Network Builder (5 terminals, ~4,500-edge lattice): full grow->relax->
  settle cycle confirmed correct (`reach` converged to 122 fully-extended
  tubes matching the visible X-shaped settled network); **performance
  checked directly** — `draw()` cost measured at ~1.38ms/frame at peak
  mid-growth density and ~0.94ms/frame once settled, both far under the
  16.7ms/frame budget for 60fps even with the two-pass glow rendering.
- No console errors after either full cycle.

### If touching the rendering again

- `reach`/`visD`/`edgeRootNode`/`edgeTipNode`/`particleField` are all
  rebuilt in `resetAll()` alongside the existing growth-front arrays — if
  adding another reset path, route it through `resetAll()`, same caution as
  already noted below for the growth-front state.
- `updateVisuals()` (which advances `visD`/`reach`) only runs inside
  `draw()`, which only runs inside `frame()`'s `requestAnimationFrame`
  loop — a script driving the simulation directly (e.g. a future debug
  hook) needs to call `draw()` or `updateVisuals()` itself, not just the
  physics step functions, or the rendering state will look stuck even
  though the underlying `D` is changing correctly.
- `chooseNextGrowth`/`chooseNextRelax` both live in each demo file (not
  `growth-fx.js`) specifically because they need that file's own
  `edgeActivatedFrame`/`solver.D`/`solver.Q` — `growth-fx.js` only owns the
  generic hop/draw mechanics, not any routing policy.

## 2026-08-08 (earlier) — added a real growth-front animation before relaxation

**User feedback that triggered this round, verbatim complaints:** the maze
"instantly finds the fastest path and only grows on the fastest path,"
Network Builder wasn't "growing in a circle," overall "not how slime mold
grows," wanted "ACTUAL SLIME MOLD GROWTH like realistic" that people can
actually watch, and the sliders' purpose wasn't clear.

**Root cause**: the model's real initial condition is D=D0 (equal
conductivity) on *every* edge at t=0 — scientifically correct (this is what
"the whole plate starts covered" means in Tero et al.), but it meant both
demos rendered the *entire* graph as fully-formed tubes the instant you hit
Grow, then just thinned down. There was never a visible "growing outward"
moment — only the thinning half of the story was animated.

**Fix**: added a new `exploring` phase (`idle → exploring → relaxing →
done`, was `idle → relaxing → done`) in both `maze.js` and
`network-builder.js`, identical mechanic in each. This is explicitly a
**cosmetic pre-roll, not part of the Tero/Nakagaki equations** — documented
as such in code comments, same honesty standard as `fluxScale`/`DMIN`/etc.
elsewhere in this project:

1. On Reset/Grow, every edge's `D` is force-set to `DMIN` (invisible)
   instead of the model's real `D0` start.
2. `window.PhysarumGraph.dijkstraDistances` (new helper added to
   `physarum-solver.js`, exported alongside the existing graph-building
   helpers) computes real graph-distance from the source to every node —
   through maze corridors for Maze Solver (so it naturally follows walls
   like a real organism finding its way, not a mechanical shape), straight
   lattice distance for Network Builder (which reads as a genuinely circular
   spread on the open plate — directly answers the "growing in a circle"
   complaint).
3. Each edge gets a random jitter added to its activation distance
   (`GROWTH_JITTER_FRACTION`) so the front's leading edge looks organic
   instead of a crisp mechanical ring/circle.
4. A `frontRadius` advances every frame (rate scales with the existing speed
   slider); when it passes an edge's activation distance, that edge starts
   thickening from `DMIN` to `D0` over a fixed `GROWTH_RAMP_FRAMES` window
   with an ease-out cubic, instead of popping in instantly.
5. Once the front has covered the whole graph (all edges fully ramped),
   `D` is set to exactly `D0` everywhere (identical to the model's real
   initial condition) and phase flips to `relaxing` — from that point on,
   **zero changes** to the actual Kirchhoff/Poiseuille + reinforcement-decay
   relaxation code; it runs exactly as before, thinning the now-fully-grown
   network down to the efficient answer.

Verified live via `claude-in-chrome` (temporary `window.__mazeDebug`/
`window.__networkDebug` hooks again, same pattern as prior rounds, **removed
before finishing**): Maze Solver visibly grows tube-by-tube through actual
corridors from the start cell outward, then thins to the shortest path.
Network Builder visibly grows as an organic, roughly-circular blob from the
source outward — screenshots during the test genuinely resembled real
Physarum plasmodium time-lapse footage — before thinning to an efficient
multi-terminal network. No console errors after a full grow→settle cycle
with the debug hooks removed.

**Also addressed "I don't understand what the sliders are"**: relabeled
"Relaxation speed" → "**Simulation speed**" (accurate now that it drives
both the growth front and relaxation) and added a one-line plain-English
`.control-hint` under both sliders in `index.html` (new CSS class in
`style.css`), e.g. gamma's hint: "low keeps extra backup routes alive, high
thins down to the leanest possible network."

### If touching growth/relaxation again

- `PHYS_D0`/`PHYS_DMIN` in both demo files are read from
  `window.PhysarumGraph.D0`/`.DMIN` (newly exported from
  `physarum-solver.js`) — keep these as the single source of truth rather
  than hand-copying `1`/`1e-3` again.
- `GROWTH_BASE_FRAMES` (220) sets exploration's total duration in frames at
  speed=1, independent of graph size — don't tune per-graph-size, the
  distance-normalized `growTarget` already handles that.
- The transition into `relaxing` deliberately waits `GROWTH_RAMP_FRAMES + 2`
  frames *after* `frontRadius` first reaches `growTarget`, so the
  last-activated edges get their full thickening ramp instead of popping
  straight to `D0` — don't collapse that into an immediate transition.
- `resetBtn`/`New maze` fully recompute `dist`/`edgeActivateAt`/
  `edgeActivatedFrame`/`frontRadius`/`growTarget` from scratch — if adding
  another reset path, make sure it goes through `resetAll()` rather than
  partially resetting state (a stale `edgeActivatedFrame` from a previous
  run would make edges pop in without a ramp).

## 2026-08-08 (later) — SECOND PIVOT: dropped the Mumbai map, two generic demos instead

**The whole "What this project is" section directly below, and everything
about `app.js`/`network.js`/`roads-data.js`/Leaflet/Nominatim/Overpass, is
now history, not the current site.** The user's own words: *"i like 1 and 2
yeah 2 tabs on the same site good idea now i dont [like] the grim and dark
theme like the last website lets use more colours but keep it good
looking."* Two changes happened at once:

1. **Left the Mumbai road-network map entirely.** No more Leaflet, no more
   OSM/Overpass road data, no more address geocoding. The old files
   (`app.js`, `network.js`, `roads-data.js`) are preserved verbatim under
   **`archive_mumbai_map/`** in this same folder — not deleted, just out of
   the live site — in case the map version is ever wanted again. The
   `PhysarumSolver` core (`physarum-solver.js`) is **unchanged** and reused
   as-is; only what feeds it (the graph) and what's built around it
   changed.
2. **Replaced the single scrolling page with a two-tab site**
   (`tabs.js`), both tabs sharing one `index.html`/`style.css`/
   `physarum-solver.js`:
   - **Maze Solver** (`maze.js`) — a generated lattice maze; single source
     terminal, single sink terminal, gamma-driven convergence toward the
     one true shortest path (this is the Nakagaki/Yamada/Tóth 2000
     maze-solving result specifically, as opposed to the 2010 rail-network
     paper).
   - **Network Builder** (`network-builder.js`) — a blank lattice canvas
     where the user clicks to place their own terminals (first click =
     source, rest = sinks), then grows a Tero et al. 2010-style multi-
     terminal network live, same solver core.
   - **Theme replaced**: the prior near-black/single-green "grim" palette is
     gone. New palette in `style.css` `:root` is warm/light
     (`--bg: #f8f5ee`) with five accent hues used deliberately (teal
     `#0f9d84` primary/tubes, coral `#e8543d` source terminals, amber
     `#dc9a2e` high-conductivity glow, indigo `#4c5fd6` sink terminals,
     violet `#9b5de5` decorative hero glow) — "colorful but still looks
     good," not a rainbow free-for-all. One deliberate holdover: the
     simulation canvas itself (`--plate-bg: #0e1815`) stays dark, styled as
     an agar dish under lab light, for contrast against the bright D-value
     tube glow — the one intentional dark surface on an otherwise light
     page.

Below this point, "What this project is" and the whole "2026-08-08 — MAJOR
PIVOT" section describe the **Mumbai map era**, now archived. Read them only
for `physarum-solver.js` internals (still accurate/shared) or if reviving
the map version. The current live site is documented further down under
**"2026-08-08 (later) — Maze Solver / Network Builder implementation
details."**

## What this project is (Mumbai-map era — archived, see pivot above)

"EOB" = Elements of Biology, an academic biomimicry project. The site
explains and interactively demonstrates the real 2010 Tokyo slime mold
(*Physarum polycephalum*) rail-network experiment (Tero et al., *Science*,
2010), adapted to Mumbai's real street network. The site has **two** live
interactive models:
1. **Point-to-point** (`#model`, `app.js`) — the user picks two real Mumbai
   addresses; the model injects flux at the start and withdraws it at the
   end, and solves the real adaptive-network equations across the road
   network between them.
2. **Station Network** (`#network`, `network.js`) — recreates the actual
   Tero et al. 2010 methodology directly: all eight of Mumbai's major
   suburban rail stations are terminals in one simultaneous relaxation
   (one arbitrary source, the rest sinks — see below).

## 2026-08-08 — MAJOR PIVOT: replaced the growth heuristic with the real algorithm

**Everything below "The growth algorithm" through "The Station Network
mode" in earlier versions of this doc described a hand-built agent/tree
tree-growth heuristic** (tips that wander, branch, backtrack, and get
compared/pruned). It looked plausible and was heavily tuned, but **it was
not the Tero et al. model** — it was a stylized animation loosely inspired
by it.

The user's explicit instruction, relayed from their teacher: *"actually use
the slime mold algorithm because what we are using right now isn't the
actual algorithm... my teacher wants the actual algo or nothing"* — plus
citations on the site. That triggered a full rewrite of the simulation core
in both `app.js` and `network.js`, sharing one new file,
**`physarum-solver.js`**, that implements the actual published model. The
old tree-growth code, the "zone/cloud" canvas visualization, and the
node-budget retraction animation described in the old version of this doc
are **entirely gone** — don't try to resurrect or reference that code, it
no longer exists in `app.js`/`network.js`.

### The real model (physarum-solver.js)

From Tero, Kobayashi & Nakagaki (2007, *J. Theor. Biol.* 244(4):553–564)
and Tero et al. (2010, *Science* 327(5964):439–442). No agents, no
branching probabilities, no "compare routes and pick a winner" logic
anywhere. The whole algorithm is two coupled rules, applied every tube
(graph edge) at every timestep:

1. **Kirchhoff's current law + Poiseuille flow**, solved as a live circuit:
   `Q_ij = (D_ij / L_ij)(p_i − p_j)`, with flow conserved at every node
   (`sum_j Q_ij = I_i`, source/sink flux `I_i`, `sum(I) = 0`). Solving for
   pressures `p` is solving a weighted graph Laplacian — done with
   **matrix-free, Jacobi-preconditioned conjugate gradient**
   (`PhysarumSolver.solvePressures`), warm-started from the previous
   timestep's pressures (D changes only slightly per step, so warm CG is
   cheap after the first solve).
2. **Tube adaptation**: `dD_ij/dt = f(|Q_ij|) − D_ij`, Euler-integrated
   (`PhysarumSolver.stepEuler`), where `f(Q) = Q^gamma/(1+Q^gamma)` is a
   saturating, monotonically increasing function of flow. Busy tubes
   reinforce, idle tubes decay toward a numerical floor (`DMIN = 1e-3`,
   never literally removed from the graph, just effectively invisible).

`gamma` is the model's real reinforcement exponent from the paper — on
this site it's **directly exposed as the "Network selectivity — γ"
slider** (not a cosmetic knob): higher gamma converges toward a single
lean path/spanning tree, lower gamma preserves redundant loops. Range
1.0–2.4 in both models; point-to-point defaults to 1.8 (favors the single
shortest path, matching Nakagaki, Yamada & Tóth's 2000 maze-solving
result), Station Network defaults to 1.7.

**Rendering**: tube width/color on screen literally *is* `D_ij`, drawn
live every frame (`draw()` in each file) — normalized against the current
max `D` across the graph, edges below `VISIBLE_FRACTION` of that max
aren't drawn (effectively vanished). There is no separate
"thickening"/"retraction" animation state anymore; a tube visibly thinning
to nothing *is* the same equation that thickens the survivors, playing out
in real time. This was a deliberate design choice confirmed with the user
over the old "keep the cloud visualization" alternative.

### Parameters that are OURS, not the paper's (documented in code + site's References section)

Being honest about this distinction was an explicit part of the ask (the
site's References section says so directly). Don't blur this if asked to
touch the model again:

- **`D0 = 1`** initial conductivity on every edge — matches the paper's
  convention, not itself a free choice.
- **`fluxScale`** (`FLUX_SCALE` constant in each file, 0.05 in both) — NOT
  from either paper. `f(Q)` has its characteristic "knee" at `Q ~ 1`, but a
  real irregular road graph splits the fixed unit flux across many
  parallel streets before it funnels through an actual bottleneck, so most
  edges never carry flux near 1 and reinforcement/decay never becomes
  decisive, however long the simulation runs. `fluxScale` rescales the
  input to `f()` (`Q/fluxScale`) so the knee sits where this graph's
  typical per-edge flux actually lives. Equivalent in effect to choosing a
  much larger `I0`; done this way so `I0` itself stays a clean 1 in the
  flux bookkeeping. **Discovered empirically** — without this, the
  point-to-point model settled with a large visible gap between the start
  point and the nearest real bottleneck, because open-grid areas near a
  well-connected start point never differentiated (confirmed via
  pixel-bounding-box analysis of the rendered canvas during testing).
- **`DMIN = 1e-3`** — numerical floor, prevents divide-by-zero in `D/L`;
  not a value from the paper.
- **Integration step `DT = 0.14`**, CG tolerance `CG_TOL = 1e-4` — our own
  numerical choices for stability/speed, not physical constants.
- **Iteration/CG budgets are a deliberate compute-budget tradeoff, not a
  convergence guarantee** — see Performance below.

### The Station Network mode's source/sink simplification

Per Tero et al. 2010: rather than every one of the 8 stations being a
source, **one station is arbitrarily designated the mathematical source**
(`I = +1`) and the other 7 split the sink flux evenly (`I = −1/7` each).
The paper notes — and the site's copy says this explicitly — that which
terminal plays the source role is arbitrary and doesn't change the
resulting network topology, since the physics only depends on relative
pressure. `network.js` always picks `STATIONS[0]` (Churchgate) as source;
this is not a meaningful choice, just a fixed pick for determinism.

### Performance (this took real iteration — read before touching CG/graph-size constants)

A real Mumbai road graph has edge weights (`D_ij/L_ij`) spanning several
orders of magnitude and can be tens of thousands of edges for a cross-city
query. This makes the Laplacian system **poorly conditioned**, and getting
this to run smoothly client-side took several rounds of fixes, in order of
what was tried:

1. **Struct-of-arrays for edges** (`edgeA`/`edgeB` typed `Int32Array`s
   instead of an array of `{a,b,length}` objects) — `_applyL` runs this
   every CG iteration, dozens of times per Euler step, hundreds of Euler
   steps; per-edge object property lookups were a real bottleneck at graph
   sizes in the tens of thousands. Roughly 2.7x speedup alone. `edges`
   (the original object array) is kept only for external consumers.
2. **Jacobi (diagonal) preconditioning** added to CG
   (`_buildDiagonal`/`solvePressures`) — necessary but **not sufficient**
   on its own; measured plain CG hitting its iteration cap on *every
   single step* on a ~14k-25k edge graph, before or after adding this.
3. **The actual fix**: stopped trying to fully converge the linear solve
   every Euler step. `CG_MAX_ITER_WARM` is deliberately small (18 in
   app.js, 20 in network.js) — treated as a **fixed per-step compute
   budget**, not a convergence target. This is a legitimate simplification
   given the model is itself a slow ODE (D evolves gradually) — an
   inexact pressure solve still gives a reasonable flux estimate that
   nudges D in roughly the right direction, and errors self-correct over
   the many subsequent Euler steps, similar to how real-time
   physics/cloth solvers run a handful of Jacobi/Gauss-Seidel sweeps per
   frame rather than solving to convergence.
4. **Tightened the crop** (`CROP_PAD_KM_MIN`/`CROP_PAD_FRACTION` in
   app.js) — CG cost grows fast with graph size regardless of algorithm
   quality, so keeping typical point-to-point subgraphs small (a few
   thousand edges for normal in-city queries) matters more than further
   solver cleverness. **This created a regression**: a too-tight crop can
   genuinely disconnect start from end (some pairs need a real detour
   around water/parks). Fixed with a **retry-with-expansion loop** in
   `beginSetup()` (`CROP_EXPAND_FACTOR`/`CROP_MAX_ATTEMPTS`) — widens the
   padding and retries before giving up. Verified via 25 consecutive
   random-landmark trials with zero connectivity errors after this fix
   (2/20 failed before it).

Station Network mode's graph is inherently large (stations are spread
across most of the bundled map, ~30-36k edges) and **takes noticeably
longer to fully settle than the point-to-point case** — verified via
testing that visible network length actually *rises* while regions are
still independently differentiating toward their nearest terminals, then
falls once full 8-station connectivity is reached and redundant bridges
lose out. This is real model behavior, not a bug — don't "fix" it by
suppressing the rise. `MAX_ITERS = 1600` for that mode was chosen as
"plateaus well before this cap in practice", confirmed via extended
testing up to 1800 iterations. The site's hint text sets this expectation
directly ("this one takes longer than the two-point model").

### Testing methodology note (read before assuming something is broken)

Confirmed again this round: `claude-in-chrome`/browser-automation tabs can
report `document.hidden = true`, which suspends `requestAnimationFrame`
entirely — a live run can look frozen at "Iterations: 0" indefinitely with
no console error. This is a testing-tool artifact, not a real bug (real
users' tabs are foregrounded). Workaround used again this round: a
temporary `window.__physarumDebug`/`window.__networkDebug` hook exposing
`fastForward(n)` (calls `simTick()` synchronously in a loop, bypassing
rAF) and `getSolver()` (peek at solver internals — `lastCgIters`, `D`,
etc.). **Both were removed from `app.js`/`network.js` before finishing**,
per the established pattern in this project — re-add temporarily if a
future session needs to test synchronously again, but remove before
considering work done. Note `fastForward` calls can be slow for large
graphs — batch them (a few hundred at a time) across separate tool calls
rather than one huge call, or the tool call itself will time out (observed
directly this round) even though the page is still making real progress.

Also note: the local static server was previewed via a `.claude/launch.json`
**inside `EOB_Website/`** in `attach`-style config pointing at
`http://localhost:8765` (started separately via
`python -m http.server 8765`), since the browser preview tool resolves
`.claude/launch.json` relative to the *session's* cwd, not the target
project folder — if that cwd differs from `EOB_Website`, you'll need to
either run the session from there or create/attach a preview config
pointing at a server you start manually.

### Files (updated)

- **`physarum-solver.js`** — **new**. The actual model: graph construction
  from `ROADS_DATA` (`PhysarumGraph.buildFullGraph`, real haversine-meter
  edge lengths, not pixel distance), connectivity/cropping helpers
  (`connectedComponent`, `connectedComponentMasked`, `subgraphFromMask`),
  and the solver itself (`PhysarumSolver` class: `setFlux`, `_applyL`,
  `solvePressures`, `stepEuler`). No DOM/map/canvas code at all — shared
  verbatim by `app.js` and `network.js`. Loaded via `<script>` before both,
  after `roads-data.js`.
- **`app.js`** — rewritten. Address search/geocoding/map-click UI is
  unchanged from before. The simulation core is now: crop the road graph
  around the two chosen points (with retry-on-disconnection), build a
  `PhysarumSolver` with a single source/sink pair, drive it forward each
  frame within a time budget (`advance()`), render tube width/color from
  live `D` values (`draw()`). No more tree nodes, tips, candidates, leaf
  queues, or zone-cloud canvas.
- **`network.js`** — rewritten, same pattern, multi-sink (1 source + 7
  sinks). Own Leaflet instance, self-contained, still never touches
  `app.js`.
- **`index.html`** — copy rewritten throughout (hero, science section,
  both model captions, "How It Works" comparison cards) to accurately
  describe the real Kirchhoff/Poiseuille + reinforcement-decay model
  instead of the old "explore then prune" framing. Sliders relabeled:
  "Branching" → "Network selectivity — γ" (now directly binds `gamma`,
  range 1.0–2.4), "Growth speed" → "Relaxation speed" (now integer
  Euler-steps-per-frame, range 1–6). Stat rows relabeled (Iterations,
  Tubes remaining, Total tubes, Convergence (ΔD), Path/Network length). A
  new **References** section (`#references`) was added with full,
  real citations and an honest note about which constants are the site's
  own calibration choices vs. the papers' — see `nav` for the new link.
  Script load order: `site.js` → Leaflet CDN → `roads-data.js` →
  **`physarum-solver.js`** → `app.js` → `network.js`.
- **`style.css`** — added `.reference-list` and `.section-sub code`
  styling for the new References section. Everything else unchanged.
- **`roads-data.js`, `site.js`** — unchanged, see below.

### Everything below this point describes infrastructure that did NOT change in this pivot

## Tech stack (deliberately minimal)

- Plain HTML/CSS/JS, **no build tools, no framework, no npm**. Must work by
  double-clicking `index.html` directly (file:// protocol), or via a static
  file server.
- Leaflet.js (via unpkg CDN) + CARTO Positron tiles for the map background
  (light "Google Maps" look). All pan/zoom/drag map interactions are
  disabled — `map.fitBounds()` auto-frames whichever points are active.
- OpenStreetMap Nominatim API for live address geocoding/autocomplete
  (works fine on the user's network, still used live).
- Google Fonts: Space Grotesk (sans) + JetBrains Mono (mono).

## Why road data is bundled locally instead of fetched live

The user's network **blocks the Overpass API at the TCP level** (confirmed
via `Test-NetConnection -ComputerName overpass-api.de -Port 443` →
`TcpTestSucceeded: False`; ruled out Windows Defender and local firewall).
Per explicit user direction, the fix was to depend on **zero live API
calls for the core feature**: road data for the Mumbai bbox
(south:18.88, west:72.79, north:19.14, east:72.93 — South Mumbai through
Bandra/Andheri/Powai/Ghatkopar/Chembur; 34,314 nodes, 7,178 ways) was
fetched once through a working Overpass mirror, compacted to
`{nodes, ways}`, and saved as a static `roads-data.js` file (~1.7MB)
checked into the project, loaded via a plain `<script>` tag (not `fetch` —
`fetch('roads-data.json')` under `file://` is unreliable/CORS-blocked in
Chrome, which is specifically why it's a `.js` file, not JSON).

## Site chrome (`site.js`)

Page chrome only (ambient hero canvas animation, scroll-reveal via
IntersectionObserver + a 2500ms `setTimeout` safety net, active-nav-link
highlighting). Nothing to do with either simulation.

## Problems solved (chronological, condensed — see git history / old
## conversation for the full blow-by-blow of the pre-pivot tree-growth era)

1. Real address search + real road-following simulation over real Mumbai
   OSM data (replacing an earlier abstract/random-point version).
2. Overpass API network-level block → solved by bundling road data
   locally, zero live dependency for the core feature.
3. Built a first working version as a tree-growth heuristic (agents,
   branching, prune-to-shortest) — extensively tuned over several rounds
   (two-phase explore/buffer/prune, zone/cloud visualization, paced
   retraction animation, multi-source Station Network mode). **This
   entire approach was replaced** in the 2026-08-08 pivot documented above
   because it wasn't the actual published algorithm.
4. **2026-08-08: replaced the heuristic with the real Physarum Solver**
   (Tero et al. 2007/2010) in both modes, added real citations to the
   site, fixed the resulting numerical-performance and crop-connectivity
   issues described above under "Performance".

## Current state

Both models run the actual model equations, verified via direct browser
testing (see "Testing methodology note" above for how, given
`document.hidden` complications): point-to-point settles reliably across
25 random-landmark trials with zero connectivity errors; Station Network
reaches full 8/8 connectivity and a declining, plausible network length.
No debug hooks remain in either file. Citations are live on the site at
`#references` with an honest note distinguishing published values from
this implementation's own calibration constants.

## Possible next steps (not yet requested, just ideas if asked)

- Broader browser testing (Firefox/Safari) since development/testing was
  done primarily via Chrome automation.
- Mobile/responsive check of both live model sections at narrow widths.
- Station Network mode is genuinely slow to fully settle (~1600 iterations
  at ~50-90ms/iteration on this graph size, i.e. well over a minute
  worst-case) — if that's reported as a problem, the real lever is
  further shrinking the working graph (e.g., excluding regions far from
  every station's shortest path toward the others) rather than further
  CG tuning, which is already at a deliberately-inexact fixed budget.
- If the map coverage area is ever expanded beyond the current bbox,
  re-run the one-time Overpass fetch + compaction process for a new bbox
  (no live fetch fallback exists). Would also let Borivali/Thane/Mulund/
  Kalyan be added back to the Station Network mode.
- Consider exposing `fluxScale` as a third slider if users/teacher want to
  explore its effect directly — currently a fixed per-file constant.

## 2026-08-08 (later) — Maze Solver / Network Builder implementation details

### Files (current, live site)

- **`physarum-solver.js`** — the model itself is unchanged from the
  Mumbai-map era, see above. Graph-agnostic:
  `new PhysarumSolver(nodeCount, edges, gamma, fluxScale)`,
  `setFlux(fluxMap, groundIdx)`, `stepEuler(dt, cgMaxIter)`. Both demos
  build their own small lattice graph and hand it to this same class. Also
  exports `dijkstraDistances` and the `D0`/`DMIN` constants (added for the
  growth-front/rendering work below — cosmetic consumers, not physics).
- **`growth-fx.js`** — **new** this round, see the "petri dish" rendering
  entry above. Pure visual/animation helpers (`activityColor`,
  `buildAdjacency`, `ParticleFlow`), no DOM/physics of its own — shared by
  `maze.js` and `network-builder.js` the same way `physarum-solver.js` is.
- **`maze.js`** — generates a random lattice maze (`COLS * ROWS` cells,
  depth/backtrack maze-gen over the grid graph), places one source and one
  sink terminal automatically, and relaxes the network toward the single
  true shortest path as gamma increases tube selectivity. `FLUX_SCALE = 1`
  — unlike the old road-network graph, a maze lattice is sparse/tree-like
  (loops are rare), so most edges already carry flux near the full injected
  unit; no dilution correction needed (contrast with Network Builder
  below).
- **`network-builder.js`** — blank lattice canvas; user clicks placement
  (first click = source/coral, subsequent = sinks/indigo), "Grow" button
  starts relaxation exactly like the old Station Network mode but on a
  small local lattice instead of the Mumbai road graph. `FLUX_SCALE = 0.1`
  — this graph has more loop redundancy than the maze (multiple terminals
  spread across an open lattice, not a single-path maze corridor), so flux
  splits across more parallel edges before funneling through a real
  bottleneck; needed a smaller rescale than the maze's 1 (though nowhere
  near the road-network era's problem, since this lattice is far smaller
  and more regular than a real OSM graph).
- **`tabs.js`** — pure UI tab switcher between `#panelMaze` and
  `#panelNetwork`. Each demo's own script keeps running/rendering
  regardless of which tab is visible (no pause-on-hide). One wrinkle:
  Network Builder's canvas sizes itself via `ResizeObserver`, but that only
  fires once the render pipeline actually produces a frame on a
  newly-visible (`display:none` → visible) panel — `network-builder.js`
  additionally exposes `window.__networkBuilderResize`, which `tabs.js`
  calls directly via `getBoundingClientRect` on every tab-switch to
  `#panelNetwork`, so a click placing a terminal immediately after
  switching tabs is never briefly misaligned waiting on the observer.
- **`index.html`** — now a tab shell (`#tabBtnMaze`/`#tabBtnNetwork`,
  `#panelMaze`/`#panelNetwork`) instead of a single scrolling page. Script
  load order: `site.js` → `physarum-solver.js` → `growth-fx.js` →
  `maze.js` → `network-builder.js` → `tabs.js`.
- **`style.css`** — full palette rewrite, see the pivot note above for the
  actual hex values and rationale.
- **`archive_mumbai_map/`** — `app.js`, `network.js`, `roads-data.js`
  preserved as-is, not wired into `index.html` anymore.

### Bug found and fixed this round: premature "Settled" declaration

Both demos share the same settle-detection pattern: after each `stepEuler`,
if the returned `maxDelta` (largest single-edge |ΔD| that step) stays below
`SETTLE_EPS` for `CONSEC_SETTLE_NEEDED` consecutive steps, the UI declares
"Settled — this is the model's answer" and stops. **This is fooled by the
ODE's own decay shape**: as an edge's D approaches near-zero, `dD/dt ≈ -D`,
so the per-step delta (`≈ dt*D`) shrinks simply because D is already small
— not because the network has finished differentiating. Confirmed directly
by driving the solver past its declared "done" point with raw extra
`stepEuler` calls (bypassing the UI) and watching the active-tube count
keep changing well after "Settled" had already fired — e.g. maze gamma=2.4
declared done at 209 active tubes/100 iterations, when the true equilibrium
(matching gamma=1.0/1.8 baselines) is 49 active tubes.

**Fix, applied identically in both `maze.js` and `network-builder.js`**:
settle detection now *also* requires the discrete "active tube count" (the
same `D[e] >= maxD() * VISIBLE_FRACTION` threshold already used for
stats/rendering — factored into a shared `countActive()` helper in each
file) to be unchanged step-to-step, not just the raw delta being small.
This discrete/quantized signal is far harder to satisfy by numerical
happenstance than a shrinking-but-nonzero delta. `MAX_ITERS` was raised
alongside this in both files as a safety net (maze 420→3000, network
builder 700→4000) so slower-converging gamma regimes still have enough
steps to reach genuine equilibrium under the now-stricter criterion.
Verified after the fix: maze gamma=2.4 now correctly settles at 49 active
tubes/95 iterations; maze gamma=1.4 (a genuinely slow-plateau case) settles
at 52 active tubes/270 iterations; network builder gamma=2.4 settles at 62
active tubes and stays stable across 500+ additional raw steps run past
that point.

If touching `advance()` in either file again: `lastActiveCount` must be
reset to `-1` in both `resetAll()` and the idle→relaxing branch of
`beginGrowth()`, same as `settledStreak`/`maxDeltaLast` — forgetting this
would make the very first settle check after a reset compare against a
stale count from the previous run.

### Testing methodology note (same artifact as the Mumbai-map era, seen again)

`document.hidden`/backgrounded-tab `requestAnimationFrame` suspension (see
the older testing note further up) showed up again this round in the
`claude-in-chrome` automation environment — a live "Grow" click progressed
only 8→26 iterations over ~11 seconds of real wall-clock time, far slower
than the ~120-360 iterations/sec the code should hit at default speed. Not
a real performance bug. Same debug-hook workaround was used
(`window.__mazeDebug`/`window.__networkDebug` with `fastForward(n)`,
`getSolver()`, `getPhase()`, `getLattice()`, `getTerminals()`) and **both
were removed from `maze.js`/`network-builder.js` before finishing**, per
the established project convention — confirmed via fresh reload, a real
(non-debug-hook) button click, and a console-log check
(`error|Error|undefined|NaN` pattern, no matches) that nothing regressed.

One false alarm worth remembering if this comes up again: rapid
scripted `clearBtn.click()` + terminal-placement calls with no `await`
pacing between them can corrupt the test harness's own terminal placement
(collisions / stale `solver.I` flux maps) and *look* like a Network Builder
bug. It isn't — real user clicks are naturally paced. Confirmed by
re-running the same scenario with proper waits between steps and seeing
clean, correct behavior. Also note `resetBtn`'s handler guards
`if (solver)`, so clicking Reset before the first Grow (solver still
`null`) is a safe no-op, not a bug, if a future test script hits it.

### Current state

Both tabs run the real Tero/Nakagaki equations via the shared
`physarum-solver.js`, verified via direct browser testing on both demos
(Reset, Clear, gamma slider, real Grow-button clicks). No debug hooks
remain in `maze.js` or `network-builder.js`. Theme is the new warm/colorful
palette described above, not the old dark one.

### Possible next steps (not yet requested, just ideas if asked)

- Broader browser testing (Firefox/Safari) — development/testing was done
  primarily via Chrome automation.
- Mobile/responsive check of both demo panels at narrow widths (attempted
  once this round via the automation tool's `resize_window`, but it didn't
  actually change the tab's reported `window.innerWidth` — inconclusive,
  needs a real device or a different resize approach to verify).
- If the map version is ever wanted back, `archive_mumbai_map/` has
  everything needed (`app.js`, `network.js`, `roads-data.js`) — would need
  re-wiring into `index.html` plus Leaflet CDN script tags, which are no
  longer present.

## How to run/test locally

Static file server from the project directory, e.g.:
```powershell
cd "C:\Users\gangs\OneDrive\Pictures\Documents\EOB_Website"
python -m http.server 8765
```
then open `http://localhost:8765/index.html`. (Or just double-click
`index.html` — it's designed to work standalone via `file://` too, since
`roads-data.js` is a script tag, not a fetch.)
