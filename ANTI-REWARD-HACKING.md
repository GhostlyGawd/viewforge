# Anti-reward-hacking & anti-overfitting

A system that optimizes its own success metrics will, if you let it, learn to move
the metric instead of the thing the metric was supposed to represent. For a content
factory that is not a hypothetical — it is the default failure mode. This document is
the contract for keeping ViewForge honest. The rules here are enforced in
`lib/guards.mjs` and covered by `tests/guards.test.mjs`.

## The failure modes we actively defend against

### 1. Goodhart / reward hacking
> "When a measure becomes a target, it ceases to be a good measure."

Raising click-through with a thumbnail the video doesn't pay off raises CTR and
destroys trust, AVP, and like-ratio. **Defense:** every strategy declares
`guardMetrics` alongside its `targetMetric`. A strategy that lifts its target while
dropping a guard past tolerance is **rejected at promotion** and **flagged at QA**
(`detectGoodhart`). You cannot buy a target metric by sacrificing a guard.

### 2. Overfitting
Declaring victory from the same videos a tactic was tuned on — or from noise.
**Defense:** promotion requires a **minimum sample size** *and* **out-of-sample
(holdout) wins** on videos the strategy never saw. Five wins on the training set is
not a win.

### 3. Fabricated / simulated data
The easiest way to "win" is to invent the numbers. **Defense:** observations tagged
`simulated:true` can never promote a strategy, and `metricsSource:"fabricated"` is a
hard-blocked plan. Real analytics or nothing.

### 4. Deceptive packaging
A clickbait promise the content doesn't deliver. **Defense:** the
`no-deceptive-clickbait` hard constraint blocks any packaging marked as not paid off,
regardless of predicted CTR.

### 5. Fake humans (a product-integrity line, not a metric one)
The `no-fake-human-visual` hard constraint blocks any plan that renders a synthetic
human presented as real. This is non-negotiable and independent of performance.

## The dogfooding rule (improving the harness without overfitting to incidents)

When ViewForge takes a wrong action, the correction is folded back into the harness —
**but** the same anti-overfitting discipline applies to the *fix*:

1. **Reproduce, don't anecdote.** A mistake becomes a *failing test* or a concrete
   guard rule, not a vague "be more careful" note.
2. **Generalize the rule, not the example.** Fix the class of error, not the single
   string that triggered it. (Patching exactly one bad title teaches nothing.)
3. **Don't let the fix create a new metric to game.** Adding a guard must not create
   an incentive to satisfy the guard cosmetically. Prefer guards that are expensive
   to fake and cheap to satisfy honestly.
4. **Log it.** Every harness change from an incident is recorded in
   `harness/IMPROVEMENT-LOG.md` with the reproduction and the generalization.

## Confidence is deliberately conservative

`evaluatePromotion` caps confidence and scales it with sample size and out-of-sample
agreement, so the library under-trusts itself rather than over-trusts. A validated
strategy is a *current best bet with evidence*, not a law — and strategies **decay**
past their review horizon, because the platform moves and yesterday's win becomes
today's cliché.
