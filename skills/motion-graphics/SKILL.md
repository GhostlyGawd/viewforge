---
name: motion-graphics
description: >-
  Produce the visuals for a ViewForge video as motion graphics (never a fake
  human). Builds a parameterized scene timeline from the beat sheet + the channel
  brand, scaffolds a Remotion project where every visual element is a tweakable
  prop (the A/B substrate), and renders the video locally. Department #6.
when_to_use: >-
  When a ViewForge video has a script + narration and needs visuals — e.g.
  "animate vid-1", "build the motion graphics", "viewforge motion step".
argument-hint: "[channel-slug] [video-id]"
allowed-tools: >-
  Read Write Edit Glob Bash(node *) Bash(npm *) Bash(npx *) Bash(mkdir *) Bash(echo *) Bash(ls *)
---

# Motion graphics (ViewForge — department #6)

Make the visuals. The look is motion graphics / illustration — **never a fake human**.
Production is **Remotion-first** so every element is a parameter the optimization loop
can A/B-test.

## 1. Build the parameterized motion plan

```bash
node -e '
Promise.all([import("../../lib/script-model.mjs"), import("../../lib/motion-plan.mjs"), import("../../lib/state.mjs")])
.then(([sm, mp, state]) => {
  const slug = process.argv[1], targetSeconds = Number(process.argv[2]||360);
  const brand = state.loadChannel("state", slug).brand;
  const beats = sm.buildBeatSheet({ targetSeconds });
  const plan = mp.buildMotionPlan(beats, brand, { fps: 30 });
  require("fs").writeFileSync(process.argv[3], JSON.stringify(plan, null, 2) + "\n");
  console.log("scenes:", plan.scenes.length, "| A/B knobs:", mp.tweakableParameters(plan).join(","));
})' "<slug>" 360 "<motion-plan.json>"
```

`buildMotionPlan` THROWS if the brand would require a fake human — the constraint is
enforced in code, not just prose. Each scene carries resolved params (transition,
pace, accent, texture) + the brand tokens.

## 1b. Re-time the plan from the REAL narration (audio-first — do not skip)

A fresh plan is `timingSource: "authored"` — beat-sheet guesses. Once the voice
department has produced `captions.json` (real per-beat durations), the **timing
solver** owns the seconds:

```bash
node -e '
Promise.all([import("../../lib/timing-solver.mjs"), import("../../lib/motion-plan.mjs")])
.then(([ts, mp]) => {
  const fs = require("fs");
  const captions = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  // author CONSTRAINTS per beat (minMs/maxMs/padAfterMs) — never resolved times
  const scenes = ts.scenesFromCaptions(captions.beats, { /* beatId: {minMs, maxMs} */ });
  const solved = ts.solveTimeline(scenes, { padAfterMs: 0, targetMs: null });
  if (!solved.ok) { console.error("BOUNCE:", JSON.stringify(solved.bounces), JSON.stringify(solved.flags)); process.exit(1); }
  const retimed = mp.applyResolvedTimeline(plan, solved.scenes);
  fs.writeFileSync(process.argv[2], JSON.stringify(retimed, null, 2) + "\n");
  console.log("timingSource:", retimed.timingSource, "| total", solved.totalMs + "ms");
})' "<captions.json>" "<motion-plan.json>"
```

- A **bounce** means a beat's VO overran its `maxMs`: the video goes back to
  **script-write** with the bounce's `wordBudget` — never stretch the voice (±4% cap,
  enforced). A short beat becomes a visual **hold** (`holdMs`), never dead air.
- `validateResolvedTimeline` re-checks the invariants before render; the renderer
  reads only resolved timing.

## 2. Scaffold / update the Remotion project

Copy the reusable, brand-agnostic template from **`assets/remotion-template/`** into
`videos/<id>/remotion/` (so `../motion-plan.json` resolves to this video's plan). The
template's composition reads `../motion-plan.json` + `../script.json` as props and is
already polished: logo sting, paper grain, animated ink-draw margin rule, wax-seal
stamp on the payoff, map-morph drift, and number accenting — all parameter-driven, so
A/B variants are just different `motion-plan.json`s (no code edits). See
`assets/remotion-template/README.md`.

## 3. Render locally (free)

```bash
cd videos/<id>/remotion && npm install && npm run render   # → out/<id>.mp4 (h264)
```

Remotion is free + open-source (local headless-Chromium render). Install the brand
fonts (Fraunces/Inter via `@remotion/google-fonts`) for an exact-brand render. If the
install/render can't run in this environment, scaffold the project + give the user the
one render command rather than faking an MP4.

## 4. Archival imagery (rights-clean) + audio

- **Imagery:** `node tools/fetch-assets.mjs <render>/public/assets "<query>" ...` pulls
  public-domain / CC0 / CC-BY images from Openverse + LoC, filtered by the tested license
  gate (`lib/asset-license.mjs` — NC/ND/unknown rejected; the channel is monetized + we
  composite) and a resolution floor, writing an auditable `manifest.json`. Bind images to
  scenes with `asset-source.bindAssetsToPlan` (validated against the manifest); the
  template's `ArchivalImage` composites them with a Ken-Burns move, a dark scrim, and an
  on-screen credit (CC-BY needs attribution).
- **Audio:** `node tools/synth-audio.mjs <render>/public/audio <durationSec>` generates a
  rights-clean (CC0) ambient bed + SFX. The composition plays the bed **ducked under the
  narration** per `lib/audio-mix.mjs` (music sits a fixed margin below speech), with SFX at
  beat cues. Never a fake human — voice + bed are audio only.

## 4b. Audio-driven cut with word-synced captions (preferred for flow)

The template ships two compositions: `MarginaliaVideo` (plan-driven) and **`CaptionVideo`**
(audio-driven). For engaging rhythm, prefer `CaptionVideo`: it reads `captions.json` (from
`tools/synth-voice.py`) so timing matches the real narration and captions reveal word-by-word
in sync with the voice — per-word `revealSec` when present (char-weighted within the real
beat audio; whisperX alignment is the upgrade path), even split as fallback — over
continuously-moving full-bleed archival photos. The reveal/window logic is the
property-tested `lib/caption-timing.mjs`. Render it with
`npx remotion render CaptionVideo out/video.mp4`.

## 4c. Iterate per scene, not per video

`lib/render-cache.mjs` gives each scene a content-hash identity
(`renderKey = sha256(scene + brandVersion + assetHashes + rendererVersion)`):
`planSceneRenders` re-renders only cache misses, `dirtyScenes` shows exactly what an
edit invalidated, and `concatPlan` refuses to stream-copy-concat segments whose codec
params differ. A one-scene fix costs one scene.

## 5. The signature set pieces
Build the brand's promised motion identity over iterations: map/timeline morphs, the
logo sting, ink-draw transitions, the money counter, kinetic headlines. Keep them as
parameters so they can be tuned.

## Definition of done
- [ ] `motion-plan.json` built (passes the no-fake-human guard); scenes parameterized.
- [ ] Plan re-timed from the real narration: `timingSource: "audio-solver"` (or the
      bounce honestly sent back to script-write with its word budget).
- [ ] Remotion project scaffolded/updated and plan-driven.
- [ ] Video rendered locally (or the render command handed over if the env can't run it).
- [ ] Handed off to **edit-assemble**.
