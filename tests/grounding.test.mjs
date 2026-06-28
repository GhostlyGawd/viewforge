import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkClaimGrounding, scoreVideoIdea } from '../lib/video-idea.mjs'

test('checkClaimGrounding flags an ungrounded quantified title', () => {
  const r = checkClaimGrounding({ title: 'Why A Misplaced Comma Cost 40 Million Dollars' })
  assert.equal(r.needsGrounding, true)
  assert.equal(r.grounded, false)
  assert.ok(r.reason.includes('quantified'))
})

test('checkClaimGrounding passes when a claimSource is supplied', () => {
  const r = checkClaimGrounding({ title: 'Why A Misplaced Comma Cost 40 Million Dollars', claimSource: '1872 US Tariff Act comma' })
  assert.equal(r.grounded, true)
  assert.equal(r.reason, null)
})

test('checkClaimGrounding flags a superlative claim too', () => {
  const r = checkClaimGrounding({ title: 'The Deadliest Border In History' })
  assert.equal(r.needsGrounding, true)
  assert.equal(r.grounded, false)
})

test('a title with no quantified/superlative claim needs no grounding', () => {
  const r = checkClaimGrounding({ title: 'How One Sheep Redrew A Border' })
  assert.equal(r.needsGrounding, false)
  assert.equal(r.grounded, true)
})

test('scoreVideoIdea surfaces a groundingWarning (non-blocking) for unsourced numbers', () => {
  const r = scoreVideoIdea({ title: 'Why A Comma Cost 40 Million Dollars', claimPaidOff: true, demand: 7, productionFit: 8 })
  assert.equal(r.blocked, false) // not a hard block
  assert.ok(r.groundingWarning && r.groundingWarning.includes('ground it'))
})

test('groundingWarning clears once a claimSource is attached', () => {
  const r = scoreVideoIdea({ title: 'Why A Comma Cost 40 Million Dollars', claimPaidOff: true, demand: 7, productionFit: 8, claimSource: '1872 Tariff Act' })
  assert.equal(r.groundingWarning, null)
})
