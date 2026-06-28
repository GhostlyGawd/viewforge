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
| 3 | **research** | Find video ideas, validate demand, lock the packaged promise (title/thumb first); reject unpaid-off clickbait | `lib/video-idea.mjs` | **L2** (skill: `video-research`) |
| 4 | **script** | Write the script applying retention/story strategies (first-minute, crazy-progression, re-engagement beats) via a beat sheet + structure validator | `lib/script-model.mjs` | **L2** (skill: `script-write`) |
| 5 | **voice** | Narration spec + free local TTS (Piper); synthetic voice disclosed; never a fake human on screen | `lib/voice-spec.mjs` | **L2** (skill: `voice-over`) |
| 6 | **motion** | Produce the visuals — parameterized scene timeline → Remotion-first programmatic motion graphics | `lib/motion-plan.mjs` (+ Remotion) | **L2** (skill: `motion-graphics`) |
| 7 | **edit** | Assemble + tighten ("no dull moments"), final ship/block QA against hard constraints | `lib/edit-qa.mjs` | **L2** (skill: `edit-assemble`) |
| 8 | **package** | Title + thumbnail at the extremity the content can honestly pay off | — | L0 |
| 9 | **distribute** | Publish, schedule, description/tags/end-screens, cross-post | — | L0 |
| 10 | **analytics** | Pull real metrics, attribute to experiments, run the promotion gate | `lib/guards.mjs` | L1 |

## Building a new department

1. Add a row here at L0 with its inputs/outputs.
2. Write a skill under `skills/<dept>/SKILL.md` (procedure + which strategies it
   pulls). → L1.
3. Extract the hard/decision logic into a tested `lib/` engine. → L2.
4. Make its creative choices register `experiments` on the channel state. → L3.
5. Once it has validated strategies, let it re-weight itself. → L4.

The order of expansion is in `ROADMAP.md`. As of **v0.3.0**, departments 1–7
(niche → brand → research → script → voice → motion → edit) are all at **L2** — a
channel can be taken from "what's it about" all the way to an edit-approved, render-
ready video. Departments 8–10 (distribute, analytics) are next; analytics closing the
loop is what unlocks L3 (measured) → L4 (self-optimizing) for the rest.
