import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SOLVER_DEFAULTS,
  solveTimeline,
  validateResolvedTimeline,
  stretchPct,
  isStretchAllowed,
  wordBudgetForMs,
  toCaptionBeats,
  scenesFromCaptions,
} from '../lib/timing-solver.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

// Generator: a list of scenes whose constraints are satisfiable by their VO (so the
// solve must succeed). minMs ≥ 500 keeps every duration above the overlap we test with.
const resolvableScenes = (rng) => {
  const n = gens.int(1, 8)(rng)
  return Array.from({ length: n }, (_, i) => {
    const voMs = gens.int(0, 12000)(rng)
    const padAfterMs = gens.int(0, 400)(rng)
    const minMs = gens.int(500, 4000)(rng)
    const maxMs = Math.max(minMs, voMs + padAfterMs) + gens.int(0, 2000)(rng)
    return { id: `s${i}`, voMs, padAfterMs, minMs, maxMs }
  })
}

// ---- A1: resolved timeline invariants ----

test('property: A1 — a satisfiable solve resolves every scene within [min,max], chained gaplessly with the overlap', () => {
  forAll(
    gens.record({ scenes: resolvableScenes, overlapMs: gens.int(0, 400) }),
    ({ scenes, overlapMs }) => {
      const r = solveTimeline(scenes, { transitionOverlapMs: overlapMs })
      if (!r.ok || r.scenes.length !== scenes.length || r.bounces.length) return false
      // durations within constraints, starts chain exactly
      let expected = 0
      for (const s of r.scenes) {
        if (s.resolvedStartMs !== expected) return false
        if (s.resolvedDurationMs < s.minMs || s.resolvedDurationMs > s.maxMs) return false
        if (s.holdMs < 0) return false
        expected = s.resolvedStartMs + s.resolvedDurationMs - overlapMs
      }
      return validateResolvedTimeline(r.scenes, { transitionOverlapMs: overlapMs }).valid
    },
    { runs: 300 },
  )
})

// ---- A2: overflow bounces to script with the word budget, and nothing resolves ----

test('property: A2 — VO overrunning max NEVER resolves; it bounces with wordBudget = ⌊maxMs/1000 × wps⌋', () => {
  forAll(
    (rng) => {
      const scenes = resolvableScenes(rng)
      const i = gens.int(0, scenes.length - 1)(rng)
      const s = scenes[i]
      // force an overflow on scene i: max strictly below what the VO needs
      const need = s.voMs + s.padAfterMs
      scenes[i] = { ...s, minMs: 0, voMs: Math.max(s.voMs, 1000), maxMs: Math.max(1, Math.round(Math.max(s.voMs, 1000) + s.padAfterMs) - gens.int(1, 500)(rng)) }
      return { scenes, bouncedId: s.id }
    },
    ({ scenes, bouncedId }) => {
      const r = solveTimeline(scenes)
      const b = r.bounces.find((x) => x.id === bouncedId)
      if (r.ok || !b || r.scenes.length !== 0 || r.totalMs !== 0) return false
      return b.wordBudget === Math.floor((b.maxMs / 1000) * SOLVER_DEFAULTS.wordsPerSec)
    },
    { runs: 300 },
  )
})

// ---- A3: underflow becomes a visual hold, never silence/stretch ----

test('property: A3 — VO under min resolves to exactly min, shortfall recorded as holdMs', () => {
  forAll(
    gens.record({ voMs: gens.int(0, 2000), padAfterMs: gens.int(0, 300), minMs: gens.int(2500, 8000) }),
    ({ voMs, padAfterMs, minMs }) => {
      const r = solveTimeline([{ id: 'only', voMs, padAfterMs, minMs }])
      const s = r.scenes[0]
      return r.ok && s.resolvedDurationMs === minMs && s.holdMs === minMs - (voMs + padAfterMs)
    },
    { runs: 300 },
  )
})

// ---- A4: the ±4% stretch cap ----

test('property: A4 — a fit needing more than ±4% stretch is refused; within the cap is allowed', () => {
  forAll(
    gens.record({ voMs: gens.int(500, 20000), pct: gens.float(-20, 20) }),
    ({ voMs, pct }) => {
      const fitted = voMs * (1 + pct / 100)
      const allowed = isStretchAllowed(voMs, fitted)
      const claimed = Math.abs(stretchPct(voMs, fitted))
      return Math.abs(pct) > 4.001 ? !allowed : Math.abs(pct) < 3.999 ? allowed : Math.abs(claimed - Math.abs(pct)) < 0.01
    },
    { runs: 400 },
  )
})

// ---- A5: drift flag ----

test('property: A5 — drift beyond ±10% of target flags review (never blocks); within tolerance stays clean', () => {
  forAll(
    gens.record({ durMs: gens.int(2000, 20000), n: gens.int(1, 6), targetFactor: gens.float(0.5, 1.5) }),
    ({ durMs, n, targetFactor }) => {
      const scenes = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, voMs: durMs, maxMs: durMs + 1 }))
      const targetMs = Math.round(n * durMs * targetFactor)
      const r = solveTimeline(scenes, { targetMs })
      if (!r.ok) return false // drift is review, never block
      const drift = Math.abs((r.totalMs - targetMs) / targetMs) * 100
      const flagged = r.flags.some((f) => f.type === 'duration-drift' && f.severity === 'review')
      return drift > 10.05 ? flagged : drift < 9.95 ? !flagged : true
    },
    { runs: 300 },
  )
})

// ---- BDD ----

feature('Audio-first timing solver (Master Doc v2 §15)', () => {
  scenario('A 9s take cannot fit an 8s scene — it bounces to script with a word budget, whole solve blocked', () => {
    const r = when('we solve a scene whose VO overruns max', () =>
      solveTimeline([
        { id: 'hook', voMs: 3000, maxMs: 5000 },
        { id: 'body', voMs: 9000, maxMs: 8000 },
      ]),
    )
    then('the solve is not ok and no scene resolves (a half-solved timeline must never render)', () => {
      assert.equal(r.ok, false)
      assert.equal(r.scenes.length, 0)
    })
    and('the bounce carries the §15 word budget: 8s × 2.5 wps = 20 words', () => {
      assert.deepEqual(r.bounces.map((b) => ({ id: b.id, wordBudget: b.wordBudget })), [{ id: 'body', wordBudget: 20 }])
    })
  })

  scenario('A short take extends the visuals (a recorded hold), never silence or stretched audio', () => {
    const r = when('a 2.25s take (incl. pad) meets a 2.5s minimum', () => solveTimeline([{ id: 'cta', voMs: 2000, padAfterMs: 250, minMs: 2500 }]))
    then('the scene resolves to exactly min with the 250ms shortfall recorded as a hold', () => {
      assert.equal(r.ok, true)
      assert.equal(r.scenes[0].resolvedDurationMs, 2500)
      assert.equal(r.scenes[0].holdMs, 250)
    })
  })

  scenario('The solver is the only writer of resolved timing', () => {
    then('input that already carries resolved fields is rejected', () => {
      assert.throws(() => solveTimeline([{ id: 'x', voMs: 1000, resolvedStartMs: 0 }]), /only writer/)
    })
  })

  scenario('Degenerate constraints reproduce the concatenated narration layout (back-compat with synth-voice.py)', () => {
    const beats = given('measured per-beat narration timing as captions.json reports it', () => [
      { beatId: 'hook', startSec: 0, durSec: 4.2, words: ['a'] },
      { beatId: 'body', startSec: 4.52, durSec: 6.1, words: ['b'] },
    ])
    const r = when('we solve with pad = the 0.32s synth gap and no other constraints', () =>
      solveTimeline(scenesFromCaptions(beats), { transitionOverlapMs: 0, wordsPerSec: 2.5 }).scenes.map((s) => s.resolvedStartMs),
    )
    then('scene starts land exactly where the concatenated wav put the audio', () => {
      // starts: 0, then 4200+320 — matching captions.json's measured 4.52s
      const solved = solveTimeline(
        [
          { id: 'hook', voMs: 4200, padAfterMs: 320 },
          { id: 'body', voMs: 6100, padAfterMs: 320 },
        ],
        { transitionOverlapMs: 0 },
      )
      assert.deepEqual(solved.scenes.map((s) => s.resolvedStartMs), [0, 4520])
      assert.deepEqual(r, [0, 4200]) // without pad, starts pack tight — the constraint is explicit, not hidden
    })
  })

  scenario('Total drift beyond ±10% of the target flags the job for review without blocking it', () => {
    const r = when('a 70s solve targets 60s', () => solveTimeline([{ id: 'a', voMs: 70000 }], { targetMs: 60000 }))
    then('ok stays true but a review flag is raised', () => {
      assert.equal(r.ok, true)
      const f = r.flags.find((x) => x.type === 'duration-drift')
      assert.ok(f && f.severity === 'review')
      assert.ok(Math.abs(f.driftPct - 16.7) < 0.1)
    })
  })

  scenario('A scene that resolves shorter than the transition overlap blocks the solve', () => {
    const r = when('a 100ms scene meets a 150ms overlap', () => solveTimeline([{ id: 'blip', voMs: 100 }], { transitionOverlapMs: 150 }))
    then('the solve is blocked with a named flag', () => {
      assert.equal(r.ok, false)
      assert.ok(r.flags.some((f) => f.type === 'scene-shorter-than-overlap' && f.severity === 'block'))
    })
  })

  scenario('Caption beats emitted from the resolved timeline track the VOICE, not the held scene', () => {
    const solved = given('a resolved scene held to 5s around a 3s take', () => solveTimeline([{ id: 'hook', voMs: 3000, minMs: 5000 }]).scenes)
    const beats = when('we emit caption beats', () => toCaptionBeats(solved, { hook: ['forty', 'million', 'dollars'] }))
    then('the beat spans the 3s of speech at the resolved start; wordless scenes are skipped', () => {
      assert.deepEqual(beats, [{ beatId: 'hook', startSec: 0, durSec: 3, words: ['forty', 'million', 'dollars'] }])
      assert.deepEqual(toCaptionBeats(solved, {}), [])
    })
  })

  scenario('Tampered resolved timelines fail the independent re-check', () => {
    const good = given('a valid solve', () => solveTimeline([{ id: 'a', voMs: 2000 }, { id: 'b', voMs: 3000 }]).scenes)
    then('as-solved validates; a shifted start does not', () => {
      assert.equal(validateResolvedTimeline(good).valid, true)
      const bad = [good[0], { ...good[1], resolvedStartMs: good[1].resolvedStartMs + 40 }]
      assert.equal(validateResolvedTimeline(bad).valid, false)
    })
  })

  scenario('Malformed input is rejected loudly', () => {
    then('missing voMs, duplicate ids, and max<min all throw', () => {
      assert.throws(() => solveTimeline([{ id: 'a' }]), /voMs/)
      assert.throws(() => solveTimeline([{ id: 'a', voMs: 1000 }, { id: 'a', voMs: 1000 }]), /duplicate/)
      assert.throws(() => solveTimeline([{ id: 'a', voMs: 1000, minMs: 5000, maxMs: 4000 }]), /maxMs/)
    })
  })

  scenario('Word budgets follow the §15 formula', () => {
    then('wordBudgetForMs(8000) = 20 at the default 2.5 wps', () => {
      assert.equal(wordBudgetForMs(8000), 20)
      assert.equal(wordBudgetForMs(6600), 16)
    })
  })
})
