import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveBrandBrief, validateBrandRecord, BRAND_DELIVERABLES, REQUIRED_BRAND_FIELDS } from '../lib/brand-brief.mjs'

const niche = { name: 'deep-space-explainers', factors: { differentiability: 8 } }

test('deriveBrandBrief produces a motion-graphics, no-fake-human brief', () => {
  const brief = deriveBrandBrief(niche)
  assert.equal(brief.visualDirection.mode, 'motion-graphics')
  assert.equal(brief.visualDirection.noFakeHuman, true)
  assert.equal(brief.delegateTo, 'brand-studio')
  assert.deepEqual(brief.deliverables, [...BRAND_DELIVERABLES])
})

test('deriveBrandBrief title-cases the working concept', () => {
  assert.equal(deriveBrandBrief(niche).workingConcept, 'Deep Space Explainers')
})

test('deriveBrandBrief surfaces open questions for unknowns instead of inventing them', () => {
  const brief = deriveBrandBrief(niche)
  assert.ok(brief.openQuestions.some((q) => q.includes('target viewer')))
  assert.ok(brief.openQuestions.some((q) => q.includes('wow factor')))
})

test('deriveBrandBrief uses supplied audience/wowFactor/tone when present', () => {
  const brief = deriveBrandBrief({ ...niche, audience: 'space-curious teens', wowFactor: 'real-scale orbital sims', toneSeeds: ['awe', 'precise', 'warm'] })
  assert.equal(brief.audience, 'space-curious teens')
  assert.equal(brief.wowFactor, 'real-scale orbital sims')
  assert.equal(brief.openQuestions.length, 0)
})

test('deriveBrandBrief throws on a nameless niche', () => {
  assert.throws(() => deriveBrandBrief({}))
})

test('validateBrandRecord requires every deliverable', () => {
  const complete = Object.fromEntries(REQUIRED_BRAND_FIELDS.map((f) => [f, 'x']))
  assert.equal(validateBrandRecord(complete).valid, true)

  const { valid, errors } = validateBrandRecord({ name: 'X', palette: 'p' })
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('voiceGuide')))
  assert.ok(errors.some((e) => e.includes('motionIdentity')))
})

test('validateBrandRecord rejects empty arrays and fake-human identities', () => {
  const complete = Object.fromEntries(REQUIRED_BRAND_FIELDS.map((f) => [f, 'x']))
  assert.equal(validateBrandRecord({ ...complete, logo: [] }).valid, false)

  const fake1 = validateBrandRecord({ ...complete, visualMode: 'ai-avatar' })
  assert.equal(fake1.valid, false)
  assert.ok(fake1.errors.some((e) => e.includes('no-fake-human')))

  const fake2 = validateBrandRecord({ ...complete, usesFakeHumanPresenter: true })
  assert.equal(fake2.valid, false)
})
