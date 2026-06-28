import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNarrationSpec, validateNarrationSpec, recommendTtsEngine, TTS_ENGINES } from '../lib/voice-spec.mjs'

test('recommended TTS engines are free and local', () => {
  assert.ok(TTS_ENGINES.every((e) => e.cost === 'free' && e.local === true))
  assert.equal(recommendTtsEngine().id, 'piper')
  assert.equal(recommendTtsEngine('xtts').id, 'xtts')
  assert.equal(recommendTtsEngine('nonexistent').id, 'piper') // falls back to default
})

test('buildNarrationSpec produces per-beat segments with timing + ssml', () => {
  const script = {
    beats: [
      { id: 'hook', startSec: 0, endSec: 12, text: 'A single comma once cost forty million dollars. Here is how.' },
      { id: 'payoff', startSec: 12, endSec: 30, text: 'The court read the clause literally.' },
    ],
  }
  const spec = buildNarrationSpec(script)
  assert.equal(spec.engine.id, 'piper')
  assert.equal(spec.segments.length, 2)
  assert.ok(spec.segments[0].ssml.includes('<speak>'))
  assert.ok(spec.totalWords > 0)
  assert.ok(spec.disclosureRequired)
})

test('a segment that overruns its window is flagged not-fitting', () => {
  const longText = 'word '.repeat(60).trim() // ~60 words ≈ 24s of speech
  const script = { beats: [{ id: 'hook', startSec: 0, endSec: 5, text: longText }] } // 5s window
  const spec = buildNarrationSpec(script)
  assert.equal(spec.segments[0].fits, false)
  const { valid, issues } = validateNarrationSpec(spec)
  assert.equal(valid, false)
  assert.ok(issues.some((i) => i.includes('overruns')))
})

test('validateNarrationSpec passes when segments fit', () => {
  const script = { beats: [{ id: 'hook', startSec: 0, endSec: 30, text: 'Short line that fits.' }] }
  assert.equal(validateNarrationSpec(buildNarrationSpec(script)).valid, true)
})

test('buildNarrationSpec requires beats', () => {
  assert.throws(() => buildNarrationSpec({}))
})
