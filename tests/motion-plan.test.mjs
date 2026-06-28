import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMotionPlan, tweakableParameters, VISUAL_MODE } from '../lib/motion-plan.mjs'
import { buildBeatSheet } from '../lib/script-model.mjs'

const brand = {
  name: 'Marginalia',
  visualMode: 'motion-graphics',
  usesFakeHumanPresenter: false,
  palette: { bg: '#14110E', ink: '#EDE6D6', accent: '#C8462C' },
  typography: { display: 'Fraunces', body: 'Inter' },
}

test('buildMotionPlan produces a scene per beat with frames + tokens', () => {
  const beats = buildBeatSheet({ targetSeconds: 480 })
  const plan = buildMotionPlan(beats, brand, { fps: 30 })
  assert.equal(plan.visualMode, VISUAL_MODE)
  assert.equal(plan.scenes.length, beats.length)
  assert.equal(plan.scenes[0].startFrame, 0)
  assert.equal(plan.scenes[0].tokens.accent, '#C8462C')
  assert.equal(plan.durationFrames, 480 * 30)
})

test('the hook scene is paced faster than the investment scene (retention as motion)', () => {
  const plan = buildMotionPlan(buildBeatSheet({ targetSeconds: 480 }), brand)
  const hook = plan.scenes.find((s) => s.beatId === 'hook')
  const investment = plan.scenes.find((s) => s.beatId === 'investment')
  assert.ok(hook.params.cutsPerScene > investment.params.cutsPerScene)
})

test('buildMotionPlan BLOCKS a brand that needs a fake human', () => {
  assert.throws(() => buildMotionPlan(buildBeatSheet({ targetSeconds: 60 }), { ...brand, usesFakeHumanPresenter: true }), /fake-human/)
  assert.throws(() => buildMotionPlan(buildBeatSheet({ targetSeconds: 60 }), { ...brand, visualMode: 'ai-avatar' }), /fake-human/)
})

test('weightOverrides change scene params (the A/B surface)', () => {
  const plan = buildMotionPlan(buildBeatSheet({ targetSeconds: 120 }), brand, { weightOverrides: { texture: 'clean' } })
  assert.ok(plan.scenes.every((s) => s.params.texture === 'clean'))
})

test('tweakableParameters lists the knobs the optimizer may vary', () => {
  const plan = buildMotionPlan(buildBeatSheet({ targetSeconds: 120 }), brand)
  const knobs = tweakableParameters(plan)
  assert.ok(knobs.includes('transitionIn'))
  assert.ok(knobs.includes('cutsPerScene'))
})

test('buildMotionPlan validates inputs', () => {
  assert.throws(() => buildMotionPlan([], brand))
  assert.throws(() => buildMotionPlan(buildBeatSheet({ targetSeconds: 60 }), null))
})
