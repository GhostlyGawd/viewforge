import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HARD_CONSTRAINTS,
  checkHardConstraints,
  evaluatePromotion,
  detectGoodhart,
  PROMOTION_DEFAULTS,
} from '../lib/guards.mjs'

// ---- hard constraints --------------------------------------------------------

test('checkHardConstraints passes a clean motion-graphics plan', () => {
  const { ok, violations } = checkHardConstraints({ visualMode: 'motion-graphics', metricsSource: 'youtube-analytics' })
  assert.equal(ok, true)
  assert.equal(violations.length, 0)
})

test('the no-fake-human constraint exists and blocks an AI avatar plan', () => {
  assert.ok(HARD_CONSTRAINTS.some((c) => c.id === 'no-fake-human-visual'))
  const { ok, violations } = checkHardConstraints({ visualMode: 'ai-avatar' })
  assert.equal(ok, false)
  assert.ok(violations.some((v) => v.id === 'no-fake-human-visual' && v.severity === 'block'))
})

test('explicit usesFakeHumanAvatar flag is blocked regardless of visualMode', () => {
  const { ok } = checkHardConstraints({ visualMode: 'motion-graphics', usesFakeHumanAvatar: true })
  assert.equal(ok, false)
})

test('a disclosed stylized character is allowed', () => {
  const { ok } = checkHardConstraints({ visualMode: 'synthetic-human', disclosedAsSynthetic: true })
  assert.equal(ok, true)
})

test('fabricated metrics are blocked', () => {
  const { ok, violations } = checkHardConstraints({ visualMode: 'motion-graphics', metricsSource: 'fabricated' })
  assert.equal(ok, false)
  assert.ok(violations.some((v) => v.id === 'no-fabricated-metrics'))
})

test('deceptive clickbait (claim not paid off) is blocked', () => {
  const { ok } = checkHardConstraints({ visualMode: 'motion-graphics', packaging: { claimPaidOff: false } })
  assert.equal(ok, false)
})

test('AI media without disclosure warns but does not block', () => {
  const { ok, violations } = checkHardConstraints({ visualMode: 'motion-graphics', usesSyntheticVoice: true, aiDisclosure: false })
  assert.equal(ok, true) // warn-severity only
  assert.ok(violations.some((v) => v.id === 'disclose-ai-generation' && v.severity === 'warn'))
})

// ---- promotion gate (anti-overfit + anti-Goodhart) ---------------------------

const obs = (cohort, targetDelta, guards = []) => ({ cohort, target: { metric: 'AVP', delta: targetDelta }, guards })

test('does not promote below minimum sample size', () => {
  const r = evaluatePromotion([obs('holdout', 0.05), obs('holdout', 0.04)])
  assert.equal(r.promote, false)
  assert.ok(r.reasons.some((x) => x.includes('real observations')))
})

test('promotes when sample size, holdout wins, positive effect, and guards intact all hold', () => {
  const observations = [
    obs('train', 0.05, [{ metric: 'likeRatio', delta: 0.001 }]),
    obs('train', 0.04, [{ metric: 'likeRatio', delta: 0.0 }]),
    obs('train', 0.06, [{ metric: 'likeRatio', delta: 0.002 }]),
    obs('holdout', 0.05, [{ metric: 'likeRatio', delta: 0.001 }]),
    obs('holdout', 0.03, [{ metric: 'likeRatio', delta: 0.0 }]),
  ]
  const r = evaluatePromotion(observations)
  assert.equal(r.promote, true, r.reasons.join('; '))
  assert.ok(r.confidence > 0 && r.confidence <= 1)
})

test('refuses to promote without enough OUT-OF-SAMPLE wins (overfit guard)', () => {
  // 5 positive observations, but all on train cohort — overfit risk.
  const observations = Array.from({ length: 5 }, () => obs('train', 0.05))
  const r = evaluatePromotion(observations)
  assert.equal(r.promote, false)
  assert.ok(r.reasons.some((x) => x.includes('out-of-sample')))
})

test('refuses to promote when a guard metric is sacrificed (Goodhart guard)', () => {
  // Target up everywhere, but likeRatio collapses — classic reward hacking.
  const observations = [
    obs('train', 0.08, [{ metric: 'likeRatio', delta: -0.05 }]),
    obs('train', 0.08, [{ metric: 'likeRatio', delta: -0.06 }]),
    obs('train', 0.08, [{ metric: 'likeRatio', delta: -0.05 }]),
    obs('holdout', 0.08, [{ metric: 'likeRatio', delta: -0.05 }]),
    obs('holdout', 0.08, [{ metric: 'likeRatio', delta: -0.07 }]),
  ]
  const r = evaluatePromotion(observations)
  assert.equal(r.promote, false)
  assert.ok(r.reasons.some((x) => x.includes('likeRatio') && x.includes('reward-hacking')))
})

test('simulated observations cannot count toward promotion', () => {
  const observations = [
    { ...obs('holdout', 0.1), simulated: true },
    { ...obs('holdout', 0.1), simulated: true },
    { ...obs('holdout', 0.1), simulated: true },
    { ...obs('holdout', 0.1), simulated: true },
    { ...obs('holdout', 0.1), simulated: true },
  ]
  const r = evaluatePromotion(observations)
  assert.equal(r.promote, false)
  assert.ok(r.reasons.some((x) => x.includes('simulated')))
})

test('detectGoodhart flags a single gamed observation', () => {
  const g = detectGoodhart({ target: { delta: 0.05 }, guards: [{ metric: 'likeRatio', delta: -0.1 }] })
  assert.equal(g.gamed, true)
  assert.equal(g.sacrificed[0].metric, 'likeRatio')
})

test('detectGoodhart is clean when guards hold', () => {
  const g = detectGoodhart({ target: { delta: 0.05 }, guards: [{ metric: 'likeRatio', delta: 0.001 }] })
  assert.equal(g.gamed, false)
})

test('PROMOTION_DEFAULTS are sane and frozen', () => {
  assert.ok(PROMOTION_DEFAULTS.minObservations >= 3)
  assert.throws(() => (PROMOTION_DEFAULTS.minObservations = 1))
})
