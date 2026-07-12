# Plan — Master Doc v2 completion (learning loop, gates, capture, formats)

Goal: finish the adoptable surface of the **Master Document v2**. Plan 06 shipped the
audio-first production core (solver, mastering, per-scene cache, timestamp captions,
provenance). This plan ships the rest that belongs in a Phase-0 plugin:

- the **learning-loop rigor** of §10/§17/§23 (domain separation, provenance
  admissibility, topic-cluster confound guard, expiry, Test & Compare experiments),
- the **gate architecture** of §11/§25 (Gate 0 composed into A/B/publish; the visual
  QC harness whose judgment step a VLM performs but whose policy is code),
- the **capture-first layer** of §7/§16/§20 (contracts, deterministic cursor tracks,
  the Playwright emitter, Tier-1 overlay components),
- the **§19 scene grammars** (demo + short formats), §6 whisperX alignment merge,
  and §22 scene-scoped asset fallbacks.

Explicitly OUT of scope (destination architecture, not Phase 0 — §24): Postgres/
Redis/S3 services, the Next.js dashboard, Lambda render farm. ViewForge IS the
Phase-0 spine: Claude Code as orchestrator, contracts on the filesystem, one repo.
The §24 mapping is documented in ROADMAP so Phase 1 can lift the same contracts into
services unchanged.

Discipline unchanged: pure logic property/BDD-tested; environment-dependent runners
(Playwright, whisperX) ship as tools that consume tested libs.

---

## Phase F — the learning loop as a hypothesis engine (§10/§17/§23)

The analytics loop already refuses simulated data and gates promotion on
out-of-sample wins with guard metrics intact. v2 adds four more ways a learning loop
fools itself, each closed in code:

1. **Domain crossing** — "never let one metric write rules for the other's domain":
   CTR evidence may only advance `packaging` strategies; retention/watch evidence
   only `content`. `METRIC_DOMAINS` + `strategyDomain()` in the registry; analytics
   refuses cross-domain observations; seeds gain explicit `domain` (validated
   consistent with their targetMetric); the CI gate enforces it forever.
2. **Provenance laundering** — §17: only `youtube_api`-provenance metrics are
   admissible anywhere. `manual` numbers are stored but advance nothing;
   `simulated` stays radioactive. Legacy observations (no provenance field) keep
   today's behavior.
3. **Topic confounds** — observations carry `topicCluster`; when clusters are
   present, promotion requires holdout wins spanning ≥2 distinct clusters, so a
   topic effect can't masquerade as a style effect.
4. **Zombie rules** — `comments`/`observational` evidence enters at low confidence
   and **expires**: strategies with `expiresAfterVideos` that aren't validated in
   time retire automatically (`applyExpiry`). Comments-class evidence can move a
   strategy INTO testing but can never satisfy the promotion bar.
5. **Experiments are the fast path** — `lib/packaging-experiment.mjs` models
   YouTube's Test & Compare: primary + challenger packaging (both must pay off the
   same promise — Gate 0 applies to every arm), result ingestion that emits a
   holdout-cohort, experiment-class observation only from `youtube_api` provenance.

| id | criterion | verified by |
|----|-----------|-------------|
| F1 | A CTR observation can never advance a content-domain strategy (and vice versa) | property + BDD |
| F2 | Only youtube_api provenance is admissible; manual/simulated never promote; legacy unaffected | property + BDD |
| F3 | With topic clusters present, single-cluster holdout wins never promote; ≥2 clusters can | property + BDD |
| F4 | comments-class evidence moves documented→testing but never validates | BDD |
| F5 | An expired unvalidated strategy retires with the reason recorded; validated ones never expire | property + BDD |
| F6 | Experiment results build holdout/experiment observations only from youtube_api data; malformed arms/shares rejected | property + BDD |
| F7 | Every seed carries a domain consistent with its targetMetric; CI rejects mismatches | CI gate + tests |

## Phase G — gates + the visual QC harness (§11/§25)

`lib/gates.mjs` composes the existing validators into the v2 gate order, evaluating
Gate 0 (hard constraints) at every gate:
- **Gate A** (human, cheap-to-reject): packaging locked (promise present, claim paid
  off, grounding), script structure valid, narration spec fits. Code checks
  readiness; the human approves.
- **Gate B** (automated, pre-assembly): resolved-timeline invariants, scene QC
  aggregation, mastering checks, publishable assets.
- **Gate publish**: publish package valid incl. synthetic-voice disclosure.

`lib/scene-qc.mjs` is the §25 harness around the VLM:
- `stillPlan` — 3 stills per scene (start/mid/end) from the RESOLVED timeline.
- `contrastRatio`/`checkTokenContrast` — WCAG contrast math on brand tokens (code,
  not vibes: <3.0 blocks, <4.5 warns for display-size text).
- `expectedCaptionAt` — what word must be on screen at a still's timestamp (from
  revealSec) — the spot-check target the VLM compares against.
- `aggregateFindings` — findings → blocking scene list (feeds the per-scene
  re-render loop) vs warnings; unknown check ids fail closed.

| id | criterion | verified by |
|----|-----------|-------------|
| G1 | Still plan: exactly start/mid/end per resolved scene, all within the scene | property |
| G2 | Contrast: known ratios reproduce (black/white=21); block/warn thresholds honored | property + BDD |
| G3 | Caption spot-check returns exactly the word audible at the still's timestamp | property |
| G4 | Blocking findings produce a deduped re-render scene list; unknown checks fail closed | property + BDD |
| G5 | Gate A refuses unlocked packaging/invalid script; Gate B refuses QC/master failures; Gate 0 violations block at every gate | BDD |

## Phase H — capture-first (§7/§16/§20)

Real pixels for product demos. The runner needs a live app + browser; everything
decidable is a tested lib:
- `lib/capture-plan.mjs` — `buildCaptureSpec` (action vocabulary goto/click/type/
  hover/wait; selector rules; **deviceScale ≥ 2 enforced** for zoom headroom),
  `cursorTrackFromSteps` (positions are KNOWN from the script, not detected:
  deterministic timed track with eased moves + click events), `validateCursorTrack`
  (in-viewport, monotonic), `toPlaywrightScript` (emits the .spec.ts: fixed
  viewport, 2x scale, video on, cursor hidden, per-step boundingBox positions →
  cursor track JSON).
- Template `src/overlay.tsx` — Tier-1 components (§20): CursorOverlay (consumes the
  track), ClickRipple, FocusRing, CalloutLabel, ZoomPan, BrowserFrame — brand-token
  driven, composable over a capture video.
- Captured assets enter the manifest as `origin: "captured"` (the only origin
  `uiTruth` accepts — already enforced).

| id | criterion | verified by |
|----|-----------|-------------|
| H1 | Capture specs with unknown actions / missing selectors / sub-2x scale are rejected | property + BDD |
| H2 | Cursor track: deterministic, monotonic, in-viewport; click steps emit click events at their position | property |
| H3 | Emitted Playwright script carries viewport, 2x scale, every step in order, cursor-hide, track output | BDD |

## Phase I — scene grammars, alignment, fallbacks (§19/§6/§22)

- `script-model`: `buildBeatSheet({ format: 'education'|'demo'|'short' })` —
  demo grammar shows the UI by ≤8% of runtime (§13 `show_ui_early`; hero → reveal →
  cursor-action → transform → proof → benefit → cta), short grammar is
  hook-burst → proof → insight → cta. Motion presets for the new beats.
- `caption-timing.mergeAlignmentIntoCaptions` — upgrade `revealSec` to REAL
  whisperX word timestamps; word-count mismatches rejected per beat, never silently
  dropped. `tools/align-words.py` is the env-dependent runner.
- `asset-source.applyAssetFallbacks` — a missing asset placeholders + flags ONLY its
  scene (dirty list feeds the render cache); the rest render from cache (§22).

| id | criterion | verified by |
|----|-----------|-------------|
| I1 | Demo grammar reveals UI by ≤8% of runtime at any target length; short grammar ends on CTA | property + BDD |
| I2 | Alignment merge: real times replace estimates; count mismatch rejected with the beat named | property + BDD |
| I3 | Missing assets dirty exactly their scenes with flags; present assets untouched | property |

Completion = all criteria mapped to green tests, `npm run check` green, docs updated
(§18 Remotion Agent Skills note, §24 phase mapping in ROADMAP), CHANGELOG 0.10.0.
