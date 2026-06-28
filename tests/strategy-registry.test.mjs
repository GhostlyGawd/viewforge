import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateStrategy, queryStrategies, STRATEGY_STATUS, KNOWN_METRICS } from '../lib/strategy-registry.mjs'

const base = () => ({
  id: 'first-minute-retention',
  title: 'Win retention in the first minute',
  category: 'retention',
  principle: 'The first minute decides whether the viewer stays.',
  targetMetric: 'retention_30s',
  guardMetrics: ['AVP'],
  status: 'documented',
  confidence: 0.5,
  source: { kind: 'external', name: 'MrBeast memo', url: 'https://example.com', quote: 'we freak out about the first minute' },
  evidence: [],
})

test('validateStrategy accepts a well-formed external strategy', () => {
  const { valid, errors } = validateStrategy(base())
  assert.equal(valid, true, errors.join('; '))
})

test('validateStrategy rejects missing required fields', () => {
  const s = base()
  delete s.targetMetric
  const { valid, errors } = validateStrategy(s)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('targetMetric')))
})

test('validateStrategy enforces kebab-case id', () => {
  const s = base()
  s.id = 'First_Minute'
  const { valid, errors } = validateStrategy(s)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('kebab')))
})

test('validateStrategy rejects unknown status and metric', () => {
  const s = base()
  s.status = 'awesome'
  s.targetMetric = 'vibes'
  const { errors } = validateStrategy(s)
  assert.ok(errors.some((e) => e.includes('status')))
  assert.ok(errors.some((e) => e.includes('targetMetric')))
})

test('validateStrategy: external source must have a name AND an anchor (url or quote)', () => {
  const s = base()
  s.source = { kind: 'external', name: 'Anonymous' } // no url, no quote
  const { valid, errors } = validateStrategy(s)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('url or a quote')))
})

test('validateStrategy: internal-source idea cannot be documented and needs rationale', () => {
  const s = base()
  s.source = { kind: 'internal' } // no rationale, status documented
  const r1 = validateStrategy(s)
  assert.equal(r1.valid, false)
  assert.ok(r1.errors.some((e) => e.includes('rationale')))
  assert.ok(r1.errors.some((e) => e.includes('"documented"')))

  s.status = 'hypothesis'
  s.source = { kind: 'internal', rationale: 'derived from the crazy-progression principle' }
  assert.equal(validateStrategy(s).valid, true)
})

test('validateStrategy rejects out-of-range confidence', () => {
  const s = base()
  s.confidence = 1.5
  assert.equal(validateStrategy(s).valid, false)
})

test('queryStrategies filters by status, category, metric, confidence and sorts by confidence desc', () => {
  const a = { ...base(), id: 'a', confidence: 0.9, status: 'validated', category: 'retention' }
  const b = { ...base(), id: 'b', confidence: 0.4, status: 'documented', category: 'retention' }
  const c = { ...base(), id: 'c', confidence: 0.8, status: 'validated', category: 'packaging', targetMetric: 'CTR' }
  const list = [a, b, c]

  const validated = queryStrategies(list, { status: 'validated' })
  assert.deepEqual(validated.map((s) => s.id), ['a', 'c'])

  const retention = queryStrategies(list, { category: 'retention' })
  assert.deepEqual(retention.map((s) => s.id), ['a', 'b'])

  const ctr = queryStrategies(list, { targetMetric: 'CTR' })
  assert.deepEqual(ctr.map((s) => s.id), ['c'])

  const conf = queryStrategies(list, { minConfidence: 0.5 })
  assert.deepEqual(conf.map((s) => s.id), ['a', 'c'])
})

test('queryStrategies appliesTo matches the stage', () => {
  const a = { ...base(), id: 'a', appliesTo: ['script', 'edit'] }
  const b = { ...base(), id: 'b', appliesTo: ['thumbnail'] }
  const res = queryStrategies([a, b], { appliesTo: 'edit' })
  assert.deepEqual(res.map((s) => s.id), ['a'])
})

test('exports are frozen and non-empty', () => {
  assert.ok(STRATEGY_STATUS.includes('validated'))
  assert.ok(KNOWN_METRICS.includes('AVP'))
  assert.throws(() => STRATEGY_STATUS.push('x'))
})
