---
name: analytics-optimize
description: >-
  Close ViewForge's optimization loop — ingest a published video's REAL metrics,
  turn them into observations, attribute them to the strategies/experiments that
  produced the video, run the promotion gate, and advance each strategy's
  lifecycle (documented/hypothesis → testing → validated → retired). Never learns
  from simulated data. Department #9 — the one that makes the system self-improving.
when_to_use: >-
  When a published ViewForge video has real analytics to learn from, or to review
  strategy evidence — e.g. "ingest vid-1's metrics", "run the optimization loop",
  "promote/retire strategies", "viewforge analytics step".
argument-hint: "[channel-slug] [video-id]"
allowed-tools: >-
  Read Write Edit Glob WebFetch Bash(node *) Bash(mkdir *) Bash(echo *) Bash(ls *)
---

# Analytics & optimize (ViewForge — department #9)

This is the department that turns "we made a video" into "the system got smarter." It
ingests **real** metrics and runs them through the integrity gate in `lib/guards.mjs`
(via `lib/analytics.mjs`).

## 1. Get REAL metrics (never fabricate)

Pull the video's actual analytics — CTR, AVD/AVP, retention curve, likeRatio — from
YouTube Studio / the YouTube Analytics API. If real metrics aren't available yet, **stop
here**: the loop refuses to learn from simulated numbers, and so should you. (Simulated
runs are only for testing the machinery, and are tagged `simulated:true`, which can
never promote anything.)

## 2. Turn metrics into attributed observations

For each strategy the video tested (ideally as a controlled A/B vs a baseline), build an
observation. Assign the video to a `train` or `holdout` cohort — promotion REQUIRES
out-of-sample (holdout) wins, so plan experiments to accumulate both.

```bash
node -e '
import("../../lib/analytics.mjs").then(({computeObservation, evaluateStrategyEvidence, applyEvidence}) => {
  const o = computeObservation({ videoId:"vid-1", cohort:"holdout", targetMetric:"retention_30s",
    baseline:0.50, treatment:0.57, guards:[{metric:"likeRatio",baseline:0.04,treatment:0.041}], simulated:false });
  console.log(JSON.stringify(o));
})'
```

## 3. Run the promotion gate + advance the lifecycle

`evaluateStrategyEvidence(strategy, observations)` decides the next state:
- real evidence moves a `documented`/`hypothesis` strategy to **testing**,
- **validated** only when the promotion bar is met (≥ min real obs, ≥2 holdout wins,
  positive effect, **no guard metric sacrificed**),
- simulated-only → `insufficient` (no change).

`applyEvidence(strategy, observations)` returns the updated strategy immutably (new
status/confidence, observations appended to `evidence`, review date refreshed). **Write
the updated strategy JSON back to `strategy-library/strategies/`** so the win (or the
testing progress) persists, and re-run `tools/check-strategies.mjs`.

Also sweep for **stale** strategies (`isStale`) past the review horizon and retire them —
the platform moves, and yesterday's win becomes today's cliché.

## 4. Feed it forward
The newly `validated` (or `retired`) strategies change what the script/motion/packaging
departments pull by default on the next video. That's the loop: make → measure →
promote → make better.

## Definition of done
- [ ] Real metrics ingested (or honestly stopped if none — no simulated promotion).
- [ ] Observations attributed to strategies with cohorts assigned.
- [ ] Promotion gate run; strategy JSONs updated + `check-strategies` re-run.
- [ ] Stale strategies retired; the channel log records what changed and why.
