# Plan — archival imagery pipeline + music/sound design

Goal: move ViewForge's render from "clean motion-graphics" toward "real channel" by
(A) compositing rights-clean archival imagery into scenes, then (B) adding a music bed
and sound design. Built in that order. Pure logic is verified by **property tests** and
**BDD tests**; network fetch + final render are verification steps.

The discipline mirrors the strategy library's anti-slop rule: **no asset without a
recorded, usable license and a source/attribution** ever enters a video.

---

## Phase A — archival imagery pipeline

### Modules
- `lib/asset-license.mjs` — the rights-clean gate (pure).
- `lib/asset-source.mjs` — normalize → filter → dedup → manifest (pure).
- `lib/motion-plan.mjs` — per-scene `assets`; plan/manifest cross-validation (pure).
- `tools/fetch-assets.mjs` — runtime fetch from public-domain image APIs (network; uses
  the tested lib). Sources: **Openverse** (api.openverse.org) and **Library of Congress**
  (loc.gov) — both expose explicit license metadata.

### License policy (the gate)
Usable for a **monetized, edited** video:
- ✅ `public-domain`, `cc0`, `cc-by` (needs attribution), `cc-by-sa` (needs attribution + sharealike note)
- ❌ `cc-by-nc*` (NC — the channel runs ads = commercial)
- ❌ `cc-*-nd` (ND — we crop/composite = a derivative)
- ❌ `unknown`, `all-rights-reserved`, anything unclassified → **never usable**

### Asset shape
```
{ id, title, url, thumbnail?, source, sourceUrl, license, attribution?, width, height, beatId? }
```

### Success criteria (Phase A)
| id | criterion | verified by |
|----|-----------|-------------|
| A1 | The gate NEVER passes unknown/NC/ND/restricted; ALWAYS passes PD/CC0; passes CC-BY/SA only with attribution | property |
| A2 | A built manifest contains only usable-licensed assets, each with source + attribution(if required) + resolution ≥ 1280px long edge; no duplicate id/url | property + BDD |
| A3 | A motion plan referencing an asset id not in the manifest is rejected by the validator | BDD |
| A4 | Every asset in a manifest is auditable: has `source`, `sourceUrl`, `license`, and attribution when the license requires it | property + BDD |
| A5 | At least one real fetched public-domain image composites into a scene (Ken-Burns), confirmed by a rendered still | render proof |

---

## Phase B — music + sound design

### Modules
- `lib/audio-mix.mjs` — compute the mix plan: music bed gain, **ducking** under
  narration, fades, SFX cue placement (pure).
- `lib/asset-license.mjs` — reused for music/SFX rights.
- `tools/synth-audio.mjs` — generate a rights-clean ambient bed + SFX (generated ⇒ CC0;
  no API keys, no licensing risk). The lib also accepts sourced tracks behind the gate.
- `lib/motion-plan.mjs` / composition — music `<Audio>` (ducked) + SFX `<Audio>` at cues.

### Mix model
- Narration is the priority bus. Music plays under it at `bedDb` (e.g. −22 dB), ducked
  to `duckDb` below narration whenever narration is active.
- `computeMusicGain(frame)` returns a 0..1 multiplier; during any narration segment the
  music multiplier corresponds to a level ≤ `narrationDb − minSeparationDb`.
- SFX cues map to beat boundaries; each cue has a frame, gain, and must fall within its
  beat window.

### Success criteria (Phase B)
| id | criterion | verified by |
|----|-----------|-------------|
| B1 | During any narration segment, computed music level ≤ narration level − `minSeparationDb` (intelligibility invariant) | property |
| B2 | Music bed covers the full runtime with fade-in/out; no silent gap > 0 between bed segments | property + BDD |
| B3 | Every SFX cue lands within its beat's [start,end) window | property + BDD |
| B4 | Every audio asset (music/SFX) passes the license gate with recorded attribution | property + BDD |
| B5 | A rendered clip has narration measurably present AND a music bed AND ≥1 SFX, narration intelligible over the bed | render proof |

---

## Test harness (zero-dep)
- `tests/helpers/prop.mjs` — `forAll(gen, predicate, {runs, seed})` with a seeded PRNG
  (deterministic, CI-stable) and counterexample reporting; `gens` (int/pick/array/…).
- `tests/helpers/bdd.mjs` — `feature` / `scenario` / `given` / `when` / `then` over
  `node:test` `describe`/`it`, so behavior reads as Given–When–Then.

Completion = every property + BDD test green (`npm run check`), success criteria A1-A4 /
B1-B4 each mapped to ≥1 passing test, and A5 / B5 render proofs produced.
