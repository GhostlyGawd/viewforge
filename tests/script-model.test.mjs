import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBeatSheet, validateScriptStructure, estimateSeconds, estimateWords } from '../lib/script-model.mjs'

test('estimate helpers are inverse-ish and sane', () => {
  assert.equal(estimateSeconds(150), 60)
  assert.equal(estimateWords(60), 150)
})

test('buildBeatSheet scales to target length and covers 0..target', () => {
  const beats = buildBeatSheet({ targetSeconds: 480, title: 'Why A Comma Cost $40M' })
  assert.equal(beats[0].startSec, 0)
  assert.equal(beats[beats.length - 1].endSec, 480)
  assert.ok(beats[0].purpose.includes('promise'))
  // beats are contiguous and increasing
  for (let i = 1; i < beats.length; i++) assert.ok(beats[i].startSec >= beats[i - 1].startSec)
})

test('beat sheet includes both re-engagement beats and a word budget', () => {
  const beats = buildBeatSheet({ targetSeconds: 600 })
  const ids = beats.map((b) => b.id)
  assert.ok(ids.includes('reengage-1'))
  assert.ok(ids.includes('reengage-2'))
  assert.ok(beats.every((b) => typeof b.wordBudget === 'number'))
})

test('buildBeatSheet rejects a non-positive target', () => {
  assert.throws(() => buildBeatSheet({ targetSeconds: 0 }))
})

test('validateScriptStructure passes a well-formed script', () => {
  const script = {
    targetSeconds: 300,
    beats: [
      { id: 'hook', startSec: 0, endSec: 12, text: 'A single comma once cost forty million dollars.' },
      { id: 'reengage-1', startSec: 84, endSec: 99, text: 'But here is the part the court missed.' },
      { id: 'reengage-2', startSec: 150, endSec: 168, text: 'Then it happened again — bigger.' },
      { id: 'payoff', startSec: 246, endSec: 288, text: 'And that is why the comma mattered.' },
      { id: 'outro', startSec: 288, endSec: 300, text: 'Next: the map that started a war.' },
    ],
  }
  const { valid, issues } = validateScriptStructure(script)
  assert.equal(valid, true, issues.join('; '))
})

test('validateScriptStructure flags a missing hook, missing re-engagement, and abrupt end', () => {
  const script = {
    beats: [
      { id: 'intro', startSec: 5, endSec: 40, text: 'Hello and welcome to the channel.' },
      { id: 'body', startSec: 40, endSec: 200, text: 'Here is some content.' },
    ],
  }
  const { valid, issues } = validateScriptStructure(script)
  assert.equal(valid, false)
  assert.ok(issues.some((i) => i.includes('t=0')))
  assert.ok(issues.some((i) => i.includes('re-engagement')))
  assert.ok(issues.some((i) => i.includes('abrupt')))
})

test('validateScriptStructure flags a dull gap (long beat, no content)', () => {
  const script = {
    beats: [
      { id: 'hook', startSec: 0, endSec: 10, text: 'Hook line.' },
      { id: 'reengage-1', startSec: 10, endSec: 25, text: 'reveal' },
      { id: 'reengage-2', startSec: 25, endSec: 40, text: 'reveal two' },
      { id: 'dead', startSec: 40, endSec: 120, text: '' }, // 80s of nothing
      { id: 'outro', startSec: 120, endSec: 130, text: 'bye' },
    ],
  }
  const { issues } = validateScriptStructure(script)
  assert.ok(issues.some((i) => i.includes('dull gap')))
})
