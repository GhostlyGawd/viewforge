# Plan — the design loop (closed-loop creation) + calibrated judging

Root cause accepted (operator, 2026-07-12): the system was OPEN-LOOP. All perception
happened at the QC gate, after creation finished; scenes were designed blind, in one
shot. Every craft that produces excellence is closed-loop — perceive, adjust,
perceive — dozens of cycles per scene. Gates catch defects; only the loop injects
design. Ground truth: rubric v1 scored EP.01 at 78 while the operator scored 39 —
the instrument failed its first out-of-sample test by 2x.

## Phase J — the loop machinery (`lib/design-loop.mjs`)
- Cycle budgets: deep-on-hero (idea-carrying grammars get ~10 look-adjust cycles,
  connective scenes ~4); explicit hero override.
- Iteration state machine (immutable): each cycle records {critique → patch →
  judgeScore}; stops on target reached / plateau / budget exhausted; ALWAYS ships
  the best-scoring cycle, never blindly the last (the per-scene render cache makes
  any cycle recoverable by key).
- Maker/judge separation: critiques must cite rubric dimensions + concrete
  observations; the judge never patches, the maker never scores.

## Phase K — rubric v2 + the calibration ledger (`lib/quality-bar.mjs`)
- Dimensions re-derived from the viewer's experience, EXEMPLAR-anchored (anchor9 =
  a reference-class frame, anchor3 = stock-explainer), 0–10 scale for discriminative
  range. Headline dimension: **visual-ideation** — does the scene SHOW the idea, or
  decorate the narration with a related object?
- Calibration ledger: every video records (rubricVersion, rubricScore,
  operatorScore); mean-abs-error and bias computed per rubric version;
  `rubricNeedsRevision` when error exceeds tolerance. First entry: EP.01, v1,
  78 vs 39 — needsRevision = true, recorded, not hidden.
- Ship threshold raised to the operator's stated minimum: **87** (calibrated scale).
  Today's output correctly does NOT ship. That is the true state of the system.

## Phase L — reference pack + procedure
- `assets/reference-pack/`: exemplar frames per scene type from the named channels
  (Veritasium-class explanation; Kurzgesagt/3B1B-class animation; Harris/Fern for
  history texture), manifest-flagged `research_only` (never publishable — the
  enforcement already exists). Maker iterates toward them; judge anchors on them.
- Skill procedure: design loop is MANDATORY before Gate B for hero scenes.

## Deferred pending operator keys (the paid ingredients, flagged in their 39)
genAI video (Veo/Kling-class world footage), ElevenLabs-class directed voice,
composed/licensed music. Integration points already exist (§8 provenance, voice
dept, audio-mix).

Success = loop machinery + ledger property/BDD-tested; the first calibration entry
recorded; ship gate at 87; skills updated. The first loop-designed render follows.
