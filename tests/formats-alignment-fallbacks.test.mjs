// Phase I of plans/07 — §19 scene grammars, §6 forced-alignment merge, §22 fallbacks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBeatSheet, validateScriptStructure, BLUEPRINTS, FORMATS, DEMO_UI_REVEAL_MAX_FRACTION } from '../lib/script-model.mjs'
import { buildMotionPlan } from '../lib/motion-plan.mjs'
import { mergeAlignmentIntoCaptions, weightedRevealTimes } from '../lib/caption-timing.mjs'
import { applyAssetFallbacks } from '../lib/asset-source.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

const brand = { name: 'B', visualMode: 'motion-graphics', palette: { bg: '#111', ink: '#eee', accent: '#c40' }, typography: { display: 'X', body: 'Y' } }

// ---- I1: format grammars ----

test('property: I1 — the demo grammar reveals the REAL UI by ≤8% of runtime at ANY length; short ends on CTA', () => {
  forAll(
    gens.record({ targetSeconds: gens.int(20, 900), format: gens.pick(['demo', 'short', 'education']) }),
    ({ targetSeconds, format }) => {
      const beats = buildBeatSheet({ targetSeconds, format })
      const script = { targetSeconds, format, beats: beats.map((b) => ({ ...b, text: 'w '.repeat(6).trim() })) }
      const v = validateScriptStructure(script)
      if (!v.valid) return false
      if (format === 'demo') {
        const reveal = beats.find((b) => b.id === 'ui-reveal')
        if (!reveal || reveal.startSec > DEMO_UI_REVEAL_MAX_FRACTION * targetSeconds + 1e-9) return false
        if (beats[beats.length - 1].id !== 'cta') return false
      }
      if (format === 'short' && beats[beats.length - 1].id !== 'cta') return false
      // beats tile the runtime in order
      let prev = 0
      for (const b of beats) {
        if (b.startSec !== prev) return false
        prev = b.endSec
      }
      return prev === targetSeconds
    },
    { runs: 300 },
  )
})

feature('Scene grammars (v2 §19)', () => {
  scenario('a demo that hides its UI too long is named and blocked', () => {
    const beats = given('a 60s demo whose reveal drifted to 12s', () => {
      const b = buildBeatSheet({ targetSeconds: 60, format: 'demo' }).map((x) => ({ ...x, text: 'words here' }))
      const reveal = b.find((x) => x.id === 'ui-reveal')
      reveal.startSec = 12
      return b
    })
    const v = when('we validate as a demo', () => validateScriptStructure({ targetSeconds: 60, format: 'demo', beats }))
    then('show_ui_early blocks with the numbers in the reason', () => {
      assert.equal(v.valid, false)
      assert.match(v.issues.join(';'), /ui-reveal starts at 12s/)
    })
  })

  scenario('every grammar beat has a motion preset (the A/B substrate covers all formats)', () => {
    then('demo + short beats build motion plans with per-beat overrides', () => {
      for (const format of FORMATS) {
        const plan = buildMotionPlan(buildBeatSheet({ targetSeconds: 120, format }), brand)
        assert.equal(plan.scenes.length, BLUEPRINTS[format].length)
      }
      const demo = buildMotionPlan(buildBeatSheet({ targetSeconds: 120, format: 'demo' }), brand)
      assert.equal(demo.scenes.find((s) => s.beatId === 'cursor-action').params.camera, 'cursor_focus')
      const short = buildMotionPlan(buildBeatSheet({ targetSeconds: 45, format: 'short' }), brand)
      assert.ok(short.scenes.find((s) => s.beatId === 'hook-burst').params.cutsPerScene >= 7)
    })
    and('an unknown format is refused', () => {
      assert.throws(() => buildBeatSheet({ targetSeconds: 60, format: 'vlog' }), /unknown format/)
    })
  })
})

// ---- I2: forced-alignment merge ----

const mkCaptions = () => {
  const beats = [
    { beatId: 'hook', startSec: 0, durSec: 2.4, words: ['a', 'misplaced', 'comma'] },
    { beatId: 'body', startSec: 2.72, durSec: 3.1, words: ['cost', 'forty', 'million', 'dollars'] },
  ]
  return { totalSec: 6.14, voice: 'am_michael', beats: beats.map((b) => ({ ...b, revealSec: weightedRevealTimes(b.words, b.durSec) })) }
}
const mkAligned = () => [
  { word: 'A', start: 0.02 },
  { word: 'misplaced,', start: 0.55 },
  { word: 'comma', start: 1.62 },
  { word: 'cost', start: 2.8 },
  { word: 'forty', start: 3.3 },
  { word: 'million', start: 3.9 },
  { word: 'dollars.', start: 4.7 },
]

test('property: I2 — real times replace the estimates, beat-relative and inside the beat', () => {
  forAll(
    gens.record({ jitter: gens.float(0, 0.2) }),
    ({ jitter }) => {
      const aligned = mkAligned().map((w) => ({ ...w, start: w.start + jitter }))
      const r = mergeAlignmentIntoCaptions(mkCaptions(), aligned)
      if (!r.valid) return false
      for (const [bi, b] of r.captions.beats.entries()) {
        if (b.revealSource !== 'forced-alignment') return false
        if (b.revealSec.length !== b.words.length) return false
        for (const [i, t] of b.revealSec.entries()) {
          if (!(t >= 0 && t < b.durSec)) return false
          const abs = mkCaptions().beats[bi].startSec + t
          const expected = aligned[bi === 0 ? i : 3 + i].start
          if (Math.abs(abs - expected) > 0.35 + 1e-6) return false // grace clamp only
        }
      }
      return true
    },
    { runs: 150 },
  )
})

feature('Forced-alignment merge (v2 §6 — the truth ladder tops out at whisperX)', () => {
  scenario('count mismatches and transcript disagreements are rejected with the beat named', () => {
    then('a missing word refuses the whole merge', () => {
      const r = mergeAlignmentIntoCaptions(mkCaptions(), mkAligned().slice(0, 6))
      assert.equal(r.valid, false)
      assert.match(r.errors.join(';'), /word count/)
    })
    and('a different word at the same slot names beat + index', () => {
      const aligned = mkAligned()
      aligned[4] = { ...aligned[4], word: 'fifty' }
      const r = mergeAlignmentIntoCaptions(mkCaptions(), aligned)
      assert.equal(r.valid, false)
      assert.match(r.errors.join(';'), /beat "body" word 1: caption "forty" vs aligned "fifty"/)
    })
    and('a word aligned far outside its beat is an error, not a clamp', () => {
      const aligned = mkAligned()
      aligned[2] = { ...aligned[2], start: 3.4 } // 1s past hook's end — beyond grace
      const r = mergeAlignmentIntoCaptions(mkCaptions(), aligned)
      assert.equal(r.valid, false)
      assert.match(r.errors.join(';'), /outside the beat/)
    })
  })

  scenario('punctuation/case differences do NOT block (whisperX tokens are messy)', () => {
    then('"misplaced," matches "misplaced"', () => {
      assert.equal(mergeAlignmentIntoCaptions(mkCaptions(), mkAligned()).valid, true)
    })
  })
})

// ---- I3: §22 asset fallbacks ----

test('property: I3 — missing assets dirty exactly their scenes, present assets untouched, input never mutated', () => {
  forAll(
    (rng) => {
      const n = gens.int(2, 8)(rng)
      const scenes = Array.from({ length: n }, (_, i) => ({ beatId: `s${i}`, assets: rng() < 0.7 ? [`a${i}`, `b${i}`] : [] }))
      const available = scenes.flatMap((s) => s.assets).filter(() => rng() < 0.6)
      return { plan: { fps: 30, scenes }, available }
    },
    ({ plan, available }) => {
      const snapshot = JSON.stringify(plan)
      const { plan: out, dirtySceneIds, flags } = applyAssetFallbacks(plan, available)
      if (JSON.stringify(plan) !== snapshot) return false // immutable
      const availSet = new Set(available)
      for (const [i, s] of plan.scenes.entries()) {
        const missing = (s.assets || []).filter((a) => !availSet.has(a))
        const o = out.scenes[i]
        if (missing.length === 0) {
          if (o !== s || dirtySceneIds.includes(s.beatId)) return false
        } else {
          if (!dirtySceneIds.includes(s.beatId)) return false
          if (JSON.stringify(o.assetFallback.missing) !== JSON.stringify(missing)) return false
          if (o.assets.some((a) => !availSet.has(a))) return false
        }
      }
      return flags.length === dirtySceneIds.length
    },
    { runs: 250 },
  )
})
