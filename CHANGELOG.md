# Changelog

All notable changes to ViewForge are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning is [SemVer](https://semver.org/).

## [0.1.0] — 2026-06-28

Foundation release — the self-improving harness and its first working department.

### Added
- **Plugin scaffold**: `plugin.json` / `marketplace.json`, MIT license, CI workflow,
  `npm run check` (strategy validation + tests + manifest check).
- **Strategy library**: JSON schema + lifecycle (`documented → testing → validated →
  retired`), provenance rule (no anonymous claims), and **9 source-cited strategies**
  seeded from the leaked MrBeast production memo (first-minute retention, crazy
  progression, re-engagement beats, thumbnail/title extremity, package-first, wow
  factor, no dull moments, brand-deals-as-content, format novelty). CI gate
  `tools/check-strategies.mjs` rejects any unsourced/malformed strategy.
- **Integrity + state libs** (zero-dependency, 46 tests):
  - `lib/strategy-registry.mjs` — load/validate/query strategies (schema authority).
  - `lib/guards.mjs` — hard constraints (incl. **no fake-human visual**, no
    fabricated metrics, no deceptive clickbait) + the promotion gate (anti-overfit
    via out-of-sample requirement, anti-Goodhart via guard metrics, no promotion on
    simulated data).
  - `lib/niche-score.mjs` — transparent weighted niche scoring with direction
    correction + grounding confidence.
  - `lib/state.mjs` — atomic, schema-validated, immutable per-channel project state.
- **niche-select department** (`skills/niche-select/` + `/viewforge`): brainstorm →
  ground → score → rank → commit a channel project, with a CLI front-end
  (`score-niches.mjs`).
- **Docs**: `ARCHITECTURE.md`, `ANTI-REWARD-HACKING.md`, `ROADMAP.md`, the department
  registry + maturity model, and the harness improvement log.

### Notes
- The 9 seeds are `documented`, not `validated` — they come from one creator/era of
  live-action content and must be re-tested on ViewForge's own motion-graphics,
  no-fake-human channels before being trusted. That re-testing is the v0.4.0 loop.
