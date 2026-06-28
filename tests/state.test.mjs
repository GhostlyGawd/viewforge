import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  newChannel,
  validateChannel,
  createChannel,
  loadChannel,
  updateChannel,
  appendEvent,
  advanceStage,
  listChannels,
  setBrand,
  addVideo,
  CHANNEL_STAGES,
} from '../lib/state.mjs'

// Deterministic clock so timestamps are predictable in assertions.
let tick = 0
const now = () => `2026-06-28T00:00:${String(tick++).padStart(2, '0')}.000Z`
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'viewforge-state-'))

test('newChannel builds a valid channel with a kebab slug derived from the name', () => {
  const c = newChannel({ name: 'Deep Space Explained' }, now)
  assert.equal(c.slug, 'deep-space-explained')
  assert.equal(c.stage, 'niche')
  assert.equal(validateChannel(c).valid, true)
  assert.equal(c.log[0].event, 'channel.created')
})

test('newChannel requires a name', () => {
  assert.throws(() => newChannel({}, now))
})

test('validateChannel rejects a bad stage and non-array fields', () => {
  const c = newChannel({ name: 'X' }, now)
  c.stage = 'nope'
  c.videos = 'not-an-array'
  const { valid, errors } = validateChannel(c)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('stage')))
  assert.ok(errors.some((e) => e.includes('videos')))
})

test('createChannel persists and loadChannel round-trips', () => {
  const root = tmpRoot()
  const created = createChannel(root, { name: 'Mecha History' }, now)
  const loaded = loadChannel(root, 'mecha-history')
  assert.deepEqual(loaded, created)
})

test('createChannel refuses to overwrite an existing channel', () => {
  const root = tmpRoot()
  createChannel(root, { name: 'Dup' }, now)
  assert.throws(() => createChannel(root, { name: 'Dup' }, now), /already exists/)
})

test('updateChannel is immutable, bumps updatedUtc, protects slug/createdUtc, and logs', () => {
  const root = tmpRoot()
  const created = createChannel(root, { name: 'Brand Me' }, now)
  const updated = updateChannel(
    root,
    'brand-me',
    { brand: { palette: 'chartreuse' }, slug: 'hacked', createdUtc: 'hacked' },
    { event: 'brand.set', detail: { palette: 'chartreuse' } },
    now,
  )
  assert.equal(updated.brand.palette, 'chartreuse')
  assert.equal(updated.slug, 'brand-me', 'slug is protected')
  assert.equal(updated.createdUtc, created.createdUtc, 'createdUtc is protected')
  assert.notEqual(updated.updatedUtc, created.updatedUtc)
  assert.equal(updated.log.at(-1).event, 'brand.set')
  // original object on disk before update is unchanged in identity (immutability):
  assert.notStrictEqual(updated, created)
})

test('updateChannel refuses to write an invalid update and leaves disk untouched', () => {
  const root = tmpRoot()
  createChannel(root, { name: 'Safe' }, now)
  assert.throws(() => updateChannel(root, 'safe', { stage: 'invalid-stage' }, null, now))
  // disk still valid + still on original stage
  assert.equal(loadChannel(root, 'safe').stage, 'niche')
})

test('appendEvent adds to the log without changing other fields', () => {
  const root = tmpRoot()
  createChannel(root, { name: 'Logger' }, now)
  const before = loadChannel(root, 'logger')
  const after = appendEvent(root, 'logger', 'research.started', { videos: 3 }, now)
  assert.equal(after.log.length, before.log.length + 1)
  assert.equal(after.stage, before.stage)
})

test('advanceStage moves forward and refuses to go backward without force', () => {
  const root = tmpRoot()
  createChannel(root, { name: 'Mover' }, now)
  const atBrand = advanceStage(root, 'mover', 'brand', {}, now)
  assert.equal(atBrand.stage, 'brand')
  assert.throws(() => advanceStage(root, 'mover', 'niche', {}, now), /backward/)
  const forced = advanceStage(root, 'mover', 'niche', { force: true }, now)
  assert.equal(forced.stage, 'niche')
})

test('listChannels returns sorted slugs and ignores _example/hidden dirs', () => {
  const root = tmpRoot()
  createChannel(root, { name: 'Zeta' }, now)
  createChannel(root, { name: 'Alpha' }, now)
  fs.mkdirSync(path.join(root, 'channels', '_example'), { recursive: true })
  assert.deepEqual(listChannels(root), ['alpha', 'zeta'])
})

test('setBrand stores the brand and logs it', () => {
  const root = tmpRoot()
  createChannel(root, { name: 'Branded' }, now)
  const c = setBrand(root, 'branded', { name: 'Orbit', palette: 'cyan' }, now)
  assert.equal(c.brand.name, 'Orbit')
  assert.equal(c.log.at(-1).event, 'brand.set')
})

test('addVideo assigns ids, appends immutably, and rejects untitled/dupes', () => {
  const root = tmpRoot()
  createChannel(root, { name: 'Vids' }, now)
  const c1 = addVideo(root, 'vids', { title: 'First' }, now)
  assert.equal(c1.videos[0].id, 'vid-1')
  assert.equal(c1.videos[0].stage, 'idea')
  const c2 = addVideo(root, 'vids', { title: 'Second' }, now)
  assert.equal(c2.videos.length, 2)
  assert.equal(c2.videos[1].id, 'vid-2')
  assert.throws(() => addVideo(root, 'vids', {}, now), /title/)
  assert.throws(() => addVideo(root, 'vids', { id: 'vid-1', title: 'dupe' }, now), /duplicate/)
})

test('CHANNEL_STAGES is ordered and frozen', () => {
  assert.equal(CHANNEL_STAGES[0], 'niche')
  assert.equal(CHANNEL_STAGES.at(-1), 'live')
  assert.throws(() => CHANNEL_STAGES.push('x'))
})
