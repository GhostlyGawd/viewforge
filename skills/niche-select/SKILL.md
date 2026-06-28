---
name: niche-select
description: >-
  Pick a YouTube niche well — brainstorm candidate niches for a goal/interest,
  ground each on demand, growth, monetization, saturation, differentiability,
  motion-graphics production fit, format repeatability, cost, and durability,
  score them with the transparent weighted engine, and commit the winner to a
  ViewForge channel project. The first department of the ViewForge factory.
when_to_use: >-
  When the user wants to choose or validate a YouTube niche, compare niche
  ideas, or start a new channel and needs to decide what it's about — e.g.
  "what niche should this channel be", "is X a good youtube niche", "pick a
  niche for a motion-graphics channel about Y", "start a viewforge channel".
argument-hint: "[goal / interest / candidate niches]"
allowed-tools: >-
  Read Write Edit Glob AskUserQuestion WebSearch WebFetch
  Bash(node *) Bash(mkdir *) Bash(echo *) Bash(ls *)
---

# Niche selection (ViewForge)

Choose a niche **repeatably and auditably**, not by vibe. The decision runs through
the tested engine in `lib/niche-score.mjs`, so the user can see exactly why one niche
beat another — and so the factor weights themselves become a strategy ViewForge can
improve over time. Then persist the choice into a channel project via
`lib/state.mjs`. No fake-human content is ever part of a recommended niche.

## 0. Cold start — autonomous discovery (when no seed is given)

If the operator gives **no interest** (or only a loose constraint like "something
that makes money"), don't ask them to come up with a topic — *discover* niches
yourself. This is the mode that most directly tests "picks niches well."

Sweep the web across the distinct **discovery lenses** in `lib/niche-discovery.mjs`
(`DISCOVERY_LENSES`: trending, high-RPM, faceless-format, whitespace, evergreen,
product-led) — run one search per lens (append the operator's loose constraint if
they gave one), and harvest candidate niche names from each, tagging which lens each
came from. Then normalize + dedupe + drop face-led niches with the engine:

```bash
node -e '
import("../../lib/niche-discovery.mjs").then(({dedupeCandidates, filterFaceless}) => {
  const fs = require("fs");
  const raw = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); // [{name, lenses:[id]}]
  const { kept, dropped } = filterFaceless(dedupeCandidates(raw));
  console.log(JSON.stringify({ kept, droppedFaceLed: dropped.map(d => d.name) }, null, 2));
})' discovered.json
```

Niches surfaced by **multiple lenses** are the strongest signals (real demand *and*
monetization *and* whitespace). Take the ~6–8 best deduped candidates into Step 3 for
grounding — discovery names the candidates, grounding still has to earn the score.
Then continue to Step 1 only to confirm goal/constraints implied by the pick.

## 1. Anchor the goal

Establish what the channel is *for* before brainstorming. From `$ARGUMENTS` and one
short exchange, capture: the operator's interest/expertise, any monetization goal,
hard constraints (motion-graphics only, no on-camera human), and how often they can
publish. If the user already named candidate niches, treat those as the seed set. **If
no seed was given, run Step 0 (cold start) first** and let discovery produce the
candidates.

## 2. Brainstorm candidates (don't settle early)

Produce **5–8 candidate niches** that fit the goal and the no-fake-human,
motion-graphics constraint. Span the space — different audiences, monetization
models, and production styles — so the ranking has real contrast, not five flavors of
one idea. For each, draft a one-line angle and the "wow factor" it could own.

## 3. Ground each candidate (the research that makes the score real)

For each candidate, fill the nine factors (0–10) with **evidence, not guesses**. Use
`WebSearch`/`WebFetch` to ground at least demand, growth, saturation, and
monetization; record where each number came from in the candidate's `notes`. The
factors:

| factor | 0 ……………………… 10 |
|--------|------------------|
| `demand` | tiny audience → huge search + watch volume |
| `growth` | declining → fast-growing trend |
| `monetization` | poor RPM, no products → high RPM + sponsors + product potential |
| `saturation` | flooded with strong incumbents → wide open *(lower is better — the engine inverts it)* |
| `differentiability` | nothing new to say → clear room for a distinct angle / wow factor |
| `productionFit` | needs a real on-camera human → perfect for motion graphics |
| `repeatability` | one-off topic → sustains a format engine of many videos |
| `productionCost` | very expensive/slow per video → cheap/fast *(lower is better)* |
| `passionDurability` | operator burns out fast → can sustain for years |

Don't fabricate factors to hit a number — that is exactly the reward-hacking the rest
of ViewForge guards against. A candidate you couldn't ground is reported as
ungrounded, not padded.

## 4. Score + rank

Write the candidates to a JSON array and run the engine:

```bash
node "$CLAUDE_SKILL_DIR/scripts/score-niches.mjs" candidates.json
```

It prints a ranked table with a **score (0–100)** and a **confidence (0–1 = share of
factors actually grounded)**, flags ungrounded candidates, and emits JSON. If the top
pick's confidence is below 0.7, **go back to Step 3** and source the missing factors
before committing — a high score on two grounded factors is a guess, not a pick.

To explore how sensitive the ranking is to priorities (e.g. the operator cares most
about monetization), re-run with `--weights weights.json`. Note that re-weighting is
itself a niche-selection strategy: if a weighting later proves predictive on real
channels, record it as a strategy observation rather than hard-coding it here.

## 5. Recommend + confirm

Give a tight readout: the top pick, its score and the 2–3 factors that won it, the
closest runner-up and why it lost, and the honest caveats (what's grounded vs
inferred). Use `AskUserQuestion` to confirm the pick or pivot — the operator owns the
final call.

## 6. Commit to a channel project

On confirmation, create the channel state (this is the project of record):

```bash
node -e '
import("../../lib/state.mjs").then(({createChannel}) => {
  const c = createChannel(process.env.VF_STATE_ROOT || "state",
    { name: process.argv[1], niche: JSON.parse(process.argv[2]) });
  console.log("created channel:", c.slug, "stage:", c.stage);
})' "<Channel Name>" "$(cat top-niche.json)"
```

(Or call `createChannel(root, { name, niche })` however is cleanest.) The niche object
stored should include the factors, the score, and the grounding notes/sources so the
decision is reproducible. Then tell the user the channel exists and the next
department is **brand** (`departments/README.md`).

## Definition of done

- [ ] Goal + constraints anchored (motion-graphics, no fake human).
- [ ] 5–8 contrasting candidates brainstormed with angles + wow factors.
- [ ] Each scored factor grounded in a cited source where it matters; ungrounded
      factors surfaced, not faked.
- [ ] Ranked via `score-niches.mjs`; top pick confidence ≥ 0.7 (or sent back to
      grounding).
- [ ] Recommendation given with the winning factors + honest caveats; user confirmed.
- [ ] Channel project created in state with the niche, score, and sources recorded.
