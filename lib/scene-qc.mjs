// scene-qc.mjs — the Gate-B visual QC harness (Master Doc v2 §25).
//
// A VLM (in ViewForge's case, Claude looking at exported stills) does the JUDGING;
// everything decidable lives here as tested code: WHICH stills to export (from the
// RESOLVED timeline, never authored guesses), what the checklist is, what word must
// be on screen at a given timestamp, which contrast ratios pass, and how findings
// aggregate into "re-render these scenes" vs "log for the human". The model observes;
// the policy is code.
//
// Zero dependencies.

import { revealedIndexAtTime } from './caption-timing.mjs'

// ---------------------------------------------------------------------------
// The §25 checklist. severity 'block' ⇒ that scene re-renders; 'warn' ⇒ logged.
// Binary defects (text overflows or it doesn't) carry a severity FLOOR: an
// explicit finding severity may escalate them, never downgrade. A `graded` check
// (contrast) has its bands defined in code — checkTokenContrast emits the
// severity, and that explicit severity is honored in both directions.
// ---------------------------------------------------------------------------
export const QC_CHECKS = Object.freeze([
  { id: 'text-overflow', severity: 'block', description: 'On-screen text overflows or is cropped by the frame or another element.' },
  { id: 'caption-sync', severity: 'block', description: 'The visible current caption word does not match the word audible at this timestamp (see expectedCaptionAt).' },
  { id: 'target-focus', severity: 'block', description: 'A cursor/highlight/callout is not actually on the element the scene says it targets.' },
  { id: 'contrast', severity: 'block', graded: true, description: 'Text is unreadable against its background — checkTokenContrast defines the bands (<3:1 block, <4.5:1 warn) and its emitted severity rules.' },
  { id: 'brand-tokens', severity: 'warn', description: 'Colors/fonts drift from the brand kit tokens.' },
  { id: 'artifact', severity: 'warn', description: 'Rendering artifact: seams, z-fighting, clipped shadows, half-loaded image.' },
])

export const STILL_POSITIONS = Object.freeze(['start', 'mid', 'end'])

/**
 * Which stills to export: start / mid / end per RESOLVED scene (§25), pulled a
 * touch inside the boundaries so transitions don't pollute the frame. Returns
 * [{ sceneId, position, atMs, frame }] — atMs absolute, frame at `fps`.
 */
export function stillPlan(resolvedScenes, { fps = 30, edgeInsetMs = 120 } = {}) {
  if (!Array.isArray(resolvedScenes) || resolvedScenes.length === 0) throw new Error('stillPlan: resolved scenes required')
  const stills = []
  for (const s of resolvedScenes) {
    if (!(typeof s?.resolvedStartMs === 'number') || !(s?.resolvedDurationMs > 0)) {
      throw new Error(`stillPlan: scene "${s?.id ?? '(no id)'}" is not resolved — QC stills come from the solver's timeline, never guesses`)
    }
    const inset = Math.min(edgeInsetMs, Math.floor(s.resolvedDurationMs / 4))
    const at = {
      start: s.resolvedStartMs + inset,
      mid: s.resolvedStartMs + Math.floor(s.resolvedDurationMs / 2),
      end: s.resolvedStartMs + s.resolvedDurationMs - inset,
    }
    for (const position of STILL_POSITIONS) {
      stills.push({ sceneId: s.id, position, atMs: at[position], frame: Math.round((at[position] / 1000) * fps) })
    }
  }
  return stills
}

// ---------------------------------------------------------------------------
// Contrast — WCAG 2.x relative luminance. Code, not vibes.
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = String(hex ?? '').trim().replace(/^#/, '')
  const m = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (!/^[0-9a-fA-F]{6}$/.test(m)) throw new Error(`contrast: not a hex color: "${hex}"`)
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255)
}

const linearize = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

/** WCAG relative luminance of a hex color. */
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(linearize)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two hex colors — 1 (identical) … 21 (black/white). */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// Captions/headlines render display-size, so WCAG large-text AA (3:1) is the hard
// floor; below 4.5:1 we warn (small annotations may still be borderline).
export const CONTRAST_THRESHOLDS = Object.freeze({ block: 3, warn: 4.5 })

/**
 * Numeric contrast gate over brand tokens: ink-on-bg and accent-on-bg. Returns
 * findings in the same shape aggregateFindings consumes (empty = all readable).
 */
export function checkTokenContrast(tokens, { thresholds = CONTRAST_THRESHOLDS, sceneId = null } = {}) {
  const findings = []
  for (const [name, fg] of [['ink', tokens?.ink], ['accent', tokens?.accent]]) {
    if (!fg || !tokens?.bg) continue
    const ratio = Math.round(contrastRatio(fg, tokens.bg) * 100) / 100
    if (ratio < thresholds.block) {
      findings.push({ sceneId, checkId: 'contrast', severity: 'block', note: `${name} ${fg} on bg ${tokens.bg} = ${ratio}:1, below the ${thresholds.block}:1 floor` })
    } else if (ratio < thresholds.warn) {
      findings.push({ sceneId, checkId: 'contrast', severity: 'warn', note: `${name} ${fg} on bg ${tokens.bg} = ${ratio}:1, under ${thresholds.warn}:1 — borderline for small text` })
    }
  }
  return findings
}

/**
 * The caption-sync spot-check target (§25): the word that must be the CURRENT
 * caption word at `atMs` (absolute), from the same captions.json the composition
 * renders. Returns { beatId, wordIndex, word } or null when no beat covers the
 * timestamp / no word has revealed yet. The VLM compares the still against this.
 */
export function expectedCaptionAt(captionBeats, atMs) {
  const atSec = atMs / 1000
  for (const b of captionBeats || []) {
    if (atSec < b.startSec || atSec >= b.startSec + b.durSec) continue
    const rel = atSec - b.startSec
    const times = Array.isArray(b.revealSec) && b.revealSec.length === b.words.length ? b.revealSec : b.words.map((_, i) => (i / b.words.length) * b.durSec)
    const idx = revealedIndexAtTime(rel, times)
    if (idx < 0) return null
    return { beatId: b.beatId, wordIndex: idx, word: b.words[idx] }
  }
  return null
}

/**
 * Aggregate VLM findings into the Gate-B verdict. `findings` =
 * [{ sceneId, checkId, severity?, note }]. Unknown check ids FAIL CLOSED (the
 * reviewer inventing checks means the contract drifted — that's a blocking problem,
 * not a shrug). Severity defaults from QC_CHECKS. For binary checks an explicit
 * severity may only ESCALATE (warn→block) — the reviewer can't shrug off a blocking
 * class. For `graded` checks (contrast) the explicit severity is honored both ways:
 * the bands live in code (checkTokenContrast), so a warn-band finding stays a warn.
 * Returns { pass, blockingScenes, blocking, warnings, invalid }.
 */
export function aggregateFindings(findings = [], { checks = QC_CHECKS } = {}) {
  const byId = new Map(checks.map((c) => [c.id, c]))
  const blocking = []
  const warnings = []
  const invalid = []
  for (const f of findings) {
    const check = byId.get(f?.checkId)
    if (!check || !f?.sceneId) {
      invalid.push({ ...f, reason: !f?.sceneId ? 'missing sceneId' : `unknown check "${f?.checkId}"` })
      continue
    }
    const severity = check.graded
      ? (f.severity === 'warn' || f.severity === 'block' ? f.severity : check.severity)
      : check.severity === 'block' ? 'block' : f.severity === 'block' ? 'block' : check.severity
    const entry = { sceneId: f.sceneId, checkId: check.id, note: f.note ?? check.description }
    if (severity === 'block') blocking.push(entry)
    else warnings.push(entry)
  }
  const blockingScenes = [...new Set(blocking.map((b) => b.sceneId))].sort()
  return {
    pass: blocking.length === 0 && invalid.length === 0,
    blockingScenes, // feed these to the per-scene re-render loop
    blocking,
    warnings,
    invalid,
  }
}
