# Departments

A **department** is one stage of the factory. Each is (or will be) a skill under
`skills/`, with a deterministic engine in `lib/` where the work can be made
exact/testable. Departments are separable on purpose so each can be measured and
**improved over time** independently — the maturity column tracks how far each has
come.

## Maturity levels

- **L0 — planned**: named, scoped, not built.
- **L1 — manual**: the skill guides Claude through the work; no deterministic engine.
- **L2 — engined**: has a tested `lib/` engine for its hard/decision logic.
- **L3 — measured**: its choices register experiments; outcomes feed the strategy
  library.
- **L4 — self-optimizing**: it re-weights / re-writes its own strategies from
  validated evidence.

## Registry

| # | Department | Does | Engine | Maturity |
|---|------------|------|--------|----------|
| 1 | **niche** | Pick a niche well: score candidates on demand/growth/monetization/saturation/differentiability/production-fit/repeatability/cost/durability | `lib/niche-score.mjs` | **L2** (skill: `niche-select`) |
| 2 | **brand** | Brainstorm + build the full brand suite & guide for the chosen niche; validate completeness before advancing | `lib/brand-brief.mjs` (+ `brand-studio` plugin) | **L2** (skill: `brand-suite`) |
| 3 | **research** | Find video ideas, validate demand, lock the packaged promise (title/thumb first) + a challenger for Test & Compare; reject unpaid-off clickbait; Gate A readiness | `lib/video-idea.mjs` + `lib/packaging-experiment.mjs` + `lib/gates.mjs` | **L2** (skill: `video-research`) |
| 4 | **script** | Write the script applying retention/story strategies (first-minute, crazy-progression, re-engagement beats) via a beat sheet + structure validator | `lib/script-model.mjs` | **L2** (skill: `script-write`) |
| 5 | **voice** | Narration spec + free local TTS (Kokoro default, Piper fallback); real per-beat durations + word reveal times out to `captions.json`; synthetic voice disclosed; never a fake human on screen | `lib/voice-spec.mjs` + `lib/caption-timing.mjs` | **L2** (skill: `voice-over`) |
| 6 | **motion** | Produce the visuals — **audio-first**: the timing solver resolves scene durations from the real narration (VO overruns bounce to script), then the parameterized timeline → Remotion-first motion graphics, per-scene render cache; **capture-first** for demos (real UI + branded overlay, deterministic cursor tracks); three §19 grammars (education/demo/short) | `lib/motion-plan.mjs` + `lib/timing-solver.mjs` + `lib/render-cache.mjs` + `lib/capture-plan.mjs` (+ Remotion) | **L2** (skill: `motion-graphics`) |
| 7 | **edit** | Assemble + tighten ("no dull moments"), master to −14 LUFS / −1 dBTP, run Gate B (scene-QC stills + contrast math + caption spot-checks → per-scene re-render list), final ship/block QA against hard constraints incl. research-only-never-published | `lib/edit-qa.mjs` + `lib/audio-mix.mjs` + `lib/gates.mjs` + `lib/scene-qc.mjs` | **L2** (skill: `edit-assemble`) |
| 8 | **package** | Title + thumbnail at the extremity the content can honestly pay off | — | L0 |
| 9 | **distribute** | Publish package: description/chapters/tags/end-screens + synthetic-voice disclosure, validated | `lib/distribution.mjs` | **L2** (skill: `distribution-publish`) |
| 10 | **analytics** | Ingest real metrics (youtube_api provenance only) → observations with domain/evidence-class/topic-cluster → attribute → promotion gate (cross-domain refused, single-cluster wins refused, comments never validate) → advance lifecycle + expire stale rules; Test & Compare is the fast path | `lib/analytics.mjs` + `lib/packaging-experiment.mjs` (+ `guards.mjs`) | **L2** (skill: `analytics-optimize`) |

## Building a new department

1. Add a row here at L0 with its inputs/outputs.
2. Write a skill under `skills/<dept>/SKILL.md` (procedure + which strategies it
   pulls). → L1.
3. Extract the hard/decision logic into a tested `lib/` engine. → L2.
4. Make its creative choices register `experiments` on the channel state. → L3.
5. Once it has validated strategies, let it re-weight itself. → L4.

The order of expansion is in `ROADMAP.md`. As of **v0.4.0**, the full chain is at
**L2**: niche → brand → research → script → voice → motion → edit → distribute →
analytics. The analytics department closes the optimization loop (ingest real metrics →
promotion gate → advance strategy lifecycle), which is the mechanism that lifts the
other departments from L2 to L3 (measured) and ultimately L4 (self-optimizing) as real
channel data accumulates. (Packaging, row 8, currently lives inside `video-research`.)
