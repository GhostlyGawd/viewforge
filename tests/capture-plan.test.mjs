// Phase H of plans/07 — capture-first contracts + cursor tracks (Master Doc v2 §7/§16).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCaptureSpec, cursorTrackFromSteps, validateCursorTrack, toPlaywrightScript, CAPTURE_ACTIONS, CAPTURE_DEFAULTS } from '../lib/capture-plan.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

const goodSteps = [
  { action: 'goto', label: 'open the dashboard' },
  { action: 'hover', selector: '#revenue-card', label: 'hover the revenue card' },
  { action: 'click', selector: '#export-btn', label: 'click Export' },
  { action: 'type', selector: '#filename', text: 'q3-report', label: 'name the file' },
  { action: 'wait', ms: 800, label: 'let the toast land' },
]
const spec = () => buildCaptureSpec({ captureId: 'cap_dashboard_flow', appUrl: 'https://app.example.com', steps: goodSteps })

// ---- H1: contract validation ----

test('property: H1 — unknown actions, missing selectors, and sub-2x scale are always rejected', () => {
  forAll(
    gens.record({
      breakWith: gens.pick(['action', 'selector', 'scale', 'label', 'first-not-goto', 'nothing']),
      scale: gens.float(0.5, 1.9),
    }),
    ({ breakWith, scale }) => {
      let steps = goodSteps.map((s) => ({ ...s }))
      let viewport
      if (breakWith === 'action') steps[2] = { ...steps[2], action: 'drag' }
      if (breakWith === 'selector') steps[2] = { action: 'click', label: 'click' }
      if (breakWith === 'label') steps[1] = { ...steps[1], label: ' ' }
      if (breakWith === 'first-not-goto') steps = steps.slice(1)
      if (breakWith === 'scale') viewport = { deviceScale: scale }
      try {
        buildCaptureSpec({ captureId: 'cap_x', appUrl: 'https://x.dev', steps, viewport })
        return breakWith === 'nothing'
      } catch (e) {
        if (breakWith === 'nothing') return false
        if (breakWith === 'scale') return /deviceScale/.test(e.message)
        return true
      }
    },
    { runs: 200 },
  )
})

test('H1 — the contract carries 2x by default and the output paths', () => {
  const s = spec()
  assert.equal(s.viewport.deviceScale, 2)
  assert.equal(s.outputs.videoPath, 'data/captures/cap_dashboard_flow.webm')
  assert.equal(s.outputs.cursorTrackPath, 'data/captures/cap_dashboard_flow.cursor.json')
  assert.deepEqual([...CAPTURE_ACTIONS], ['goto', 'click', 'type', 'hover', 'wait'])
})

// ---- H2: cursor track ----

test('property: H2 — the cursor track is deterministic, monotonic, in-viewport; clicks emit click events at their position', () => {
  forAll(
    (rng) => {
      const vp = CAPTURE_DEFAULTS.viewport
      const positions = goodSteps.map((s) => (s.action === 'goto' || s.action === 'wait' ? null : { x: gens.int(-50, vp.w + 50)(rng), y: gens.int(-50, vp.h + 50)(rng) }))
      return positions
    },
    (positions) => {
      const a = cursorTrackFromSteps(goodSteps, positions)
      const b = cursorTrackFromSteps(goodSteps, positions)
      if (JSON.stringify(a) !== JSON.stringify(b)) return false // deterministic
      const v = validateCursorTrack(a)
      if (!v.valid) return false // clamped in-viewport + monotonic by construction
      // the click step lands exactly one click event at its (clamped) position
      const clicks = a.filter((p) => p.event === 'click')
      if (clicks.length !== 1 || clicks[0].label !== 'click Export') return false
      const clickPos = positions[2]
      const clamped = { x: Math.min(Math.max(clickPos.x, 0), CAPTURE_DEFAULTS.viewport.w), y: Math.min(Math.max(clickPos.y, 0), CAPTURE_DEFAULTS.viewport.h) }
      return clicks[0].x === clamped.x && clicks[0].y === clamped.y
    },
    { runs: 200 },
  )
})

test('H2 — misaligned steps/positions are refused; a tampered track fails validation', () => {
  assert.throws(() => cursorTrackFromSteps(goodSteps, [null]), /1:1/)
  const track = cursorTrackFromSteps(goodSteps, goodSteps.map((s) => (s.action === 'click' ? { x: 500, y: 400 } : null)))
  assert.equal(validateCursorTrack(track).valid, true)
  const bad = [...track]
  bad[2] = { ...bad[2], tMs: -5 }
  assert.equal(validateCursorTrack(bad).valid, false)
})

// ---- H3: the emitted Playwright script ----

feature('Playwright capture emitter (§7 — capture the REAL product)', () => {
  scenario('the script pins the contract: viewport, 2x scale, cursor hidden, every step, track output', () => {
    const src = when('we emit the script', () => toPlaywrightScript(spec()))
    then('viewport + 2x scale + video recording are pinned', () => {
      assert.match(src, /viewport: \{ width: 1920, height: 1080 \}/)
      assert.match(src, /deviceScaleFactor: 2/)
      assert.match(src, /video: \{ mode: 'on'/)
    })
    and('the OS cursor is hidden (the branded overlay draws it)', () => {
      assert.match(src, /cursor:none !important/)
    })
    and('every step appears in order with its label', () => {
      const order = ['open the dashboard', 'hover the revenue card', 'click Export', 'name the file', 'let the toast land']
      let last = -1
      for (const label of order) {
        const idx = src.indexOf(label)
        assert.ok(idx > last, `step "${label}" out of order`)
        last = idx
      }
      assert.match(src, /page\.locator\("#export-btn"\)\.click\(\)/)
      assert.match(src, /fill\("q3-report"\)/)
    })
    and('boundingBox positions are recorded and written to the cursor-track JSON', () => {
      assert.match(src, /boundingBox\(\)/)
      assert.match(src, /cap_dashboard_flow\.cursor\.json/)
    })
  })
})
