# Strategy library — schema & lifecycle

A **strategy** is one research-backed, source-cited, *testable* claim about how to
make a YouTube channel succeed. Each strategy is a single JSON file under
`strategies/`. `lib/strategy-registry.mjs` is the authority for this schema — the CI
gate (`tools/check-strategies.mjs`) loads every file through it, so an unsourced or
malformed strategy cannot enter the library.

This is the mechanism that makes ViewForge *self-improving instead of opinionated*:
strategies start as documented claims, get A/B-tested on real videos, and only earn
the right to drive the pipeline by default once they pass the promotion gate in
`lib/guards.mjs`.

## Fields

| field | required | notes |
|-------|----------|-------|
| `id` | ✅ | kebab-case, unique across the library |
| `title` | ✅ | one-line human name |
| `category` | ✅ | `retention` \| `packaging` \| `story` \| `format` \| `monetization` \| `production` |
| `principle` | ✅ | the underlying claim, in plain language |
| `rule` | | the concrete, do-this-now tactic the pipeline applies |
| `targetMetric` | ✅ | the metric it aims to move (see `KNOWN_METRICS`) |
| `guardMetrics` | | metrics it must **not** sacrifice (anti-Goodhart) |
| `appliesTo` | | pipeline stages it informs: `niche`,`brand`,`research`,`script`,`voice`,`motion`,`edit`,`thumbnail`,`title`,`distribution` |
| `source` | ✅ | provenance — see below |
| `status` | ✅ | lifecycle state — see below |
| `confidence` | | 0..1; how much ViewForge currently trusts it |
| `evidence` | | array of test observations accumulated by ViewForge |
| `constraints` | | any hard rules this interacts with (e.g. `no-deceptive-clickbait`) |
| `createdUtc` / `lastReviewedUtc` | | dates (review horizon drives decay) |

### `source` (provenance — the anti-slop rule)

- **External** (`kind: "external"`): must have a `name` **and** an anchor — a `url`
  or a direct `quote`. No anonymous claims. This is how `documented` strategies
  (the MrBeast seeds, studies, creator teardowns) cite their origin.
- **Internal** (`kind: "internal"`): a strategy ViewForge *invented* itself. Must
  carry a `rationale`, and may **not** start as `documented` — a self-generated idea
  begins life as a `hypothesis` and has to earn its way up like any other.

## Lifecycle

```
documented ──┐
             ├──> testing ──> validated ──> (decays) ──> retired
hypothesis ──┘                    │
                                  └──> (disproven) ──> retired
```

- **documented** — credibly sourced but **untested inside ViewForge**. The seeds
  start here. A documented strategy informs the pipeline but is clearly labeled "not
  yet proven on our channels."
- **hypothesis** — a ViewForge-generated idea, no external source yet.
- **testing** — currently being A/B'd; accumulating `evidence` observations.
- **validated** — passed the promotion gate: ≥5 real observations, ≥2 out-of-sample
  (holdout) wins, positive mean effect, and **no guard metric sacrificed**. Only
  validated strategies drive the pipeline by default.
- **retired** — disproven, or decayed past its `lastReviewedUtc` horizon (the
  platform moved). Kept for history, never applied.

## Why the guards matter (don't game yourself)

The whole point of the lifecycle is to stop ViewForge from fooling itself:

- **Anti-overfitting**: a strategy can't be validated on the same videos it was
  tuned on — it must win on *holdout* videos it never saw.
- **Anti-Goodhart**: a strategy that lifts its `targetMetric` by tanking a
  `guardMetric` (clickbait CTR that destroys AVP/likeRatio) is **rejected**, not
  rewarded.
- **No fabricated data**: `simulated:true` observations can never promote anything.

See `ANTI-REWARD-HACKING.md` at the plugin root for the full philosophy.
