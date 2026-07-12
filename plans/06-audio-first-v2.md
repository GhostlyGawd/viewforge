# Plan — audio-first timing (Master Doc v2 adoption)

Goal: adopt the core of the **Master Document v2 (Audio-First Edition)** into ViewForge.
The doc's own "biggest change" (§6) names the exact flaw still live in our pipeline:
scene timings are authored at storyboard time (the beat sheet guesses seconds), while the
narration's REAL durations already exist in `captions.json` — so visuals and voice drift,
and every fix re-renders the whole video. v2 inverts that: **voice first, then a timing
solver derives scene durations from the real audio**, captions align by construction,
and per-scene render caching makes iteration cost one scene, not one video.

What v2 does NOT change for us: the v2.1 "integrity layer" (promotion gate in tested
code, simulated data inadmissible, rule provenance CI gate, Gate-0 hard constraints) is
*adapted from ViewForge* (doc §27) — `lib/guards.mjs`, `lib/analytics.mjs`, and
`tools/check-strategies.mjs` already are that layer. This plan adds the audio-first
production core around it.

Discipline as in plan 05: pure logic verified by **property tests** and **BDD tests**;
renders remain the environment-dependent verification step. Zero new dependencies
(`node:crypto` is a builtin).

---

## Phase A — the timing solver (doc §6, §14, §15)

The inversion. Beats/scenes stop authoring `startSec/endSec` as truth; they author
**constraints** (`minMs`/`maxMs`/`padAfterMs`), and the solver assigns
`resolvedStartMs`/`resolvedDurationMs` from the measured narration durations.

### Modules
- `lib/timing-solver.mjs` — NEW. `solveTimeline(scenes, opts)` per the §15 algorithm:
  - `d = voMs + padAfterMs`
  - `d > maxMs` → **bounce to script** with an explicit word budget
    (`⌊maxMs/1000 × wordsPerSec⌋`); never time-stretch voice (±4% hard cap).
  - `d < minMs` → extend to `minMs` as a **visual hold** (recorded, so the renderer
    holds motion — never stretched audio, never dead silence).
  - starts chain with the brand transition overlap; total-vs-target drift beyond ±10%
    flags the job for review.
  - the solver is the **only writer** of resolved fields — input scenes already
    carrying them are rejected.
- `lib/motion-plan.mjs` — `applyResolvedTimeline(plan, solved, {fps})` rewrites scene
  start/end (sec + frames) from solver output, immutably, stamping
  `timingSource: 'audio-solver'` (plans built from the beat sheet alone stay
  `'authored'` so provenance is visible downstream).
- `lib/timing-solver.mjs` also emits the caption-beat shape (`{beatId, startSec,
  durSec, words}`) from the resolved timeline so `CaptionVideo` and the solver can
  never disagree.

### Success criteria (Phase A)
| id | criterion | verified by |
|----|-----------|-------------|
| A1 | Resolved timeline is monotonic, gapless up to declared transition overlap, every duration within [min, max], every start/duration a solver output | property |
| A2 | VO overflow (voMs+pad > maxMs) NEVER resolves — it bounces with a word budget = ⌊maxMs/1000 × wordsPerSec⌋ | property + BDD |
| A3 | VO underflow resolves to exactly minMs with the shortfall recorded as a visual hold (never silence, never stretch) | property + BDD |
| A4 | Voice stretch beyond ±4% is refused wherever a stretch is proposed | property |
| A5 | Total-duration drift vs target beyond ±10% raises a review flag (within tolerance does not) | property + BDD |
| A6 | Input scenes that already carry resolved fields are rejected (solver is the only writer) | BDD |
| A7 | `applyResolvedTimeline` maps resolved ms → sec/frames 1:1 onto plan scenes by beatId, immutably, and stamps `timingSource` | property + BDD |

---

## Phase B — mastering targets + Gate-B audio checks (doc §6, §21, §25)

The two remaining "AI tells" are voice quality and timing desync; the master bus is
where the loudness half is enforced. Targets from the v2 brand kit: **−14 LUFS
integrated / −1 dBTP true peak** (YouTube's normalization target), music ducked
**12–15 dB under narration**, voice stretch capped at ±4%.

### Modules
- `lib/audio-mix.mjs` — extended (existing mix model untouched):
  - `MASTER_TARGETS` (−14 LUFS ±1 LU, −1 dBTP max, duck window 12–15 dB, silence-gap
    ceiling 700 ms, ±4% stretch cap).
  - `validateMaster(measured)` — Gate-B audio checklist over MEASURED numbers
    (loudness within ±1 LU, no clip past true-peak ceiling, no silence gap > 700 ms,
    stretch within cap). Blocking vs warn severities per §25.
  - `silenceGaps(intervals, runtimeSec)` — pure gap-finder over audible intervals
    (narration + bed + SFX), the input to the no-dead-air check.
  - `duckDepthDb(cfg)` + duck-window validation: at least 12 dB under narration
    (intelligibility), > 15 dB flagged advisory (v2 wants musical continuity too).
  - `ffmpegLoudnormArgs(targets)` — pure builder for the two-pass loudnorm master
    (measure pass → apply pass), consumed by `scripts`/operator, testable as data.

### Success criteria (Phase B)
| id | criterion | verified by |
|----|-----------|-------------|
| B1 | validateMaster accepts exactly the −14 ±1 LU / ≤ −1 dBTP window and rejects outside it | property |
| B2 | Any silence gap > 700 ms in the audible timeline is found and blocks; ≤ 700 ms never blocks | property + BDD |
| B3 | Duck depth < 12 dB under narration is blocking; 12–15 passes clean; > 15 warns (advisory only) | property + BDD |
| B4 | A proposed voice stretch outside ±4% is rejected by the master validator too | property |
| B5 | ffmpeg loudnorm args carry the exact targets (I=-14, TP=-1) in both passes | BDD |

---

## Phase C — per-scene render cache + concat plan (doc §6, §22)

Retries and edits should cost one scene, not the video. Render identity is a content
hash: `renderKey = sha256(sceneJson + brandVersion + assetHashes + rendererVersion)`.

### Modules
- `lib/render-cache.mjs` — NEW (uses `node:crypto`, still dependency-free):
  - `canonicalJson(value)` — deterministic serialization (sorted keys, stable arrays;
    rejects non-finite numbers/undefined so a key can never be ambiguous).
  - `renderKey({scene, brandVersion, assetHashes, rendererVersion})` → `sha256:…`.
  - `planSceneRenders(scenes, cacheIndex, ctx)` → `{jobs, toRender, fromCache}` —
    only scenes whose key misses the cache re-render.
  - `dirtyScenes(prevKeys, nextKeys)` — the scene-scoped invalidation diff (§22: a
    missing/changed asset dirties only its scene).
  - `concatPlan(renders)` — validates every scene render carries IDENTICAL codec
    params (codec/fps/resolution/pix_fmt/audio) and orders by resolved start; emits
    the ffmpeg concat list. Mismatched params are rejected, not silently re-encoded.

### Success criteria (Phase C)
| id | criterion | verified by |
|----|-----------|-------------|
| C1 | canonicalJson is order-insensitive for objects (same content ⇒ same bytes) and injective over key order permutations | property |
| C2 | renderKey changes iff scene content, brand version, an asset hash, or renderer version changes | property |
| C3 | planSceneRenders re-renders exactly the cache misses; a one-scene edit dirties exactly that scene | property + BDD |
| C4 | concatPlan rejects any codec-param mismatch and orders segments by resolved start | property + BDD |

---

## Phase D — word-timed captions, timestamp-first (doc §6)

Captions must derive from word timings, not luck. Today `wordRevealTimes` spreads
words EVENLY across a beat. Upgrade the ladder: real forced-alignment timestamps when
present → duration-weighted estimate (longer words take longer) within the REAL
per-beat audio duration → even split only as the last fallback.

### Modules
- `lib/caption-timing.mjs` — extended (existing API kept):
  - `weightedRevealTimes(words, durSec)` — char-weighted, monotonic, in [0, durSec).
  - `normalizeAlignedWords(aligned, {beatStartSec})` — accepts whisperX-style
    `{word, start, end}` (absolute) and returns beat-relative reveal times; rejects
    non-monotonic input.
  - `revealedIndexAtTime(tSec, revealTimes)` — timestamp-driven current-word lookup
    (replaces progress×count arithmetic when real times exist).
- `tools/synth-voice.py` — per-beat `revealSec` written into `captions.json`
  (char-weighted within the beat's real duration; upgrade path to whisperX noted).
- `assets/remotion-template/src/CaptionVideo.tsx` — consumes `revealSec` when present
  (mirroring the lib, which stays the spec), even-split fallback preserved.

### Success criteria (Phase D)
| id | criterion | verified by |
|----|-----------|-------------|
| D1 | weightedRevealTimes: monotonic non-decreasing, first at 0, all < durSec, longer words get ≥ share of shorter ones | property |
| D2 | Aligned timestamps round-trip: normalize → revealedIndexAtTime picks exactly the word being spoken at t | property + BDD |
| D3 | Non-monotonic / out-of-beat alignment input is rejected with a reason | BDD |
| D4 | Even-split remains the fallback and existing callers are unbroken (old tests stay green) | existing suite |

---

## Phase E — asset provenance: genAI + research-only (doc §8, §16) + Gate-0 hook (§25)

Two v2 hard rules move from convention to code:
1. **`research-only` assets can never enter a render** (yt-dlp material is for
   transcripts/competitive analysis only). Enforced at binding AND at edit-QA
   (assembly), not by convention.
2. **GenAI b-roll is first-class but provenanced**: an asset with
   `origin: "generated-ai"` must log `genai: {model, prompt, seed}` for
   reproducibility, and may never stand in for UI-truth (`uiTruth: true` requires a
   real capture).

### Modules
- `lib/asset-source.mjs` — extended: `origin` field
  (`captured|generated-ai|licensed|owned|research-only`), `isPublishable(asset)`,
  manifest validation of genai provenance + uiTruth-requires-capture,
  `filterUsable`/`bindAssetsToPlan` refuse non-publishable assets for render
  manifests.
- `lib/guards.mjs` — new hard constraint `research-only-never-published` (block);
  `checkHardConstraints` reads the plan signal.
- `lib/edit-qa.mjs` — `runEditQa` accepts the asset manifest and turns any
  non-publishable asset referenced by the timeline into a **blocking** issue
  (assembly-time enforcement, §16).

### Success criteria (Phase E)
| id | criterion | verified by |
|----|-----------|-------------|
| E1 | origin research-only ⇒ not publishable, always — regardless of license | property |
| E2 | Binding or shipping a research-only asset is refused at bind time AND blocks edit-QA | BDD |
| E3 | generated-ai without {model, prompt, seed} fails manifest validation; with them passes | property + BDD |
| E4 | uiTruth: true with any origin other than captured fails validation | property + BDD |

---

## Deferred (tracked in ROADMAP, deliberately not in this milestone)
- **Strategy expiry / confidence labels** (doc §10, §23): observational rules
  auto-expiring unless re-confirmed. Touches the strategy schema + CI gate + seeds;
  worth its own milestone so the schema change is not rushed.
- **VLM QC on per-scene stills** (Gate B visual half, §25): needs a still-export
  harness; the audio half ships now in Phase B.
- **Playwright capture-first demos** (§7): ViewForge's current channels are
  motion-graphics explainers; capture becomes load-bearing when a product-demo
  channel exists.
- **Remotion licensing** (§3): noted in ROADMAP — the Automators tier
  ($0.01/render, $100/mo min) applies when this automates at company scale.

Completion = every property + BDD criterion above mapped to ≥1 passing test,
`npm run check` green, docs/skills/registry updated, CHANGELOG 0.9.0.
