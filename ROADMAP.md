# ViewForge — roadmap

Versioned, incremental. Each milestone ends green (`npm run check`) and leaves the
plugin usable. The north star: a channel whose every video is measurably better than
the last, produced end-to-end with no fake humans, optimized by evidence not opinion.

## v0.1.0 — foundation (this release)
- [x] Plugin skeleton, CI, conventions matching the repo's other plugins.
- [x] Strategy library: schema + lifecycle + 9 MrBeast-memo seeds, all sourced;
      CI gate (`check-strategies`).
- [x] Integrity + state libs: `strategy-registry`, `guards` (anti-reward-hack + hard
      constraints incl. no-fake-human), `niche-score`, `state` — 46 tests green.
- [x] First department end-to-end: **niche-select** (L2) with `/viewforge`.
- [x] Architecture, anti-reward-hacking doctrine, department registry, improvement log.

## v0.2.0 — brand + research departments
- [x] **brand** department (L2): `lib/brand-brief.mjs` (niche→brief + brand-record
      validation) + `brand-suite` skill wrapping `brand-studio`; persists + validates
      `channel.brand` before advancing.
- [x] **research** department (L2): `lib/video-idea.mjs` (packaging-extremity +
      format-novelty + demand scoring, encodes the strategies, hard-blocks unpaid-off
      clickbait) + `video-research` skill; locks packaged videos into channel state.
- [x] State helpers `setBrand` / `addVideo`; command router handles niche→brand→research.
- [ ] Stand up one real channel project end-to-end through `research` *(needs the
      operator's topic — run `/viewforge start <interest>`)*.
- [ ] Mine source corpus #2 (Paddy Galloway / retention teardowns / Creator Insider)
      → 10+ new `documented` strategies.

## v0.3.0 — production vertical slice (a video exists) ✅
- [x] **script** department (L2): `lib/script-model.mjs` beat sheet (encodes
      first-minute / crazy-progression / re-engagement / no-dull / no-abrupt-end) +
      structure validator; `script-write` skill.
- [x] **motion** department (L2): `lib/motion-plan.mjs` parameterized scene timeline
      (the A/B substrate; blocks fake-human brands) + `motion-graphics` skill +
      runnable Remotion project scaffold.
- [x] **voice** (L2, `lib/voice-spec.mjs`, free local Piper TTS, disclosed) and
      **edit** (L2, `lib/edit-qa.mjs`, no-dull-moments + hard-constraint ship gate).
- [x] Real production run on Marginalia vid-1 ("Why A Misplaced Comma Cost 40 Million
      Dollars"): grounded script + narration spec + motion plan + brand SVG comps +
      Remotion project; edit-QA **passed** (0 blocking). Actual MP4 render = local
      `npm run render` (env-dependent).

## v0.4.0 — the optimization loop closes ✅ (machinery)
- [x] **distribute** department (L2): `lib/distribution.mjs` (description/chapters/tags/
      end-screen + synthetic-voice disclosure + validator) + `distribution-publish` skill.
- [x] **analytics** department (L2): `lib/analytics.mjs` — ingest metrics → observations
      → attribute → `evaluatePromotion` → advance lifecycle (documented/hypothesis →
      testing → validated → retired). Refuses to learn from simulated data (verified).
- [x] First **internally-generated** strategy: `ground-quantified-claims` (hypothesis),
      born from the IMPROVEMENT-LOG — the recursion working. Grounding guard wired into
      `lib/video-idea.mjs`.
- [ ] First strategy validated on ViewForge's own REAL evidence — **blocked on a
      published video with real analytics** (needs the operator to publish; the loop
      will not promote on simulated data, by design).

## v0.5.0 — recursion + self-improvement
- [ ] Internal strategy generation (`source.kind:"internal"`) → hypothesis → test.
- [ ] Department self-re-weighting (niche factor weights learned from outcomes).
- [ ] Harness self-audit: surface mistakes → dogfood into tests/guards automatically.

## v0.9.0 — audio-first timing (Master Doc v2 adoption) ✅
Built to `plans/06-audio-first-v2.md`; the v2 doc's integrity layer (§27) was adapted
FROM ViewForge, so this milestone added the audio-first production core around it.
- [x] **Timing solver** (`lib/timing-solver.mjs`): scene durations are solver outputs
      from the real VO; overflow bounces to script with a word budget; underflow is a
      visual hold; ±4% voice-stretch cap; ±10% drift review flag;
      `applyResolvedTimeline` + `timingSource` provenance on motion plans.
- [x] **Mastering spec**: −14 LUFS / −1 dBTP targets, 700 ms dead-air ceiling,
      12–15 dB duck window (defaults + template aligned), two-pass loudnorm builder,
      `validateMaster` over measured values.
- [x] **Per-scene render cache** (`lib/render-cache.mjs`): content-hash render keys,
      dirty-scene diffing, codec-param-strict concat plan.
- [x] **Timestamp-first captions**: real alignment accepted (whisperX-shape),
      char-weighted reveal within real beat audio as fallback; `revealSec` flows
      synth-voice → captions.json → CaptionVideo.
- [x] **Provenance enforcement**: `origin` on assets; research-only never publishable
      (bind + assembly, new hard constraint); genAI b-roll must log model+prompt+seed;
      UI-truth requires real capture.

## v2 items deliberately deferred (each needs its own milestone)
- [ ] Strategy **expiry / confidence labels** (v2 §10/§23): observational rules
      auto-expire unless re-confirmed — touches the strategy schema, CI gate, and seeds.
- [ ] **VLM QC on per-scene stills** (v2 §25 Gate B, visual half): needs a still-export
      harness; the audio half shipped in v0.9.0.
- [ ] **Playwright capture-first** product demos (v2 §7) — becomes load-bearing when a
      product-demo channel exists; UI-truth-requires-capture is already enforced.
- [ ] **Remotion licensing** (v2 §3): free at the current solo scale; automating at
      company scale puts this in Remotion's "Automators" tier ($0.01/render,
      $100/mo minimum) — budget as COGS when volume arrives.

## Tooling gaps to resolve (search-first, then build)
Per the brief, when a capability is missing: find a free/forkable tool first, adopt
or wrap it; only build if nothing fits, and note it here.

| Need | Status | Plan |
|------|--------|------|
| Programmatic video render | chosen | **Remotion** (open-source, React) |
| TTS / narration | chosen | **Kokoro** (free local, default), Piper fallback; ElevenLabs = paid opt-in |
| Thumbnail composition | open | Remotion still-frame or `sharp`-based compositor |
| Captions / subtitles | shipped | audio-driven word-synced captions (`revealSec`); **whisperX** forced alignment = the upgrade to true word timestamps |
| Word-level alignment | open | whisperX (local, free) — feeds `normalizeAlignedWords` |
| Loudness mastering | shipped | ffmpeg two-pass loudnorm via `ffmpegLoudnormArgs` (−14 LUFS / −1 dBTP), validated by `validateMaster` |
| Real analytics ingest | open | YouTube Data/Analytics API (official) |
| B-roll / music (rights-clean) | open | catalog of CC0 / licensed sources; genAI b-roll allowed with `genai {model,prompt,seed}` provenance; never fake-human footage |

## Non-negotiables (carried in every version)
- No fake-human visuals (`no-fake-human-visual` hard constraint).
- Every strategy sourced; every promotion earns its way past the guards.
- State is atomic, validated, immutable; mistakes are dogfooded into the harness.
