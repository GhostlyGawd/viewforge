# Changelog

All notable changes to ViewForge are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning is [SemVer](https://semver.org/).

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
