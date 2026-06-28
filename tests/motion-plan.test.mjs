import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMotionPlan, tweakableParameters, extractCssColor, extractFontFamily, VISUAL_MODE } from '../lib/motion-plan.mjs'
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

test('extractCssColor pulls a valid color out of a labeled brand token (render-bug fix)', () => {
  assert.equal(extractCssColor('#14110E (warm near-black)'), '#14110E')
  assert.equal(extractCssColor('#EDE6D6 (parchment)'), '#EDE6D6')
  assert.equal(extractCssColor('rgba(20,17,14,1) ground'), 'rgba(20,17,14,1)')
  assert.equal(extractCssColor(undefined, '#123'), '#123')
})

test('extractFontFamily pulls the family name and adds a generic fallback', () => {
  assert.equal(extractFontFamily('Fraunces (high-contrast serif) for titles', 'serif'), "'Fraunces', serif")
  assert.equal(extractFontFamily('Inter', 'sans-serif'), "'Inter', sans-serif")
  assert.equal(extractFontFamily('', 'serif'), 'serif')
})

test('buildMotionPlan sanitizes labeled palette values into valid CSS', () => {
  const messyBrand = { ...brand, palette: { bg: '#14110E (warm near-black)', ink: '#EDE6D6 (parchment)', accent: '#C8462C (vermillion)' } }
  const plan = buildMotionPlan(buildBeatSheet({ targetSeconds: 60 }), messyBrand)
  assert.equal(plan.scenes[0].tokens.bg, '#14110E')
  assert.equal(plan.scenes[0].tokens.accent, '#C8462C')
})

test('buildMotionPlan carries an optional audioFile (null by default)', () => {
  const plan = buildMotionPlan(buildBeatSheet({ targetSeconds: 60 }), brand)
  assert.equal(plan.audioFile, null)
  const withAudio = buildMotionPlan(buildBeatSheet({ targetSeconds: 60 }), brand, { audioFile: 'narration.wav' })
  assert.equal(withAudio.audioFile, 'narration.wav')
})

test('buildMotionPlan validates inputs', () => {
  assert.throws(() => buildMotionPlan([], brand))
  assert.throws(() => buildMotionPlan(buildBeatSheet({ targetSeconds: 60 }), null))
})
