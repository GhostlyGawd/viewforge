import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveTags, buildChapters, buildPublishPackage, validatePublishPackage } from '../lib/distribution.mjs'

const beats = [
  { id: 'hook', startSec: 0, endSec: 14, text: 'A single comma cost forty million dollars. Here is how.' },
  { id: 'progression', startSec: 14, endSec: 101 },
  { id: 'reengage-1', startSec: 101, endSec: 119 },
  { id: 'payoff', startSec: 295, endSec: 346 },
  { id: 'outro', startSec: 346, endSec: 360 },
]

test('deriveTags drops stopwords, dedupes, and respects the char budget', () => {
  const tags = deriveTags({ title: 'Why A Misplaced Comma Cost 40 Million Dollars', niche: 'micro-history', format: 'case-study' })
  assert.ok(tags.includes('comma'))
  assert.ok(tags.includes('micro-history'))
  assert.ok(!tags.includes('a'))
  assert.equal(new Set(tags).size, tags.length)
})

test('buildChapters starts at 00:00 and enforces ≥10s spacing', () => {
  const ch = buildChapters(beats)
  assert.equal(ch[0].startSec, 0)
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i].startSec - ch[i - 1].startSec >= 10)
})

test('buildPublishPackage assembles description with chapters + sources + disclosure', () => {
  const pkg = buildPublishPackage({
    video: { title: 'Why A Misplaced Comma Cost 40 Million Dollars' },
    script: { beats, sourcesGrounded: [{ claim: '1872 Tariff Act comma ≈ $40M today', source: 'legal-history reporting' }] },
    niche: 'micro-history', format: 'case-study',
    brand: { name: 'Marginalia' },
    narrationDisclosureRequired: true,
  })
  assert.ok(pkg.description.includes('Chapters:'))
  assert.ok(pkg.description.includes('Sources:'))
  assert.ok(pkg.disclosures.some((d) => /synthetic/i.test(d)))
  assert.ok(pkg.tags.length > 0)
})

test('validatePublishPackage passes a good package and enforces disclosure', () => {
  const pkg = buildPublishPackage({ video: { title: 'The Map That Started A War' }, script: { beats }, niche: 'history', format: 'map-morph', narrationDisclosureRequired: true })
  assert.equal(validatePublishPackage(pkg, { requireDisclosure: true }).valid, true)
})

test('validatePublishPackage flags missing disclosure and bad chapters', () => {
  const bad = { title: 'X', description: 'd', chapters: [{ startSec: 5, label: 'a' }], tags: [], disclosures: [] }
  const r = validatePublishPackage(bad, { requireDisclosure: true })
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((i) => i.includes('00:00')))
  assert.ok(r.issues.some((i) => i.includes('disclosure')))
})
