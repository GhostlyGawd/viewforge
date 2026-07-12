# Changelog

All notable changes to ViewForge are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning is [SemVer](https://semver.org/).

## [0.10.0] — 2026-07-12

**Master Document v2 completion.** Everything in the v2 doc that belongs in a
Phase-0 plugin is now built and tested (245 tests, was 210). Built to
`plans/07-v2-completion.md`. The §24 Phase-1/2 service stack (Postgres/Redis/S3,
dashboard) is deliberately NOT built here — the filesystem contracts are the API
payloads it will lift, and ROADMAP documents the mapping.

### Added — the learning loop as a hypothesis engine (v2 §10/§17/§23)
- **Rule domains**: strategies carry `domain: packaging|content`, validated
  consistent with their targetMetric (CTR ⇒ packaging; retention/watch ⇒ content);
  `queryStrategies` slices by domain; all 10 seeds stamped; the CI gate enforces it.
  `evaluateStrategyEvidence` EXCLUDES cross-domain observations — one metric never
  writes the other domain's rules.
- **Metrics provenance** (§17): observations carry `provenance: youtube_api|manual|
  simulated`; only `youtube_api` is admissible anywhere (`isAdmissibleEvidence`);
  `manual` is stored but advances nothing; contradictions (`youtube_api` +
  `simulated:true`) are refused. Legacy observations keep their old semantics.
- **Topic-cluster confound guard**: when observations carry `topicCluster`, holdout
  wins must span ≥2 distinct clusters to promote — a topic effect can't masquerade
  as a style effect. Engages only when clusters are logged.
- **Evidence classes**: `experiment|observational|comments` — comments-class moves a
  rule into testing but can never satisfy the promotion bar.
- **Expiry** (`applyExpiry` + `expiresAfterVideos`): unvalidated rules retire when
  their window passes; `ground-quantified-claims` (the internal hypothesis) now
  carries a 10-video window. Validated rules never expire this way.
- **`lib/packaging-experiment.mjs`** — thumbnail Test & Compare as a first-class
  object: primary + challenger must pay off the SAME promise (no dishonest arm);
  results ingest as holdout, experiment-class observations — the fast out-of-sample
  path — and only from `youtube_api` provenance.

### Added — gates + the visual QC harness (v2 §11/§25)
- **`lib/gates.mjs`** — the v2 gate order composed from existing validators, with
  Gate 0 (hard constraints) evaluated at EVERY gate: Gate A (packaging locked +
  grounded + script structure + narration fit; cheap to reject), Gate B (resolved-
  timeline invariants + scene QC + master + publishable assets → `rerenderScenes`
  feeds the per-scene loop), Gate publish (package + synthetic-voice disclosure).
- **`lib/scene-qc.mjs`** — the harness around the VLM: `stillPlan` (start/mid/end
  per RESOLVED scene), WCAG contrast math (`contrastRatio`, thresholds 3:1 block /
  4.5:1 warn — and it flagged the house accent at 4.09:1 as borderline),
  `expectedCaptionAt` (the word that MUST be on screen at a still's timestamp),
  `aggregateFindings` (fail-closed on unknown checks; explicit severity may
  escalate, never downgrade).

### Added — capture-first (v2 §7/§16/§20)
- **`lib/capture-plan.mjs`** — the capture contract (goto/click/type/hover/wait,
  labels required, **deviceScale ≥ 2 enforced**), `cursorTrackFromSteps`
  (deterministic timed track — positions KNOWN from the script, never detected;
  smoothstep moves, click events at their position), `validateCursorTrack`,
  `toPlaywrightScript` (fixed viewport, 2x, video on, OS cursor hidden, boundingBox
  positions → cursor-track JSON).
- **Template `src/overlay.tsx`** — the §20 Tier-1 components: `CursorOverlay`,
  `ClickRipple`, `FocusRing`, `CalloutLabel`, `ZoomPan` (crisp because captures are
  2x), `BrowserFrame`, and the composed `CaptureScene`. Not registered as a
  composition — the template builds without capture assets.

### Added — scene grammars, alignment, fallbacks (v2 §19/§6/§22)
- **`buildBeatSheet({format})`** — three grammars: `education` (unchanged),
  `demo` (hero → ui-reveal → cursor-action → transform → proof → benefit → cta;
  the validator enforces §13 `show_ui_early`: real UI by ≤8% of runtime), `short`
  (hook-burst → proof → insight → cta). Motion presets for every new beat.
- **`mergeAlignmentIntoCaptions`** — upgrades `revealSec` to REAL whisperX word
  timestamps: word-count and transcript mismatches refused with the beat named
  (punctuation/case-insensitive), inter-beat grace spill clamped down, never late.
  `tools/align-words.py` is the env-dependent runner.
- **`applyAssetFallbacks`** (§22) — a missing asset placeholders + flags ONLY its
  scene; `dirtySceneIds` feeds the render cache; input plan never mutated.

### Changed
- Skills updated: research gains the challenger/Test & Compare step + Gate A;
  analytics gains provenance/domain/cluster/expiry procedure; motion gains the
  capture-first section, the §18 `npx skills add remotion` bootstrap, and the format
  grammars; edit gains the full Gate-B still-review procedure.
- `harness/IMPROVEMENT-LOG.md`: dogfooded the caption rounding incident (reveal
  times must floor — a caption may be early, never late) with its reproducing
  property test.

## [0.9.0] — 2026-07-12

**Audio-first timing — the Master Document v2 adoption.** Scene durations are now
SOLVER OUTPUTS derived from the real narration audio, not beat-sheet guesses; renders
cache per scene; the master bus gets enforceable loudness targets; captions go
timestamp-first; asset provenance is enforced in code. Built to a written plan
(`plans/06-audio-first-v2.md`), property + BDD tested. 210 tests (was 159). The v2
doc's "integrity layer" (§27) is *adapted from ViewForge*, so this release adds the
audio-first production core around the guards that already existed.

### Added — the timing solver (v2 §15, the doc's "biggest change")
- `lib/timing-solver.mjs` — scenes author only constraints (`minMs`/`maxMs`/
  `padAfterMs`); the solver assigns `resolvedStartMs`/`resolvedDurationMs` from the
  measured VO. Overflow **bounces to script with an explicit word budget**
  (⌊maxMs/1000 × 2.5 wps⌋) — voice is never stretched beyond ±4% (enforced). Underflow
  becomes a recorded visual **hold**, never dead air. Total drift beyond ±10% of
  target flags review. The solver is the only writer of resolved fields (input
  carrying them is rejected); `validateResolvedTimeline` re-checks invariants;
  `toCaptionBeats` emits the caption shape from the same resolved truth.
- `lib/motion-plan.mjs` — `applyResolvedTimeline(plan, solved)` rewrites scene
  seconds/frames from solver output, immutably, with `timingSource` provenance
  (`'authored'` → `'audio-solver'`); partial mappings throw.

### Added — mastering targets + Gate-B audio checks (v2 §6/§21/§25)
- `lib/audio-mix.mjs` — `MASTER_TARGETS` (−14 LUFS integrated ±1 LU, −1 dBTP,
  silence-gap ceiling 700 ms, duck window, ±4% stretch cap), `validateMaster` over
  MEASURED values (never intentions), `silenceGaps` (head/tail count too),
  `duckDepthDb`, and `ffmpegLoudnormArgs` (pure two-pass loudnorm builder).
- **Duck window adopted**: music now ducks 12–15 dB under narration (v2 §6) instead
  of vanishing — `MIX_DEFAULTS.duckDb` −30 → **−19** (13 dB duck); both template
  compositions updated to match (0.05 → 0.22 under speech).

### Added — per-scene render cache + concat plan (v2 §6/§22)
- `lib/render-cache.mjs` — `renderKey = sha256(scene + brandVersion + assetHashes +
  rendererVersion)` over canonical JSON (ambiguity rejected: non-finite numbers
  throw; asset hashes are a set), `planSceneRenders` (only cache misses render),
  `dirtyScenes` (a one-scene edit dirties exactly that scene), `concatPlan` (refuses
  codec-param mismatches instead of silently re-encoding; demuxer-safe escaping).

### Added — timestamp-first captions (v2 §6)
- `lib/caption-timing.mjs` — `weightedRevealTimes` (char-weighted within the beat's
  REAL audio duration), `normalizeAlignedWords` (whisperX-style timestamps; rejects
  non-monotonic alignment; floors to ms so a caption may appear ≤1ms early, never
  late), `revealedIndexAtTime` (words appear WITH the voice: −1 before the first
  word), `revealSec` validation in `validateCaptionBeats`.
- `tools/synth-voice.py` emits per-word `revealSec` into `captions.json`;
  `CaptionVideo` consumes it (even split kept as fallback). whisperX forced
  alignment documented as the upgrade path to true timestamps.

### Added — asset provenance enforcement (v2 §8/§16)
- `lib/asset-source.mjs` — `origin` (`captured|generated-ai|licensed|owned|
  research-only`), `isPublishable`; **research-only is never publishable** regardless
  of license, refused at bind time (`bindAssetsToPlan` throws) AND at assembly
  (`validatePlanAssets`, edit-QA); `generated-ai` must log `genai {model, prompt,
  seed}` for reproducibility; `uiTruth` requires `origin: 'captured'` — never
  genAI-fake the product UI.
- `lib/guards.mjs` — new hard constraint **`research-only-never-published`** (block).
- `lib/edit-qa.mjs` — `runEditQa` accepts the asset manifest and scans the actual
  timeline; the computed signal beats whatever the plan claims about itself.

### Changed
- Skills updated to the audio-first order: voice-over → **timing solver** →
  motion-graphics → edit-assemble (+ mastering step with the loudnorm two-pass and
  Gate-B audio checklist).

### Deferred (tracked in ROADMAP, deliberately)
- Strategy expiry/confidence labels (v2 §23), VLM QC on per-scene stills (§25 visual
  half), Playwright capture-first demos (§7), Remotion Automators licensing at scale (§3).

## [0.8.0] — 2026-06-28

Much better voice + real rhythm (from user feedback: Piper sounded like TTS, visuals were static).

### Added
- **Kokoro voice (default)**: tools/synth-voice.py synthesizes per-beat narration with the
  am_michael voice — markedly more natural than Piper, still free + fully local. voice-spec
  now defaults to Kokoro. (Human-grade = ElevenLabs, paid, operator opt-in.)
- **Audio-driven, word-synced captions**: the template gains a CaptionVideo composition whose
  timing comes from the real narration (captions.json), revealing words in sync with the
  voice over continuously-moving full-bleed archival photos — continuous rhythm vs static
  cards. Reveal/window logic is the property+BDD-tested lib/caption-timing.mjs. 159 tests (was 151).

## [0.7.0] — 2026-06-28

Archival imagery + music/sound design — the render now looks and sounds like a real
channel. Built to a written plan (`plans/05-archival-imagery-and-audio.md`) and gated on
**property + BDD tests** (zero-dep harness in `tests/helpers/`).

### Added — Phase A: archival imagery
- `lib/asset-license.mjs` — rights-clean gate: PD/CC0/CC-BY/CC-BY-SA usable; **NC** (channel
  is monetized) and **ND** (we composite) and unknown rejected; CC-BY needs attribution.
- `lib/asset-source.mjs` — normalize → filter (license + ≥1280px + provenance) → dedup →
  auditable manifest; plan↔manifest binding/validation.
- `tools/fetch-assets.mjs` — Openverse + LoC fetch using the tested gate. The template's
  `ArchivalImage` composites a Ken-Burns photo under a scrim with an on-screen credit.
- Success criteria **A1–A4** each covered by property/BDD tests; **A5** proven — real CC0
  1899 fruit-packing photos composite into the comma-story scenes.

### Added — Phase B: music + sound design
- `lib/audio-mix.mjs` — narration-priority mix: the music bed **ducks under narration**
  (a fixed dB margin), fades, SFX placed at beat cues; with a validator.
- `tools/synth-audio.mjs` — generates a rights-clean (CC0) ambient bed + SFX in pure Node
  (no keys). The composition plays the ducked bed + a comma "slam" SFX.
- Success criteria **B1–B4** each covered by property/BDD tests; **B5** proven — a rendered
  clip has narration intelligible over the bed (~20 dB separation) + the SFX.

### Test harness
- `tests/helpers/prop.mjs` (seeded `forAll`) + `tests/helpers/bdd.mjs`
  (`feature`/`scenario`/`given`/`when`/`then`). 151 tests (was 122).

## [0.6.0] — 2026-06-28

### Changed
- **Much more dynamic motion** in the render template: a living drifting-glow background (no more dead-flat black), kinetic word-by-word headlines that spring in, a **money counter** that ticks to the figure, a **bar chart** of comparable cases, plus the existing timeline sweep / wax-seal. Includes an example bespoke set-piece (the comma-split mechanism) — the reusable primitives (LivingBg, Kinetic, MoneyCounter, CaseBars) are generic; the killer per-video "wow" scenes are meant to be authored per story. Verified the rendered clip carries loud, synced narration (the earlier "no sound" was a muted preview, not a missing track).

## [0.5.2] — 2026-06-28

### Added
- **Mobile channel-plan viewer**: `tools/export-plans.mjs` renders every channel (niche, brand + palette swatches, locked video slate) into a single responsive `docs/index.html`, served via GitHub Pages so the operator can review plans from a phone. Live state stays local; the page is a small derived snapshot.

## [0.5.1] — 2026-06-28

### Fixed
- Widened the Remotion render-template deps to caret ranges (`^4.0.350`) so fresh installs pull patched versions — the exact `4.0.0` pin carried transitive advisories. The plugin core remains zero-dependency and is unaffected.

## [0.5.0] — 2026-06-28

Audio-first-class rendering, motion set-pieces, and a ready-to-drive YouTube upload path.

### Added
- **Audio as a first-class render input**: `motion-plan.mjs` now carries an optional
  `audioFile`; the template renders the narration `<Audio>` only when the plan supplies
  it (audio only — never a fake human). The voice department's WAV flows straight into
  the render with no ffmpeg.
- **Motion set-pieces** in the template: a **timeline sweep** with ticking years on the
  progression beat (the visual form of "compress time / crazy progression") and a
  self-drawing **map-morph** border line on the escalation/wow-factor beat.
- **YouTube upload path**: `lib/youtube-upload.mjs` builds + validates the Data API
  `videos.insert` request from a publish package (defaults to **private**, Education
  category, surfaces the synthetic-media disclosure, supports `publishAt` scheduling).
  It does NOT upload — that needs the operator's OAuth credentials + consent; the
  `distribution-publish` skill documents the one-time setup. 122 tests (was 113).

### Validated (local channel state)
- Rendered a real **25-second clip with synced Piper narration** (frames 0-750) and
  set-piece stills (timeline sweep at 1875, map-morph) — the full motion+audio pipeline
  producing a watchable artifact.

## [0.4.1] — 2026-06-28

Production polish + multi-channel validation.

### Added
- **Reusable Remotion render template** (`assets/remotion-template/`): brand-agnostic,
  driven entirely by `motion-plan.json` + `script.json`. Polish: logo sting, paper-grain
  texture, animated ink-draw margin rule, wax-seal stamp on the payoff, map-morph drift,
  and number accenting. The `motion-graphics` skill now scaffolds from it. Replaces the
  per-video inline composition with one maintained, committed template.

### Validated (on local channel state, not committed)
- **Piper voiceover proven**: `piper-tts` (free, local) synthesized vid-1's 467-word
  narration to a real 159s WAV, wired into the composition as a native Remotion `<Audio>`
  (no ffmpeg needed). Confirms the voice department's free-TTS path end to end.
- **Factory repeatability**: stood up the two tabled niches as full channels —
  **Wellspring** (senior-health micro-explainers) and **First Trade** (fintech how-to) —
  each niche→brand→research with a validated brand + locked slate, from the same engines.
- vid-1 publish package built + validated (chapters + cited sources + AI-voice disclosure).

## [0.4.0] — 2026-06-28

The optimization loop closes. The full niche→…→analytics chain is L2, and ViewForge can
now learn from a published video — without ever learning from fabricated data.

### Added
- **distribution department (L2)**: `lib/distribution.mjs` — SEO description with
  chapters (first at 00:00) + cited sources, deduped tag set within budget, end-screen
  plan, and the synthetic-voice disclosure; with a validator. `skills/distribution-publish/`
  (does not auto-publish — uploading is left to the operator).
- **analytics department (L2) — the loop-closer**: `lib/analytics.mjs` — ingest real
  metrics → observations (signed deltas vs baseline) → attribute to strategies → run the
  promotion gate → advance the lifecycle (documented/hypothesis → testing → validated →
  retired). Verified: identical numbers promote when real and are refused when
  `simulated`. `skills/analytics-optimize/`.
- **Recursive strategy generation**: the first internally-generated strategy,
  `ground-quantified-claims` (internal-source, `hypothesis`), created from the
  IMPROVEMENT-LOG — it must earn validation like any other.
- **Dogfooded grounding guard**: `lib/video-idea.checkClaimGrounding` flags any
  quantified/superlative title claim lacking a `claimSource`.
- 110 tests (was 91); 10 strategies (9 documented + 1 hypothesis).

## [0.3.0] — 2026-06-28

The production vertical slice — a channel can now go all the way to an edit-approved,
render-ready video. Departments 1–7 are L2.

### Added
- **script department (L2)**: `lib/script-model.mjs` — a retention beat sheet that
  encodes the strategies (first-minute over-investment, crazy progression, scheduled
  re-engagement beats, no dull moments, no abrupt ending) and scales to any runtime,
  plus a structure validator. `skills/script-write/`.
- **voice department (L2)**: `lib/voice-spec.mjs` — narration spec (per-beat text +
  SSML + timing + fit check) and a free/self-hosted TTS recommendation (Piper default;
  Coqui XTTS / Kokoro alternates). `skills/voice-over/`.
- **motion department (L2)**: `lib/motion-plan.mjs` — a parameterized scene timeline
  (every visual element a tweakable knob = the A/B substrate) that blocks fake-human
  brands in code. `skills/motion-graphics/` + a runnable Remotion project scaffold.
- **edit department (L2)**: `lib/edit-qa.mjs` — final ship/block gate (no-dull-moments
  scan, narration-coverage check, and the hard constraints incl. no fake human).
  `skills/edit-assemble/`.
- **Proof run**: produced Marginalia EP.01 end-to-end — grounded script, narration
  spec, motion plan, brand SVG comps (thumbnail + title card), and a plan-driven
  Remotion project; edit-QA passed with zero blocking issues.
- Command router now walks niche→…→edit; department registry + roadmap updated;
  improvement-log entry on grounding quantified title claims. 91 tests (was 68).

## [0.2.1] — 2026-06-28

### Added
- **Cold-start (autonomous) niche discovery**: `lib/niche-discovery.mjs` —
  `DISCOVERY_LENSES` (six distinct web-search angles: trending, high-RPM,
  faceless-format, whitespace, evergreen, product-led), name normalization with
  lightweight plural folding, duplicate merging (unions the lenses a niche surfaced
  from), and a faceless-friendliness filter that drops inherently on-camera niches.
  The niche-select skill gains a Step 0 so it can discover and rank niches with no
  seed from the operator. 68 tests (was 62).

## [0.2.0] — 2026-06-28

The brand and research departments — a channel can now go from a chosen niche to a
locked, packaged video slate.

### Added
- **brand department (L2)**: `lib/brand-brief.mjs` derives a structured brand brief
  from the niche (motion-graphics, no-fake-human) and validates the returned brand
  record against all seven required deliverables before the channel may advance;
  `skills/brand-suite/` wraps the `brand-studio` plugin for the creative generation.
- **research department (L2)**: `lib/video-idea.mjs` scores video ideas on packaging
  extremity, demand, motion-graphics fit, and format novelty — encoding the
  `thumbnail-title-extremity`, `package-before-you-produce`, and `format-novelty`
  strategies as code — and **hard-blocks** any idea whose claim the content won't pay
  off (`no-deceptive-clickbait`). `skills/video-research/` brainstorms, grounds, ranks,
  cuts, and locks the slate into channel state.
- **State helpers** `setBrand` and `addVideo` (immutable, validated, logged).
- Command router now walks niche → brand → research; department registry + roadmap
  updated; 62 tests (was 46).

## [0.1.0] — 2026-06-28

Foundation release — the self-improving harness and its first working department.

### Added
- **Plugin scaffold**: `plugin.json` / `marketplace.json`, MIT license, CI workflow,
  `npm run check` (strategy validation + tests + manifest check).
- **Strategy library**: JSON schema + lifecycle (`documented → testing → validated →
  retired`), provenance rule (no anonymous claims), and **9 source-cited strategies**
  seeded from the leaked MrBeast production memo (first-minute retention, crazy
  progression, re-engagement beats, thumbnail/title extremity, package-first, wow
  factor, no dull moments, brand-deals-as-content, format novelty). CI gate
  `tools/check-strategies.mjs` rejects any unsourced/malformed strategy.
- **Integrity + state libs** (zero-dependency, 46 tests):
  - `lib/strategy-registry.mjs` — load/validate/query strategies (schema authority).
  - `lib/guards.mjs` — hard constraints (incl. **no fake-human visual**, no
    fabricated metrics, no deceptive clickbait) + the promotion gate (anti-overfit
    via out-of-sample requirement, anti-Goodhart via guard metrics, no promotion on
    simulated data).
  - `lib/niche-score.mjs` — transparent weighted niche scoring with direction
    correction + grounding confidence.
  - `lib/state.mjs` — atomic, schema-validated, immutable per-channel project state.
- **niche-select department** (`skills/niche-select/` + `/viewforge`): brainstorm →
  ground → score → rank → commit a channel project, with a CLI front-end
  (`score-niches.mjs`).
- **Docs**: `ARCHITECTURE.md`, `ANTI-REWARD-HACKING.md`, `ROADMAP.md`, the department
  registry + maturity model, and the harness improvement log.

### Notes
- The 9 seeds are `documented`, not `validated` — they come from one creator/era of
  live-action content and must be re-tested on ViewForge's own motion-graphics,
  no-fake-human channels before being trusted. That re-testing is the v0.4.0 loop.
