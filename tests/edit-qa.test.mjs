import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runEditQa, assembleTimeline } from '../lib/edit-qa.mjs'
import { buildBeatSheet } from '../lib/script-model.mjs'
import { buildMotionPlan } from '../lib/motion-plan.mjs'
import { buildNarrationSpec } from '../lib/voice-spec.mjs'

const brand = {
  name: 'Marginalia',
  visualMode: 'motion-graphics',
  usesFakeHumanPresenter: false,
  palette: { bg: '#14110E', ink: '#EDE6D6', accent: '#C8462C' },
  typography: { display: 'Fraunces', body: 'Inter' },
}

function fixture(targetSeconds = 300) {
  const beats = buildBeatSheet({ targetSeconds })
  const motionPlan = buildMotionPlan(beats, brand)
  // give every beat some narration so coverage is healthy
  const script = { beats: beats.map((b) => ({ ...b, text: 'word '.repeat(Math.max(8, b.wordBudget)).trim() })) }
  const narrationSpec = buildNarrationSpec(script)
  return { beats, motionPlan, narrationSpec }
}

test('assembleTimeline computes duration, scene count, and coverage', () => {
  const { motionPlan, narrationSpec } = fixture(300)
  const t = assembleTimeline(motionPlan, narrationSpec)
  assert.equal(t.durationSec, 300)
  assert.ok(t.sceneCount > 0)
  assert.ok(t.coverage > 0 && t.coverage <= 1)
})

test('runEditQa passes a clean motion-graphics cut', () => {
  const { motionPlan, narrationSpec } = fixture(300)
  const r = runEditQa({ motionPlan, narrationSpec, plan: { metricsSource: 'youtube-analytics' } })
  assert.equal(r.passed, true, JSON.stringify(r.blocking))
  assert.equal(r.blocking.length, 0)
})

test('runEditQa BLOCKS a plan that violates a hard constraint', () => {
  const { motionPlan, narrationSpec } = fixture(120)
  const r = runEditQa({ motionPlan, narrationSpec, plan: { usesFakeHumanAvatar: true } })
  assert.equal(r.passed, false)
  assert.ok(r.blocking.some((b) => b.includes('no-fake-human-visual')))
})

test('runEditQa BLOCKS deceptive packaging even with good visuals', () => {
  const { motionPlan, narrationSpec } = fixture(120)
  const r = runEditQa({ motionPlan, narrationSpec, plan: { packaging: { claimPaidOff: false } } })
  assert.equal(r.passed, false)
  assert.ok(r.blocking.some((b) => b.includes('no-deceptive-clickbait')))
})

test('runEditQa warns on low narration coverage (dead air)', () => {
  const beats = buildBeatSheet({ targetSeconds: 600 })
  const motionPlan = buildMotionPlan(beats, brand)
  const narrationSpec = buildNarrationSpec({ beats: [{ id: 'hook', startSec: 0, endSec: 10, text: 'tiny' }] })
  const r = runEditQa({ motionPlan, narrationSpec })
  assert.ok(r.warnings.some((w) => w.includes('coverage')))
})
