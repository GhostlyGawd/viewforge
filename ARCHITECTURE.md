# ViewForge — architecture

ViewForge is a **self-improving YouTube channel factory**: it brainstorms a niche
and brand, then runs a video from idea to published asset — research → script →
voice → motion → edit → package → distribute → measure — and feeds what it measures
back into a strategy library so the *next* video is made better. No fake-human
avatars; the visual language is motion graphics, illustration, real footage, screen
capture, and disclosed stylized characters.

It is built as a Claude Code plugin so it can version, test, and improve itself like
any other product in this repo.

## The three layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  ORCHESTRATION   /viewforge command  →  per-stage skills (departments)│
│  "run the channel"   niche · brand · research · script · voice ·      │
│                       motion · edit · package · distribute · analytics│
├─────────────────────────────────────────────────────────────────────┤
│  KNOWLEDGE        strategy-library/  — sourced, testable, versioned    │
│  "what works"     lifecycle: documented → testing → validated → retired│
├─────────────────────────────────────────────────────────────────────┤
│  INTEGRITY + STATE   lib/  — deterministic, tested, zero-dep           │
│  "don't fool        guards.mjs (anti-reward-hack / hard constraints)   │
│   yourself, don't   strategy-registry.mjs · niche-score.mjs · state.mjs│
│   lose state"                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 1. Orchestration — departments

A **department** is one stage of the factory, shipped as a skill under `skills/`.
Departments are deliberately separable so each can be measured and improved on its
own (the brief: "improve each department's ability over time"). Each department:

- reads the relevant **validated** strategies from the library for its stage
  (`queryStrategies(..., { appliesTo: 'script', status: 'validated' })`),
- does its job against the channel's **state**,
- records what it did to the channel's append-only `log`,
- where it makes a creative choice it can later measure, registers an **experiment**
  so the choice becomes evidence, not a one-off.

`departments/README.md` is the registry: every department, its maturity level, and
its inputs/outputs.

### 2. Knowledge — the strategy library

The library (`strategy-library/`) is what makes ViewForge improve instead of just
repeat. Each strategy is a sourced, schema-valid JSON claim with a lifecycle. The
pipeline leans on **validated** strategies by default and treats **documented** ones
(the MrBeast seeds) as hypotheses to test. See `strategy-library/SCHEMA.md`.

Recursion: ViewForge also *generates* new strategies (`source.kind:"internal"`),
which enter as `hypothesis` and must earn validation exactly like external ones — so
the system can invent its own tactics without trusting them prematurely.

### 3. Integrity + state — the libs

The load-bearing zero-dependency, fully-tested modules (each department's engine
lives beside these; the full list is `lib/`):

| module | responsibility |
|--------|----------------|
| `lib/strategy-registry.mjs` | load / validate / query strategies; the schema authority |
| `lib/guards.mjs` | hard constraints (incl. **no fake-human visual**, **research-only never published**) + the promotion gate (anti-overfit, anti-Goodhart, no fabricated data) |
| `lib/niche-score.mjs` | transparent weighted niche scoring (the niche department's engine) |
| `lib/state.mjs` | atomic, schema-validated, immutable per-channel project state |
| `lib/timing-solver.mjs` | **audio-first timing**: scene durations solved from the real narration; overflow bounces to script with a word budget; voice never stretched > ±4% |
| `lib/render-cache.mjs` | per-scene render identity (content-hash keys) + codec-strict concat plan — an edit re-renders one scene, not the video |
| `lib/audio-mix.mjs` | narration-priority mix (12–15 dB duck) + mastering targets (−14 LUFS / −1 dBTP) with Gate-B audio checks over measured values |
| `lib/gates.mjs` | the v2 gate order composed: Gate 0 at EVERY gate; A (packaging/script readiness), B (QC + master + assets → per-scene re-render list), publish (disclosure) |
| `lib/scene-qc.mjs` | the Gate-B visual harness: stills from the resolved timeline, WCAG contrast math, caption spot-check targets, fail-closed findings aggregation — the VLM judges, the policy is code |
| `lib/packaging-experiment.mjs` | thumbnail Test & Compare: challenger packaging, result ingestion → holdout experiment-class evidence, youtube_api provenance only |
| `lib/capture-plan.mjs` | capture-first demos: the §16 contract (2x scale enforced), deterministic cursor tracks from scripted steps, the Playwright script emitter |

Why deterministic libs under the agentic skills? Because the parts that must "make
no mistakes" — never overwrite state, never promote a gamed strategy, never ship a
fake human — must be *testable code*, not model judgment. The skills bring
creativity; the libs bring guarantees.

## Data flow for one video

```
niche(state) ─▶ brand(state) ─▶ research(state) ─▶ plan a video
       │
       ▼
   for the video:  script ─▶ voice ─▶ TIMING SOLVER ─▶ motion ─▶ edit ─▶ package
       │                 (audio-first: the real narration's measured durations
       │                  resolve the scene timeline; VO overruns bounce back to
       │                  script with a word budget. each stage pulls validated
       │                  strategies, checked against HARD_CONSTRAINTS before render)
       ▼
   distribute ─▶ measure (CTR/AVD/AVP/retention/likeRatio …)
       │
       ▼
   attribute results to the experiments that produced them ─▶ observations
       │
       ▼
   evaluatePromotion()  ──promote──▶ strategy becomes `validated`
                         ──reject───▶ stays `testing` / `retired` (logged why)
```

## State model

One channel = one project under `state/channels/<slug>/channel.json`, owned by
`lib/state.mjs`. The schema (`channel.json`): `stage`, `niche`, `brand`, `videos[]`,
`experiments[]`, and an append-only `log[]`. Writes are atomic and validated, updates
are immutable, and stage can't silently move backward. A checked-in
`state/channels/_example/` shows the shape; live channels are gitignored (they grow
large with rendered media and are regenerable).

## Self-improvement of the harness itself

When ViewForge makes a mistake (a department produced a bad output, a guard missed a
case), the fix is **dogfooded back into the harness**: a failing test or a new guard
rule, logged in `harness/IMPROVEMENT-LOG.md`. The discipline mirrors the strategy
guards — improvements must be real (a reproducing test), not just a note, and must
not overfit to the single incident. See `ANTI-REWARD-HACKING.md`.

## Capability gaps

When a department needs a tool ViewForge doesn't have (a renderer, a TTS engine, a
caption generator), the rule is: **search the web for a free/forkable tool first**,
adopt or wrap it; if nothing fits, note the gap in `ROADMAP.md` and build the
smallest thing that works. The render path is Remotion-first (programmatic React
video → every visual element is a tweakable, A/B-testable parameter).
