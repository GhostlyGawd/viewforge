# ViewForge

**A self-improving YouTube channel factory, shipped as a Claude Code plugin.**

ViewForge brainstorms a niche and a brand, then runs a video from idea to published
asset — research → script → voice → motion → edit → package → distribute → measure —
and feeds what it measures back into a strategy library so the *next* video is made
better. The visual language is motion graphics, illustration, real footage, and
screen capture. **It never uses a fake human (an AI avatar pretending to be a real
person) as the on-screen visual.**

It is opinionated about one thing: it refuses to fool itself. Optimization is driven
by a **sourced, testable strategy library** with a lifecycle, and a hard
**anti-reward-hacking / anti-overfitting** layer in tested code.

```
/viewforge start a channel about <your interest>
```

## Why it's different

- **Evidence, not vibes.** Every optimization tactic is a *strategy* with a cited
  source and a lifecycle: `documented → testing → validated → retired`. The pipeline
  leans on what's been *proven on our own channels*, and clearly labels what's still
  just a documented claim. Seeded from the leaked **MrBeast production memos** and
  built to expand.
- **It won't game itself.** A strategy can only be `validated` with enough
  *out-of-sample* wins and **without sacrificing guard metrics** (no clickbait CTR
  that tanks watch-time). Fabricated/simulated numbers can never promote anything.
  See `ANTI-REWARD-HACKING.md`.
- **Organized as departments that improve over time.** niche · brand · research ·
  script · voice · motion · edit · package · distribute · analytics — each separable,
  each with a maturity level (`departments/README.md`).
- **State you can trust.** One channel = one validated, atomically-written,
  immutable project under `state/channels/<slug>/`.
- **Remotion-first production.** Programmatic React video → every visual element is a
  tweakable, A/B-testable parameter, which is exactly what the optimization loop
  needs.

## What's built (through v0.3.0)

The foundation plus **seven L2 departments** — a channel can go from "what's it about"
all the way to an edit-approved, render-ready video.

- **Strategy library**: schema + lifecycle + 9 source-cited MrBeast-memo seeds, with
  a CI gate that rejects any unsourced or malformed strategy.
- **Integrity + state libs** (zero-dep, 91 tests): `strategy-registry`, `guards`
  (hard constraints incl. no-fake-human + the promotion gate), `niche-score`,
  `niche-discovery`, `brand-brief`, `video-idea`, `script-model`, `voice-spec`,
  `motion-plan`, `edit-qa`, `state`.
- **Seven L2 departments** (`/viewforge`):
  1. **niche-select** — discover (autonomous cold-start) or brainstorm → ground →
     score → rank → commit a channel project.
  2. **brand-suite** — derive a brand brief, generate the suite via `brand-studio`,
     validate all seven deliverables, persist.
  3. **video-research** — ground ideas, lock the packaged promise, score, hard-block
     unpaid-off clickbait, lock the slate.
  4. **script-write** — retention beat sheet (first-minute / crazy-progression /
     re-engagement / no-dull / no-abrupt-end) + structure validator.
  5. **voice-over** — narration spec + free local TTS (Piper); synthetic voice
     disclosed, never a fake human on screen.
  6. **motion-graphics** — parameterized scene timeline (the A/B substrate) →
     Remotion-first render; blocks fake-human brands in code.
  7. **edit-assemble** — final ship/block QA: no dull moments + the hard constraints.

A worked example (Marginalia EP.01) takes all seven from a cold-start niche to a
plan-driven Remotion project + brand comps. Run `npm run check`. Roadmap in `ROADMAP.md`.

## Layout

```
.claude-plugin/      plugin + marketplace manifests
commands/            /viewforge — the factory router
skills/              departments (v0.1.0: niche-select)
lib/                 tested zero-dep engines: strategy-registry, guards, niche-score, state
strategy-library/    sourced, schema-valid strategies + SCHEMA + SOURCES
departments/         the department registry + maturity model
state/channels/      per-channel projects (live ones gitignored; _example checked in)
tools/               check-strategies (CI gate)
tests/               node --test suites (46)
ARCHITECTURE.md · ANTI-REWARD-HACKING.md · ROADMAP.md · harness/IMPROVEMENT-LOG.md
```

## The non-negotiables

1. No fake-human visuals — ever.
2. Every strategy is sourced; every promotion earns its way past the guards.
3. State is atomic, validated, immutable; mistakes are dogfooded into the harness as
   reproducing tests, not notes.

MIT licensed.
