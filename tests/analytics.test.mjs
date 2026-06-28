import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeObservation, attributeToStrategy, evaluateStrategyEvidence, applyEvidence, isStale } from '../lib/analytics.mjs'

const strategy = () => ({ id: 'first-minute-retention', status: 'documented', confidence: 0.55, targetMetric: 'retention_30s', guardMetrics: ['likeRatio'], evidence: [] })

const obs = (cohort, dTarget, dGuard = 0, simulated = false) =>
  computeObservation({ videoId: 'v' + Math.round(dTarget * 1000), cohort, targetMetric: 'retention_30s', baseline: 0.5, treatment: 0.5 + dTarget, guards: [{ metric: 'likeRatio', baseline: 0.04, treatment: 0.04 + dGuard }], simulated })

test('computeObservation produces signed deltas vs baseline', () => {
  const o = computeObservation({ videoId: 'v1', cohort: 'holdout', targetMetric: 'AVP', baseline: 0.4, treatment: 0.46, guards: [{ metric: 'likeRatio', baseline: 0.04, treatment: 0.039 }] })
  assert.equal(o.target.delta, 0.06)
  assert.equal(o.guards[0].delta, -0.001)
  assert.equal(o.simulated, false)
})

test('attributeToStrategy matches on target metric', () => {
  const list = [obs('train', 0.05), computeObservation({ videoId: 'x', targetMetric: 'CTR', baseline: 0.05, treatment: 0.06 })]
  assert.equal(attributeToStrategy(list, strategy()).length, 1)
})

test('a documented strategy with real evidence moves to testing (not straight to validated)', () => {
  const v = evaluateStrategyEvidence(strategy(), [obs('train', 0.05), obs('train', 0.04)])
  assert.equal(v.nextStatus, 'testing')
  assert.equal(v.decision, 'keep-testing')
})

test('promotes to validated on enough out-of-sample wins with guards intact', () => {
  const observations = [obs('train', 0.05, 0.001), obs('train', 0.04, 0), obs('train', 0.06, 0.001), obs('holdout', 0.05, 0.001), obs('holdout', 0.03, 0)]
  const v = evaluateStrategyEvidence(strategy(), observations)
  assert.equal(v.nextStatus, 'validated')
  assert.equal(v.decision, 'promote')
  assert.ok(v.confidence > 0)
})

test('NEVER advances on simulated-only data (anti-fabrication)', () => {
  const sim = [obs('holdout', 0.1, 0.001, true), obs('holdout', 0.1, 0.001, true), obs('holdout', 0.1, 0.001, true), obs('holdout', 0.1, 0.001, true), obs('holdout', 0.1, 0.001, true)]
  const v = evaluateStrategyEvidence(strategy(), sim)
  assert.equal(v.decision, 'insufficient')
  assert.equal(v.nextStatus, 'documented')
  assert.ok(v.reasons.some((r) => r.includes('simulated')))
})

test('does not validate when a guard metric is sacrificed (Goodhart)', () => {
  const observations = [obs('train', 0.08, -0.05), obs('train', 0.08, -0.06), obs('train', 0.08, -0.05), obs('holdout', 0.08, -0.05), obs('holdout', 0.08, -0.06)]
  const v = evaluateStrategyEvidence(strategy(), observations)
  assert.notEqual(v.nextStatus, 'validated')
})

test('applyEvidence is immutable and appends evidence + refreshes review date', () => {
  const s = strategy()
  const { strategy: next, verdict } = applyEvidence(s, [obs('train', 0.05)], {}, () => '2026-07-01T00:00:00Z')
  assert.notStrictEqual(next, s)
  assert.equal(s.evidence.length, 0) // original untouched
  assert.equal(next.evidence.length, 1)
  assert.equal(next.lastReviewedUtc, '2026-07-01')
  assert.equal(next.status, verdict.nextStatus)
})

test('isStale flags strategies past the review horizon', () => {
  assert.equal(isStale({ lastReviewedUtc: '2025-01-01' }, '2026-06-28', 365), true)
  assert.equal(isStale({ lastReviewedUtc: '2026-06-01' }, '2026-06-28', 365), false)
})
