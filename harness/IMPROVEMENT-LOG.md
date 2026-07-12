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

## 2026-07-12 — the rebuilt judge STILL ran +23 hot (76 vs 53): absolute scoring is the defect
- **Incident:** the v2 blind judge (shuffled frames, maker/judge separation, exemplar
  anchors) scored the design-loop cycle-4 hook frame 76; the operator scored it 53.
  Error improved +39 → +23 across rubric revisions but still fails the ledger's ±10
  admissibility gate. Two mechanisms: (1) leniency bias — with anchors that are
  *descriptions* rather than visible artifacts, no dimension was scored below 6;
  scores compress toward 6–8 regardless of quality. (2) scope violation — the judge
  scored world-coherence (a cut-level property) 8 from a single still that cannot
  exhibit it.
- **Reproduction:** `business/calibration-ledger.json` records both real entries;
  the v2.1 test in `tests/quality-bar.test.mjs` asserts the protocol is comparative,
  inadmissible without a reference, and that `scoreRubricV2Frame` refuses to award
  cut-level dimensions from a still (weights renormalized over stillJudgeable only).
- **Generalization:** the failure class is *absolute judgment against remembered
  anchors*. A model judge is a comparator, not a meter: it discriminates "A vs B on
  screen together" far better than it estimates "A on a 0–10 scale from memory."
  So JUDGE_PROTOCOL v2.1: every craft score is produced side-by-side with a REAL
  reference frame of the same grammar, with a per-dimension observation of what the
  reference does that ours doesn't; and each artifact class (still/clip/cut) may
  only be scored on dimensions it can physically exhibit.
- **Guard against gaming:** a score without a reference on screen is inadmissible
  by protocol, so the judge cannot drift lenient in private; the calibration ledger
  keeps operator ground truth as the target, so anchoring to weak references (to
  make ours look good) shows up as ledger error and invalidates the rubric version,
  not the operator.

## 2026-07-12 — the quality rubric failed its first calibration test (78 vs 39)
- **Incident:** rubric v1 scored the EP.01 story cut 78/100; the operator scored it
  39/100. Root causes, in order: the maker scored its own work (self-referential
  measurement); the rubric measured defect-absence, not design-presence; judging ran
  on stills while the operator judged motion; the anchors were adjectives calibrated
  against nothing, compressing a ~50-point true gap into ~10 rubric points. Deeper
  still: the entire creation process was OPEN-LOOP — zero perceive-adjust cycles
  during design; all perception was spent at the gate, after creation finished.
- **Reproduction:** the calibration-ledger scenario in `tests/design-loop.test.mjs`
  records the real event (v1, 78.1, 39) and asserts `rubricNeedsRevision` = true —
  a rubric with mean |error| > 10 vs the operator is inadmissible at the ship gate.
- **Generalization:** a quality rubric is a HYPOTHESIS about what the operator (and
  later the audience) values, and gets the same lifecycle as every other claim in
  this repo: versioned, calibrated against ground truth per video, revised when its
  error exceeds tolerance. The judge is never the maker. Creation is closed-loop
  (lib/design-loop.mjs): perceive → critique against exemplar anchors → patch →
  re-render, shipping the best cycle, with gates deciding shippability.
- **Guard against gaming:** the operator score is the target and the rubric only
  the proxy — tuning the generator to the rubric while the rubric drifts from the
  operator shows up as ledger error and invalidates the rubric, not the operator.

## 2026-07-12 — "no dull moments" was Goodharted by its own proxies (the bare render)
- **Incident:** the factory produced a 47s cut with ZERO visual assets bound — every
  scene rendered on the background-glow fallback with the same caption layout — and
  it sailed through edit-QA and Gate B. The operator's verdict: "static shitty
  background glow with the same text over and over." All the machinery agreed it was
  fine, because "engaging" was measured entirely by proxies (narration coverage,
  cutsPerScene params) and the QC checklist covered correctness (caption-sync,
  contrast, overflow) but never the direct question: is anything actually ON screen?
  A second compounding miss: the voice used the documented "obviously synthetic"
  fallback engine, re-making the exact complaint recorded in the v0.8.0 changelog.
- **Reproduction:** "a cut where NO scene carries a visual asset is BLOCKED" in
  `tests/edit-qa.test.mjs` — the incident's own shape (narrated, fast-cut params,
  zero assets) must fail the ship gate.
- **Generalization:** any quality bar built ONLY from proxy metrics will pass a
  degenerate artifact that satisfies the proxies. Every proxy set needs at least one
  direct material check. Here: an entirely bare cut is a blocking defect; individual
  bare scenes warn; fallback-degraded scenes warn with their missing list.
- **Guard against gaming:** the check reads bound assets (which must exist in the
  rights-clean manifest to bind at all), not planner-authored params — inflating
  cutsPerScene or narration text can no longer stand in for having visuals.

## 2026-07-12 — severity floors must not override code-defined gradation
- **Incident:** the Gate-B aggregator's anti-shrug rule ("an explicit severity can
  never downgrade a blocking check") silently escalated `checkTokenContrast`'s own
  warn-band findings (ratio 3–4.5:1) to blocking, because `contrast` is registered
  block-severity. The end-to-end drive showed the house accent (4.09:1 — a
  legitimate warn) forcing a scene re-render.
- **Reproduction:** the "graded checks honor the code-defined band" test in
  `tests/scene-qc.test.mjs` — warn-band contrast findings must aggregate as
  warnings, block-band and severity-less contrast findings must block.
- **Generalization:** a severity floor is for BINARY defects judged by a model; a
  check whose bands are computed in code (`graded: true`) must have its computed
  severity honored in both directions — otherwise the code's judgment is overruled
  by a rule meant to constrain the model's.
- **Guard against gaming:** the VLM still can't shrug off binary blockers (the
  floor stands for non-graded checks), and a severity-less contrast finding
  defaults to block — the warn path exists only via the tested numeric bands.

## 2026-07-12 — caption reveal times must floor, never round (a caption may be early, never late)
- **Incident:** while adopting Master Doc v2's timestamp-first captions, reveal times
  were rounded to the nearest millisecond. Rounding UP pushes a word's reveal *after*
  the instant the voice says it — at the word's true onset the caption still shows the
  previous word. A per-word desync of <1ms is invisible in isolation but is exactly
  the "caption doesn't match the audible word" class the v2 Gate-B checklist exists
  to catch.
- **Reproduction:** the D2 round-trip property in `tests/caption-timing.test.mjs`
  ("at any word's start time, that word is current") failed on the first run with a
  real counterexample; it now pins the floored behavior.
- **Generalization:** every time quantization in the caption path must err EARLY
  (floor), never late — a caption may appear ≤1ms before its word, never after.
  `normalizeAlignedWords` floors; `mergeAlignmentIntoCaptions` clamps grace-window
  spill down into the beat.
- **Guard against gaming:** the property tests the round-trip against the UNrounded
  source times, so the invariant can't be satisfied by adjusting both sides of the
  comparison.

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
- **RESOLVED (v0.4.0):** `lib/video-idea.checkClaimGrounding` now flags any title with a
  quantified/superlative claim and no `claimSource` (tests in `tests/grounding.test.mjs`),
  and the fix was generalized into a real, testable strategy `ground-quantified-claims`
  (internal-source, `hypothesis`) — so it must earn validation on real evidence like any
  other, rather than being trusted because we wrote it. This is the dogfood-the-mistake-
  into-the-harness loop working end to end: incident → reproducing test → generalized
  rule → subject to the same guards.

## 2026-06-28 — the render caught a brand-token bug 110 unit tests missed
- **Incident:** the first still-render of vid-1 came out white-on-black instead of the
  Marginalia parchment-on-near-black. Cause: the brand record stored palette values as
  `"#14110E (warm near-black)"` — the human label makes it an invalid CSS color, so the
  browser silently fell back to defaults. The motion engine passed the token through
  verbatim. Unit tests never caught it because their fixtures used clean hex.
- **Reproduction:** `tests/motion-plan.test.mjs` now has `extractCssColor` /
  `extractFontFamily` cases + a "sanitizes labeled palette values" test using the exact
  messy string from the brand record.
- **Generalization:** the failure class is *trusting that an upstream human-authored
  field is machine-clean*. Fix = the motion engine sanitizes every brand color/font
  token to valid CSS at plan-build time (`extractCssColor`), so any labeled value
  renders. (Defensive at the consumer, not just hoping the brand record is tidy.)
- **Guard against gaming:** the sanitizer is covered by tests asserting real CSS output;
  it can't be satisfied by a token that merely "looks" like a color.
- **Meta-lesson:** this is why the pipeline renders real artifacts, not just asserts on
  data — a render exposes integration bugs a green unit suite hides. Worth a future
  golden-frame check in CI.

## 2026-06-28 — bootstrap
- **Incident:** none yet — initial release.
- **Reproduction:** the v0.1.0 test suite (46 tests) + `check-strategies` gate
  establish the baseline guarantees: no unsourced strategy, no fake-human plan, no
  promotion without out-of-sample wins and intact guard metrics, no state overwrite.
- **Generalization:** the integrity properties live in tested code, so any future
  regression of them fails CI rather than relying on vigilance.
- **Guard against gaming:** promotion confidence is conservative and evidence-bound;
  fabricated/simulated data is structurally excluded from promotion.
