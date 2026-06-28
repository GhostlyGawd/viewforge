# Strategy library — sources

Every strategy cites its origin. This is the bibliography; the binding citation
(name + url/quote) lives in each strategy's `source` field and is enforced by
`tools/check-strategies.mjs`.

## Seed corpus (v0.1.0)

### [S1] MrBeast — "How to Succeed in MrBeast Production" (internal memo, 2024 leak)
The 36-page internal onboarding document from Jimmy Donaldson's production company,
leaked September 2024. The seed source for the v0.1.0 retention/packaging/story
strategies.

- Full text (primary): https://www.alexanderjarvis.com/memo-how-to-succeed-in-mrbeast-production/
- Reporting / corroboration:
  - https://www.tubefilter.com/2024/09/17/mrbeast-internal-production-guide-leaked-key-points/
  - https://sherwood.news/culture/mrbeast-youtube-leaked-internal-success-document/
  - https://www.shaanpuri.com/essays/mrbeast-leaked-memo

Strategies seeded from S1: `first-minute-retention`, `crazy-progression`,
`reengagement-beats`, `thumbnail-title-extremity`, `package-before-you-produce`,
`wow-factor`, `no-dull-moments`, `brand-deals-are-content`, `format-novelty`.

**Important caveat (anti-overfitting at the source level):** these are *documented*,
not *validated*. They come from one creator, in one era, for live-action mega-budget
content. ViewForge must re-test each on its own (motion-graphics, no-fake-human)
channels before trusting it — the memo is a hypothesis generator, not ground truth.
The whole point of the lifecycle is to find out which of these actually transfer.

## Adding a source

When a new strategy is added (whether documented from research or generated
internally), append its source here and ensure the strategy file's `source` field
carries the binding citation. The expansion roadmap (`ROADMAP.md`) lists the next
corpora to mine: Paddy Galloway / Spencer's retention teardowns, YouTube's own
Creator Insider guidance, academic work on video engagement, and ViewForge's own
internally-generated + validated strategies.
