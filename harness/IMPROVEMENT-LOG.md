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

## 2026-06-28 — bootstrap
- **Incident:** none yet — initial release.
- **Reproduction:** the v0.1.0 test suite (46 tests) + `check-strategies` gate
  establish the baseline guarantees: no unsourced strategy, no fake-human plan, no
  promotion without out-of-sample wins and intact guard metrics, no state overwrite.
- **Generalization:** the integrity properties live in tested code, so any future
  regression of them fails CI rather than relying on vigilance.
- **Guard against gaming:** promotion confidence is conservative and evidence-bound;
  fabricated/simulated data is structurally excluded from promotion.
