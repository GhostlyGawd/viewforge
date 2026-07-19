// Plan 09 — closed-loop creation + calibrated judging (the open-loop root cause).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOOP_DEFAULTS, HERO_GRAMMARS, allocateCycles, validateCritique, startLoop, recordCycle, bestCycle, loopVerdict } from '../lib/design-loop.mjs'
import { RUBRIC_V2, scoreRubricV2, recordCalibration, calibrationError, rubricNeedsRevision, CRAFT_DIMENSION_IDS } from '../lib/quality-bar.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

// ---- cycle allocation ----

test('allocateCycles: idea-carrying grammars get deep budgets, connective scenes lighter, overrides honored', () => {
  const scenes = [
    { beatId: 'hook', params: { sceneType: 'kinetic-open' } },
    { beatId: 'mid', params: { sceneType: 'photo-caption' } },
    { beatId: 'payoff', params: { sceneType: 'money-payoff' } },
  ]
  const a = allocateCycles(scenes)
  assert.equal(a.hook, LOOP_DEFAULTS.heroCycles)
  assert.equal(a.mid, LOOP_DEFAULTS.standardCycles)
  assert.equal(a.payoff, LOOP_DEFAULTS.heroCycles)
  const b = allocateCycles(scenes, { heroSceneIds: ['mid'] })
  assert.equal(b.mid, LOOP_DEFAULTS.heroCycles)
  assert.ok(HERO_GRAMMARS.includes('mechanism'))
})

// ---- the loop state machine ----

const crit = (over = {}) => ({ dimensions: ['motion-choreography'], observed: 'entrance pops with no anticipation', change: 'add 4-frame anticipation dip before the spring', ...over })

test('property: the loop always ships the BEST cycle, never blindly the last', () => {
  forAll(
    (rng) => Array.from({ length: gens.int(2, 8)(rng) }, () => gens.int(20, 95)(rng)),
    (scores) => {
      let state = startLoop('hook', { cycles: scores.length, target: 101 }) // target unreachable → run to budget
      scores.forEach((s, i) => {
        state = recordCycle(state, { judgeScore: s, critique: i > 0 ? crit() : null, renderKey: `sha256:c${i}` })
      })
      const v = loopVerdict(state)
      return v.done && bestCycle(state).judgeScore === Math.max(...scores) && v.best.renderKey === `sha256:c${scores.indexOf(Math.max(...scores))}`
    },
    { runs: 200 },
  )
})

feature('The design loop (perceive → adjust → perceive)', () => {
  scenario('reaching the target stops the loop with cycles to spare', () => {
    const s = given('a loop with budget 10, target 87', () => startLoop('hook', { cycles: 10 }))
    const s3 = when('scores climb 40 → 70 → 88', () => {
      let st = recordCycle(s, { judgeScore: 40, renderKey: 'sha256:a' })
      st = recordCycle(st, { judgeScore: 70, critique: crit(), renderKey: 'sha256:b' })
      return recordCycle(st, { judgeScore: 88, critique: crit(), renderKey: 'sha256:c' })
    })
    then('the verdict is target, best = 88, improvement recorded', () => {
      const v = loopVerdict(s3)
      assert.deepEqual([v.done, v.reason, v.best.judgeScore, v.improvedFromFirst], [true, 'target', 88, 48])
    })
  })

  scenario('a plateau stops the loop — cycles without improvement are money without taste', () => {
    let st = startLoop('mid', { cycles: 10 })
    ;[50, 51, 51.5, 52].forEach((score, i) => {
      st = recordCycle(st, { judgeScore: score, critique: i > 0 ? crit() : null, renderKey: `sha256:p${i}` })
    })
    const v = loopVerdict(st)
    assert.equal(v.done, true)
    assert.equal(v.reason, 'plateau')
  })

  scenario('the loop is honest about its own limits: budget exhaustion ships the best, and the SHIP GATE still decides', () => {
    let st = startLoop('mid', { cycles: 2 })
    st = recordCycle(st, { judgeScore: 35, renderKey: 'sha256:x' })
    st = recordCycle(st, { judgeScore: 42, critique: crit(), renderKey: 'sha256:y' })
    const v = loopVerdict(st)
    assert.deepEqual([v.done, v.reason, v.best.judgeScore], [true, 'budget', 42]) // 42 < 87: improved AND still not shippable — both true
  })

  scenario('discipline: unscored cycles, vibes-critiques, and over-budget cycles are refused', () => {
    const s = startLoop('hook', { cycles: 1 })
    then('the rules hold', () => {
      assert.throws(() => recordCycle(s, { renderKey: 'sha256:k' }), /judgeScore/)
      assert.throws(() => recordCycle(recordCycle(s, { judgeScore: 50, renderKey: 'sha256:k' }), { judgeScore: 60, critique: crit(), renderKey: 'sha256:l' }), /budget exhausted/)
      const twoCycle = recordCycle(startLoop('hook', { cycles: 3 }), { judgeScore: 50, renderKey: 'sha256:k' })
      assert.throws(() => recordCycle(twoCycle, { judgeScore: 60, critique: { observed: 'meh', change: 'make it pop' }, renderKey: 'sha256:l' }), /rubric dimension/)
      const r = validateCritique({ dimensions: ['not-a-dimension'], observed: 'x', change: 'y' })
      assert.equal(r.valid, false)
    })
  })
})

// ---- rubric v2 + the calibration ledger ----

test('rubric v2: weights sum to 1, visual-ideation leads, 0–10 scale, missing dims never help', () => {
  assert.ok(Math.abs(RUBRIC_V2.reduce((a, d) => a + d.weight, 0) - 1) < 1e-9)
  assert.equal(RUBRIC_V2[0].id, 'visual-ideation')
  assert.ok(RUBRIC_V2[0].weight >= Math.max(...RUBRIC_V2.map((d) => d.weight)) - 1e-9)
  assert.equal(scoreRubricV2(Object.fromEntries(RUBRIC_V2.map((d) => [d.id, 10]))).score, 100)
  assert.equal(scoreRubricV2({ 'visual-ideation': 10 }).score, 25)
  for (const d of RUBRIC_V2) assert.ok(CRAFT_DIMENSION_IDS.includes(d.id))
  for (const d of RUBRIC_V2) assert.ok(d.anchor9 && d.anchor3 && d.question) // exemplar-anchored, not adjectives
})

feature('The calibration ledger — the rubric is the hypothesis, the operator is the data', () => {
  scenario('the REAL first entry: rubric v1 scored 78, the operator scored 39 — the ledger says revise', () => {
    const ledger = when('we record what actually happened on 2026-07-12', () =>
      recordCalibration([], { videoId: 'marginalia-ep01-story', rubricVersion: 'v1', rubricScore: 78.1, operatorScore: 39, notes: 'self-scored by the maker; defect-absence rubric; still-based judging' }),
    )
    then('the error is +39.1 and v1 is inadmissible', () => {
      const e = calibrationError(ledger, { rubricVersion: 'v1' })
      assert.deepEqual([e.n, e.meanAbsError, e.bias], [1, 39.1, 39.1])
      const r = rubricNeedsRevision(ledger, { rubricVersion: 'v1' })
      assert.equal(r.revise, true)
      assert.match(r.reason, /not measuring what the operator values/)
    })
    and('a version that tracks the operator within tolerance is admissible', () => {
      let l2 = recordCalibration([], { videoId: 'v1', rubricVersion: 'v2', rubricScore: 44, operatorScore: 41 })
      l2 = recordCalibration(l2, { videoId: 'v2', rubricVersion: 'v2', rubricScore: 58, operatorScore: 63 })
      assert.equal(rubricNeedsRevision(l2, { rubricVersion: 'v2' }).revise, false)
    })
    and('no data yet means "collect scores", never a free pass', () => {
      assert.match(rubricNeedsRevision([], { rubricVersion: 'v3' }).reason, /no calibration data/)
    })
  })

  scenario('ledger discipline: unattributed or out-of-range scores are refused; the ledger is immutable', () => {
    then('the rules hold', () => {
      assert.throws(() => recordCalibration([], { videoId: 'v', rubricScore: 50, operatorScore: 40 }), /rubricVersion/)
      assert.throws(() => recordCalibration([], { videoId: 'v', rubricVersion: 'v2', rubricScore: 105, operatorScore: 40 }), /0–100/)
      const l = recordCalibration([], { videoId: 'v', rubricVersion: 'v2', rubricScore: 50, operatorScore: 40 })
      assert.throws(() => l.push({}), TypeError)
    })
  })
})
