# ViewForge — roadmap

Versioned, incremental. Each milestone ends green (`npm run check`) and leaves the
plugin usable. The north star: a channel whose every video is measurably better than
the last, produced end-to-end with no fake humans, optimized by evidence not opinion.

## v0.1.0 — foundation (this release)
- [x] Plugin skeleton, CI, conventions matching the repo's other plugins.
- [x] Strategy library: schema + lifecycle + 9 MrBeast-memo seeds, all sourced;
      CI gate (`check-strategies`).
- [x] Integrity + state libs: `strategy-registry`, `guards` (anti-reward-hack + hard
      constraints incl. no-fake-human), `niche-score`, `state` — 46 tests green.
- [x] First department end-to-end: **niche-select** (L2) with `/viewforge`.
- [x] Architecture, anti-reward-hacking doctrine, department registry, improvement log.

## v0.2.0 — brand + research departments (first real channel)
- [ ] **brand** department: wrap the existing `brand-studio` plugin to produce the
      full brand suite + guide for the chosen niche; persist into channel state.
- [ ] **research** department: idea generation + demand validation; lock the
      packaged promise (title/thumb) before production (`package-before-you-produce`).
- [ ] Stand up one real channel project end-to-end through `research`.
- [ ] Mine source corpus #2 (Paddy Galloway / retention teardowns / Creator Insider)
      → 10+ new `documented` strategies.

## v0.3.0 — production vertical slice (a video exists)
- [ ] **script** department applying validated retention/story strategies.
- [ ] **motion** department: Remotion project scaffold; every visual element a
      tweakable parameter (the A/B substrate).
- [ ] **voice** (synthetic + disclosed) and **edit** (assemble + "no dull moments"
      QA against hard constraints).
- [ ] First full video rendered for the real channel.

## v0.4.0 — the optimization loop closes
- [ ] **analytics** department: ingest real metrics, attribute to experiments, run
      `evaluatePromotion`. Strategies start moving `documented → testing → validated`.
- [ ] Experiment harness: A/B variants of a single strategy across videos, holdout
      cohort tracking.
- [ ] First strategy validated (or retired) on ViewForge's own evidence.

## v0.5.0 — recursion + self-improvement
- [ ] Internal strategy generation (`source.kind:"internal"`) → hypothesis → test.
- [ ] Department self-re-weighting (niche factor weights learned from outcomes).
- [ ] Harness self-audit: surface mistakes → dogfood into tests/guards automatically.

## Tooling gaps to resolve (search-first, then build)
Per the brief, when a capability is missing: find a free/forkable tool first, adopt
or wrap it; only build if nothing fits, and note it here.

| Need | Status | Plan |
|------|--------|------|
| Programmatic video render | chosen | **Remotion** (open-source, React) |
| TTS / narration | open | evaluate Piper / Coqui / XTTS (self-host, free) before paid APIs |
| Thumbnail composition | open | Remotion still-frame or `sharp`-based compositor |
| Captions / subtitles | open | whisper.cpp (local, free) |
| Real analytics ingest | open | YouTube Data/Analytics API (official) |
| B-roll / music (rights-clean) | open | catalog of CC0 / licensed sources; never fake-human footage |

## Non-negotiables (carried in every version)
- No fake-human visuals (`no-fake-human-visual` hard constraint).
- Every strategy sourced; every promotion earns its way past the guards.
- State is atomic, validated, immutable; mistakes are dogfooded into the harness.
