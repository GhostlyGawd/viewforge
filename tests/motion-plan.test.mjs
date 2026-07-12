import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMotionPlan, applyResolvedTimeline, tweakableParameters, extractCssColor, extractFontFamily, VISUAL_MODE } from '../lib/motion-plan.mjs'
import { buildBeatSheet } from '../lib/script-model.mjs'
import { solveTimeline } from '../lib/timing-solver.mjs'
import { forAll, gens } from './helpers/prop.mjs'

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

// ---- audio-first re-timing (Master Doc v2: A7) ----

test('a fresh plan is authored; applyResolvedTimeline re-times it from the real audio and stamps provenance', () => {
  const beats = buildBeatSheet({ targetSeconds: 480 })
  const plan = buildMotionPlan(beats, brand, { fps: 30 })
  assert.equal(plan.timingSource, 'authored')

  // real narration ran long on the hook, short on the outro — the solver, not the
  // beat sheet, now owns the seconds
  const solved = solveTimeline(beats.map((b) => ({ id: b.id, voMs: (b.durationSec + (b.id === 'hook' ? 2 : 0)) * 1000, minMs: 1000 })))
  assert.equal(solved.ok, true)

  const retimed = applyResolvedTimeline(plan, solved.scenes)
  assert.equal(retimed.timingSource, 'audio-solver')
  const hook = retimed.scenes.find((s) => s.beatId === 'hook')
  const authoredHook = plan.scenes.find((s) => s.beatId === 'hook')
  assert.equal(hook.endSec - hook.startSec, authoredHook.endSec - authoredHook.startSec + 2) // the real 2s overrun is now IN the timeline
  assert.equal(retimed.durationFrames, Math.max(...retimed.scenes.map((s) => s.endFrame)))
  // immutability: the authored plan is untouched
  assert.equal(plan.timingSource, 'authored')
  assert.equal(plan.scenes.find((s) => s.beatId === 'hook').endSec, authoredHook.endSec)
})

test('property: applyResolvedTimeline maps resolved ms → sec/frames exactly, for every scene', () => {
  const beats = buildBeatSheet({ targetSeconds: 240 })
  const plan = buildMotionPlan(beats, brand, { fps: 30 })
  forAll(
    (rng) => beats.map((b) => ({ id: b.id, voMs: gens.int(800, 20000)(rng), padAfterMs: gens.int(0, 400)(rng) })),
    (sceneInputs) => {
      const solved = solveTimeline(sceneInputs)
      if (!solved.ok) return false
      const retimed = applyResolvedTimeline(plan, solved.scenes, { fps: 30 })
      return retimed.scenes.every((sc) => {
        const s = solved.scenes.find((x) => x.id === sc.beatId)
        return (
          sc.startSec === Math.round(s.resolvedStartMs) / 1000 &&
          sc.endSec === Math.round(s.resolvedStartMs + s.resolvedDurationMs) / 1000 &&
          sc.startFrame === Math.round(sc.startSec * 30) &&
          sc.endFrame === Math.round(sc.endSec * 30) &&
          sc.holdMs === s.holdMs
        )
      })
    },
    { runs: 150 },
  )
})

test('applyResolvedTimeline refuses partial mappings and unresolved input (only solver output times a render)', () => {
  const beats = buildBeatSheet({ targetSeconds: 120 })
  const plan = buildMotionPlan(beats, brand)
  const solved = solveTimeline(beats.map((b) => ({ id: b.id, voMs: 2000 })))
  assert.throws(() => applyResolvedTimeline(plan, solved.scenes.slice(1)), /no resolved timing/)
  assert.throws(() => applyResolvedTimeline(plan, [...solved.scenes, { id: 'ghost', resolvedStartMs: 0, resolvedDurationMs: 100 }]), /no plan scene/)
  assert.throws(() => applyResolvedTimeline(plan, beats.map((b) => ({ id: b.id, voMs: 2000 }))), /not resolved/)
})
