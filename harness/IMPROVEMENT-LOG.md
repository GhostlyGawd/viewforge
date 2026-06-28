# Harness improvement log

When ViewForge makes a mistake or takes a wrong action, the correction is dogfooded
back into the harness as a **reproducing test or a concrete guard rule** — never a
vague note. This log records each such change with its reproduction and the
*generalized* rule it produced (not just the one example that triggered it). See
`ANTI-REWARD-HACKING.md` § "The dogfooding rule".

## Format

```
## YYYY-MM-DD — <short title>
- **Incident:** what went wrong (the wrong action / bad output).
- **Reproduction:** the failing test / check that now captures it.
- **Generalization:** the class of error fixed (not the single instance).
- **Guard against gaming:** why the fix can't be satisfied cosmetically.
```

## Entries

## 2026-06-28 — numeric title claims must be grounded at research time, not script time
- **Incident:** the research department locked vid-1's title "Why A Misplaced Comma
  Cost 40 Million Dollars" with a specific number, but `claimPaidOff:true` was asserted
  without the number being tied to a verifiable case. The script department had to stop
  and web-verify it mid-script. (It turned out genuine — the 1872 U.S. Tariff Act comma,
  ≈$40M today — but it was luck of verification, not a guaranteed gate.)
- **Reproduction:** none yet — captured here as the next guard to build.
- **Generalization:** the failure class is *a quantified packaging claim that no
  department is required to source before production starts*. The fix is a research-stage
  rule: any title containing a number/superlative must carry a grounding source in the
  video record before it can be locked, mirroring the strategy library's provenance
  rule. Candidate: extend `lib/video-idea.mjs` to flag ungrounded numeric claims, and a
  new strategy `ground-quantified-claims`.
- **Guard against gaming:** the grounding must be a real source link (like the strategy
  `source` field), not a self-asserted boolean — expensive to fake, cheap to satisfy
  honestly. Tracked for v0.4.0.

## 2026-06-28 — bootstrap
- **Incident:** none yet — initial release.
- **Reproduction:** the v0.1.0 test suite (46 tests) + `check-strategies` gate
  establish the baseline guarantees: no unsourced strategy, no fake-human plan, no
  promotion without out-of-sample wins and intact guard metrics, no state overwrite.
- **Generalization:** the integrity properties live in tested code, so any future
  regression of them fails CI rather than relying on vigilance.
- **Guard against gaming:** promotion confidence is conservative and evidence-bound;
  fabricated/simulated data is structurally excluded from promotion.
