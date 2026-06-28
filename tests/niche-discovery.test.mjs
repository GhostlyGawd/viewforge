import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DISCOVERY_LENSES,
  normalizeNicheName,
  dedupeCandidates,
  isFacelessFriendly,
  filterFaceless,
} from '../lib/niche-discovery.mjs'

test('DISCOVERY_LENSES spans distinct angles and is frozen', () => {
  const ids = DISCOVERY_LENSES.map((l) => l.id)
  assert.ok(ids.includes('trending'))
  assert.ok(ids.includes('high-rpm'))
  assert.ok(ids.includes('whitespace'))
  assert.equal(new Set(ids).size, ids.length, 'lens ids are unique')
  assert.throws(() => DISCOVERY_LENSES.push({}))
})

test('normalizeNicheName collapses filler so near-duplicates collide', () => {
  assert.equal(normalizeNicheName('Deep-Space Explainer Videos'), normalizeNicheName('deep space explainers'))
  assert.equal(normalizeNicheName('Personal Finance (channel ideas)'), 'personal finance')
})

test('dedupeCandidates merges duplicates and unions their lenses', () => {
  const merged = dedupeCandidates([
    { name: 'Deep space explainers', lenses: ['trending'] },
    { name: 'Deep-Space Explainer videos', lenses: ['whitespace'] },
    { name: 'Personal finance', lenses: ['high-rpm'] },
  ])
  assert.equal(merged.length, 2)
  const space = merged.find((m) => m.name.toLowerCase().includes('deep space'))
  assert.deepEqual([...space.lenses].sort(), ['trending', 'whitespace'])
})

test('dedupeCandidates skips nameless entries and rejects non-arrays', () => {
  assert.equal(dedupeCandidates([{ foo: 1 }, { name: '' }]).length, 0)
  assert.throws(() => dedupeCandidates('nope'))
})

test('isFacelessFriendly rejects inherently face-led niches, keeps motion-fit ones', () => {
  assert.equal(isFacelessFriendly('Daily vlogging life'), false)
  assert.equal(isFacelessFriendly('Makeup tutorial channel'), false)
  assert.equal(isFacelessFriendly('Reaction videos'), false)
  assert.equal(isFacelessFriendly('Animated history mysteries'), true)
  assert.equal(isFacelessFriendly('Deep-space explainers'), true)
})

test('filterFaceless partitions candidates', () => {
  const { kept, dropped } = filterFaceless([
    { name: 'Animated science explainers' },
    { name: 'Talking head finance tips' },
    { name: 'Data-driven sports breakdowns' },
  ])
  assert.equal(kept.length, 2)
  assert.equal(dropped.length, 1)
  assert.equal(dropped[0].name, 'Talking head finance tips')
})
