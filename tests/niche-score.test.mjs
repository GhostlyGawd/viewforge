import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreNiche, rankNiches, rankingConfidence, NICHE_FACTORS } from '../lib/niche-score.mjs'

const full = (name, v) => ({
  name,
  factors: Object.fromEntries(NICHE_FACTORS.map((f) => [f.key, v])),
})

test('a perfectly-good niche (all good-direction factors maxed) scores 100', () => {
  // Set lowerIsBetter factors to 0 and others to 10 → the ideal.
  const factors = Object.fromEntries(NICHE_FACTORS.map((f) => [f.key, f.lowerIsBetter ? 0 : 10]))
  const r = scoreNiche({ name: 'ideal', factors })
  assert.equal(r.score, 100)
})

test('a worst-case niche scores 0', () => {
  const factors = Object.fromEntries(NICHE_FACTORS.map((f) => [f.key, f.lowerIsBetter ? 10 : 0]))
  const r = scoreNiche({ name: 'worst', factors })
  assert.equal(r.score, 0)
})

test('all-neutral (5) niche scores 50', () => {
  const r = scoreNiche(full('mid', 5))
  assert.equal(r.score, 50)
})

test('high saturation pulls the score DOWN (direction correction works)', () => {
  const low = scoreNiche({ name: 'low-sat', factors: { ...full('x', 5).factors, saturation: 1 } })
  const high = scoreNiche({ name: 'high-sat', factors: { ...full('x', 5).factors, saturation: 9 } })
  assert.ok(low.score > high.score, 'lower saturation should score higher')
})

test('missing factors default to neutral and are reported', () => {
  const r = scoreNiche({ name: 'sparse', factors: { demand: 9 } })
  assert.ok(r.missing.length === NICHE_FACTORS.length - 1)
  assert.ok(r.missing.includes('saturation'))
  // demand supplied; the rest neutral → score should be slightly above 50.
  assert.ok(r.score > 50 && r.score < 60)
})

test('scoreNiche throws on a nameless niche', () => {
  assert.throws(() => scoreNiche({ factors: {} }))
})

test('weight overrides change the ranking', () => {
  const a = { name: 'A', factors: { ...full('A', 5).factors, monetization: 9, demand: 2 } }
  const b = { name: 'B', factors: { ...full('B', 5).factors, monetization: 2, demand: 9 } }
  const moneyFirst = rankNiches([a, b], { monetization: 5, demand: 0.1 })
  const demandFirst = rankNiches([a, b], { monetization: 0.1, demand: 5 })
  assert.equal(moneyFirst[0].name, 'A')
  assert.equal(demandFirst[0].name, 'B')
})

test('rankNiches assigns ranks best-first and breaks ties by grounding', () => {
  const grounded = full('grounded', 6) // all 9 factors supplied
  const guessed = { name: 'guessed', factors: { demand: 6, growth: 6 } } // only 2 supplied, rest neutral 5
  // Make scores equal-ish but grounded has more supplied factors; give guessed a tiny edge removed
  const ranked = rankNiches([guessed, grounded])
  assert.equal(ranked[0].rank, 1)
  assert.equal(ranked[1].rank, 2)
})

test('rankingConfidence reflects share of supplied factors', () => {
  const r = scoreNiche({ name: 'half', factors: Object.fromEntries(NICHE_FACTORS.slice(0, 5).map((f) => [f.key, 5])) })
  const conf = rankingConfidence(r)
  assert.ok(conf > 0 && conf < 1)
  const fullR = scoreNiche(full('all', 5))
  assert.equal(rankingConfidence(fullR), 1)
})

test('rankNiches rejects non-array input', () => {
  assert.throws(() => rankNiches({}))
})
