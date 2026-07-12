// capture-plan.mjs — capture-first product demos (Master Doc v2 §7/§16).
//
// For a product demo the most convincing pixel is a real one: Playwright drives the
// actual app and records it; Remotion becomes an OVERLAY layer (branded cursor, click
// ripples, zooms, callouts) on top of the real footage. Because every step is
// scripted, cursor positions are KNOWN ahead of time — the cursor track is generated
// from the steps, never detected from pixels.
//
// The runner (a live app + browser) is environment-dependent; everything decidable
// lives here, tested: the capture contract, the 2x-scale rule (zoom headroom), the
// deterministic cursor track, and the Playwright script emitter. Captured footage
// enters the asset manifest as origin "captured" — the only origin uiTruth accepts.
//
// Zero dependencies.

export const CAPTURE_ACTIONS = Object.freeze(['goto', 'click', 'type', 'hover', 'wait'])
const NEEDS_SELECTOR = new Set(['click', 'type', 'hover'])

export const CAPTURE_DEFAULTS = Object.freeze({
  viewport: { w: 1920, h: 1080, deviceScale: 2 }, // 2x so ZoomPan moves stay crisp (§7/§9)
  stepMs: 900, // dwell per step in the cursor track
  moveMs: 450, // eased cursor travel between steps
})

/**
 * Validate + normalize a capture spec (the §16 capture contract).
 *   { captureId, appUrl, steps: [{ action, selector?, text?, label, ms? }], viewport? }
 * Throws on contract violations — a capture that starts wrong rots fastest.
 */
export function buildCaptureSpec({ captureId, appUrl, steps, viewport } = {}) {
  const errors = []
  if (!captureId || !/^[a-z0-9]+([_-][a-z0-9]+)*$/i.test(String(captureId))) errors.push('captureId required (slug-safe)')
  if (!appUrl || !/^https?:\/\//.test(String(appUrl))) errors.push('appUrl must be an http(s) URL')
  const vp = { ...CAPTURE_DEFAULTS.viewport, ...(viewport || {}) }
  if (!(vp.w > 0 && vp.h > 0)) errors.push('viewport must have positive w/h')
  if (!(vp.deviceScale >= 2)) errors.push(`deviceScale must be ≥ 2 for zoom headroom (got ${vp.deviceScale}) — §7 records at 2x so ZoomPan stays crisp`)

  if (!Array.isArray(steps) || steps.length === 0) errors.push('steps required')
  else {
    steps.forEach((s, i) => {
      const tag = `step ${i} (${s?.action ?? 'no action'})`
      if (!CAPTURE_ACTIONS.includes(s?.action)) errors.push(`${tag}: unknown action — allowed: ${CAPTURE_ACTIONS.join('|')}`)
      if (NEEDS_SELECTOR.has(s?.action) && !(s?.selector && String(s.selector).trim())) errors.push(`${tag}: selector required`)
      if (s?.action === 'goto' && !(s?.url || appUrl)) errors.push(`${tag}: goto needs a url`)
      if (s?.action === 'type' && typeof s?.text !== 'string') errors.push(`${tag}: type needs text`)
      if (s?.action === 'wait' && !(s?.ms > 0)) errors.push(`${tag}: wait needs ms > 0`)
      if (!s?.label || !String(s.label).trim()) errors.push(`${tag}: label required (labels drive callouts + the storyboard)`)
    })
    if (steps[0]?.action !== 'goto') errors.push('first step must be goto (a capture starts from a known page)')
  }
  if (errors.length) throw new Error(`buildCaptureSpec: ${errors.join('; ')}`)

  return {
    captureId,
    appUrl,
    viewport: vp,
    steps: steps.map((s) => ({ ...s })),
    outputs: {
      videoPath: `data/captures/${captureId}.webm`,
      cursorTrackPath: `data/captures/${captureId}.cursor.json`,
    },
  }
}

/**
 * The deterministic cursor track (§16: positions are KNOWN, not detected). The
 * runner resolves each selector's boundingBox center at capture time and passes it
 * back as `positions[i]` = {x, y} per step (null for steps with no on-screen target,
 * e.g. goto/wait — the cursor holds). This function turns steps + positions into a
 * timed track the CursorOverlay consumes:
 *   [{ tMs, x, y, event: 'move'|'dwell'|'click'|'type'|'hover' }]
 * Eased travel between positions, a dwell at each target, a click event exactly at
 * the click step's position (the ClickRipple cue).
 */
export function cursorTrackFromSteps(steps, positions, { viewport = CAPTURE_DEFAULTS.viewport, stepMs = CAPTURE_DEFAULTS.stepMs, moveMs = CAPTURE_DEFAULTS.moveMs } = {}) {
  if (!Array.isArray(steps) || !Array.isArray(positions) || steps.length !== positions.length) {
    throw new Error('cursorTrackFromSteps: steps and positions must align 1:1 (null position for steps without a target)')
  }
  const track = []
  let t = 0
  let cur = { x: Math.round(viewport.w / 2), y: Math.round(viewport.h / 2) } // enter at center
  const clampPos = (p) => ({ x: Math.min(Math.max(p.x, 0), viewport.w), y: Math.min(Math.max(p.y, 0), viewport.h) })

  steps.forEach((s, i) => {
    const target = positions[i] ? clampPos(positions[i]) : null
    if (target && (target.x !== cur.x || target.y !== cur.y)) {
      // eased move sampled at quarter points (the overlay interpolates between)
      for (const f of [0.25, 0.5, 0.75, 1]) {
        const ease = f * f * (3 - 2 * f) // smoothstep
        track.push({ tMs: Math.round(t + moveMs * f), x: Math.round(cur.x + (target.x - cur.x) * ease), y: Math.round(cur.y + (target.y - cur.y) * ease), event: 'move' })
      }
      t += moveMs
      cur = target
    }
    const event = s.action === 'click' ? 'click' : s.action === 'type' ? 'type' : s.action === 'hover' ? 'hover' : 'dwell'
    const dwell = s.action === 'wait' ? (s.ms ?? stepMs) : stepMs
    track.push({ tMs: Math.round(t), x: cur.x, y: cur.y, event, label: s.label })
    t += dwell
  })
  return track
}

/** Validate a cursor track: monotonic time, in-viewport, click events carry a label.
 *  Returns { valid, errors }. */
export function validateCursorTrack(track, { viewport = CAPTURE_DEFAULTS.viewport } = {}) {
  const errors = []
  if (!Array.isArray(track) || track.length === 0) return { valid: false, errors: ['empty track'] }
  let prev = -1
  for (const [i, p] of track.entries()) {
    if (!(typeof p?.tMs === 'number' && p.tMs >= prev)) errors.push(`point ${i}: time not monotonic (${p?.tMs} after ${prev})`)
    prev = p?.tMs ?? prev
    if (!(p?.x >= 0 && p.x <= viewport.w && p?.y >= 0 && p.y <= viewport.h)) errors.push(`point ${i}: (${p?.x},${p?.y}) outside ${viewport.w}x${viewport.h}`)
    if (p?.event === 'click' && !p?.label) errors.push(`point ${i}: click without a label`)
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Emit the Playwright capture script (a .spec.ts as a string — pure, testable; the
 * runner writes + runs it). Fixed viewport at 2x scale, video on, the OS cursor
 * hidden (the branded overlay draws it), and per-step boundingBox positions recorded
 * to the cursor-track JSON.
 */
export function toPlaywrightScript(spec) {
  const { captureId, appUrl, viewport, steps, outputs } = spec
  const lines = []
  lines.push(`// ${captureId} — generated capture flow (ViewForge capture-plan). Do not hand-edit; regenerate.`)
  lines.push(`import { test } from '@playwright/test'`)
  lines.push(``)
  lines.push(`test.use({`)
  lines.push(`  viewport: { width: ${viewport.w}, height: ${viewport.h} },`)
  lines.push(`  deviceScaleFactor: ${viewport.deviceScale}, // 2x — zoom headroom for the overlay (§7)`)
  lines.push(`  video: { mode: 'on', size: { width: ${viewport.w}, height: ${viewport.h} } },`)
  lines.push(`})`)
  lines.push(``)
  lines.push(`test('${captureId}', async ({ page }) => {`)
  lines.push(`  const positions: ({ x: number; y: number } | null)[] = []`)
  lines.push(`  // hide the OS cursor — the Remotion overlay draws the branded one`)
  lines.push(`  await page.addStyleTag({ content: '*{cursor:none !important}' }).catch(() => {})`)
  for (const s of steps) {
    const label = JSON.stringify(s.label)
    if (s.action === 'goto') {
      lines.push(`  await page.goto(${JSON.stringify(s.url || appUrl)}) // ${s.label}`)
      lines.push(`  await page.addStyleTag({ content: '*{cursor:none !important}' })`)
      lines.push(`  positions.push(null)`)
    } else if (s.action === 'wait') {
      lines.push(`  await page.waitForTimeout(${s.ms}) // ${s.label}`)
      lines.push(`  positions.push(null)`)
    } else {
      const sel = JSON.stringify(s.selector)
      lines.push(`  { // ${s.label}`)
      lines.push(`    const box = await page.locator(${sel}).boundingBox()`)
      lines.push(`    positions.push(box ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) } : null)`)
      if (s.action === 'click') lines.push(`    await page.locator(${sel}).click()`)
      if (s.action === 'hover') lines.push(`    await page.locator(${sel}).hover()`)
      if (s.action === 'type') lines.push(`    await page.locator(${sel}).fill(${JSON.stringify(s.text)})`)
      lines.push(`  }`)
      void label
    }
  }
  lines.push(`  // steps + runtime positions → the deterministic cursor track`)
  lines.push(`  const fs = await import('node:fs')`)
  lines.push(`  fs.writeFileSync(${JSON.stringify(outputs.cursorTrackPath)}, JSON.stringify({ captureId: ${JSON.stringify(captureId)}, viewport: ${JSON.stringify(viewport)}, steps: ${JSON.stringify(steps.map((s) => ({ action: s.action, label: s.label })))}, positions }, null, 2))`)
  lines.push(`})`)
  lines.push(``)
  return lines.join('\n')
}
