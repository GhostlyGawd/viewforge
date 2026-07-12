// timing-solver.mjs — the audio-first timing solver (Master Doc v2 §15).
//
// The inversion that kills timing desync: scene durations are OUTPUTS derived from the
// real narration audio, not authored inputs. A scene authors only intent + constraints
// (minMs / maxMs / padAfterMs); the solver assigns resolvedStartMs / resolvedDurationMs
// from the measured voice-over duration. Downstream (motion plan, captions, renders)
// reads only resolved values, so cuts and captions land exactly on the voice.
//
// Hard rules, in code not convention:
//   - VO longer than a scene's max NEVER resolves — the scene bounces back to the
//     script stage with an explicit word budget. Voice is never time-stretched beyond
//     ±4% to force a fit.
//   - VO shorter than min extends the VISUALS (a recorded hold) — never stretched
//     audio, never dead silence.
//   - The solver is the only writer of resolved fields; input already carrying them
//     is rejected.
//
// Zero runtime dependencies.

import { DEFAULT_NARRATION_WPM } from './script-model.mjs'

export const SOLVER_DEFAULTS = Object.freeze({
  wordsPerSec: DEFAULT_NARRATION_WPM / 60, // 2.5 — the word-budget rule of thumb
  maxVoiceStretchPct: 4, // voice is NEVER time-stretched beyond ±4%
  driftTolerancePct: 10, // |total − target| beyond this flags the job for review
  transitionOverlapMs: 0, // from the brand kit's motion tokens
})

/** Signed stretch (%) required to fit a voice take of `voMs` into `fittedMs`. */
export function stretchPct(voMs, fittedMs) {
  if (!(voMs > 0)) throw new Error('stretchPct: voMs must be > 0')
  return ((fittedMs - voMs) / voMs) * 100
}

/** Whether fitting `voMs` into `fittedMs` stays within the ±4% stretch cap. */
export function isStretchAllowed(voMs, fittedMs, maxPct = SOLVER_DEFAULTS.maxVoiceStretchPct) {
  return Math.abs(stretchPct(voMs, fittedMs)) <= maxPct + 1e-9
}

/** The word budget a bounced scene goes back to the script stage with (§15). */
export function wordBudgetForMs(maxMs, wordsPerSec = SOLVER_DEFAULTS.wordsPerSec) {
  if (!(maxMs > 0)) throw new Error('wordBudgetForMs: maxMs must be > 0')
  return Math.floor((maxMs / 1000) * wordsPerSec)
}

const isFiniteNonNeg = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0

function validateSceneInputs(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('solveTimeline: scenes required')
  const seen = new Set()
  for (const s of scenes) {
    const tag = s?.id ?? '(no id)'
    if (!s || typeof s !== 'object' || !s.id) throw new Error('solveTimeline: every scene needs an id')
    if (seen.has(s.id)) throw new Error(`solveTimeline: duplicate scene id "${s.id}"`)
    seen.add(s.id)
    if ('resolvedStartMs' in s || 'resolvedDurationMs' in s) {
      throw new Error(`solveTimeline: scene "${tag}" already carries resolved fields — the solver is the only writer of resolved timing`)
    }
    if (!isFiniteNonNeg(s.voMs)) throw new Error(`solveTimeline: scene "${tag}" needs voMs ≥ 0 (the measured narration duration; 0 for visual-only scenes)`)
    const minMs = s.minMs ?? 0
    const maxMs = s.maxMs ?? Infinity
    const padAfterMs = s.padAfterMs ?? 0
    if (!isFiniteNonNeg(minMs)) throw new Error(`solveTimeline: scene "${tag}" minMs must be a finite number ≥ 0`)
    if (!(maxMs > 0)) throw new Error(`solveTimeline: scene "${tag}" maxMs must be > 0`)
    if (Number.isFinite(maxMs) && maxMs < minMs) throw new Error(`solveTimeline: scene "${tag}" maxMs ${maxMs} < minMs ${minMs}`)
    if (!isFiniteNonNeg(padAfterMs)) throw new Error(`solveTimeline: scene "${tag}" padAfterMs must be a finite number ≥ 0`)
  }
}

/**
 * Solve the timeline from real audio (§15).
 *
 * `scenes`: [{ id, voMs, minMs?, maxMs?, padAfterMs? }] in play order, where `voMs`
 * is the MEASURED narration duration for the scene (from the TTS/captions timing).
 * `opts`: { transitionOverlapMs?, targetMs?, wordsPerSec?, driftTolerancePct? }.
 *
 * Returns { ok, scenes, bounces, flags, totalMs, driftPct }:
 *  - ok=false with `bounces` when any scene's VO overruns its max — each bounce
 *    carries the word budget the script stage must rewrite to. No scene resolves on
 *    a bounced solve (a half-solved timeline must never reach a renderer).
 *  - resolved scenes carry resolvedStartMs / resolvedDurationMs / holdMs (the visual
 *    hold added to honor minMs; 0 when the voice filled the scene).
 *  - flags: [{ type, severity: 'block'|'review', ... }] — total drift beyond the
 *    tolerance is a 'review' flag (job needs human eyes, not an auto-reject).
 */
export function solveTimeline(scenes, opts = {}) {
  const cfg = { ...SOLVER_DEFAULTS, ...opts }
  if (!isFiniteNonNeg(cfg.transitionOverlapMs)) throw new Error('solveTimeline: transitionOverlapMs must be ≥ 0')
  validateSceneInputs(scenes)

  const bounces = []
  const flags = []
  const resolved = []
  let cursor = 0

  for (const s of scenes) {
    const minMs = s.minMs ?? 0
    const maxMs = s.maxMs ?? Infinity
    const padAfterMs = s.padAfterMs ?? 0
    const need = Math.round(s.voMs + padAfterMs)

    if (need > maxMs) {
      // The script must shrink — never the voice (stretch cap makes a "fit" illegal).
      bounces.push({ id: s.id, voMs: s.voMs, padAfterMs, maxMs, wordBudget: wordBudgetForMs(maxMs, cfg.wordsPerSec) })
      continue
    }

    const d = Math.max(need, Math.round(minMs))
    if (d <= cfg.transitionOverlapMs) {
      flags.push({
        type: 'scene-shorter-than-overlap',
        severity: 'block',
        id: s.id,
        message: `scene "${s.id}" resolves to ${d}ms, not longer than the ${cfg.transitionOverlapMs}ms transition overlap — raise minMs or shrink the overlap`,
      })
      continue
    }

    resolved.push({
      ...s,
      resolvedStartMs: cursor,
      resolvedDurationMs: d,
      holdMs: d - need, // visual hold, never silence: motion fills it, audio does not stretch
    })
    cursor += d - cfg.transitionOverlapMs
  }

  const totalMs = resolved.length ? resolved[resolved.length - 1].resolvedStartMs + resolved[resolved.length - 1].resolvedDurationMs : 0

  let driftPct = null
  if (isFiniteNonNeg(opts.targetMs) && opts.targetMs > 0 && bounces.length === 0) {
    driftPct = Math.round(((totalMs - opts.targetMs) / opts.targetMs) * 1000) / 10
    if (Math.abs(driftPct) > cfg.driftTolerancePct) {
      flags.push({
        type: 'duration-drift',
        severity: 'review',
        driftPct,
        targetMs: opts.targetMs,
        totalMs,
        message: `total ${totalMs}ms drifts ${driftPct}% from target ${opts.targetMs}ms (tolerance ±${cfg.driftTolerancePct}%) — flag for review`,
      })
    }
  }

  const blocked = bounces.length > 0 || flags.some((f) => f.severity === 'block')
  return {
    ok: !blocked,
    scenes: blocked ? [] : resolved,
    bounces,
    flags,
    totalMs: blocked ? 0 : totalMs,
    driftPct,
  }
}

/**
 * Independently re-check a resolved timeline's invariants (defense in depth for
 * anything about to render it): every scene resolved, durations within [min, max],
 * starts chain exactly with the declared transition overlap, monotonic, gapless.
 * Returns { valid, errors }.
 */
export function validateResolvedTimeline(scenes, { transitionOverlapMs = SOLVER_DEFAULTS.transitionOverlapMs } = {}) {
  const errors = []
  if (!Array.isArray(scenes) || scenes.length === 0) return { valid: false, errors: ['no scenes'] }
  let expectedStart = 0
  for (const s of scenes) {
    const tag = s?.id ?? '(no id)'
    if (!isFiniteNonNeg(s?.resolvedStartMs) || !(s?.resolvedDurationMs > 0)) {
      errors.push(`${tag}: missing/invalid resolved timing`)
      continue
    }
    if (s.resolvedStartMs !== expectedStart) errors.push(`${tag}: starts at ${s.resolvedStartMs}ms, expected ${expectedStart}ms (chain broken)`)
    const minMs = s.minMs ?? 0
    const maxMs = s.maxMs ?? Infinity
    if (s.resolvedDurationMs < Math.round(minMs)) errors.push(`${tag}: duration ${s.resolvedDurationMs}ms below min ${minMs}ms`)
    if (s.resolvedDurationMs > maxMs) errors.push(`${tag}: duration ${s.resolvedDurationMs}ms above max ${maxMs}ms`)
    expectedStart = s.resolvedStartMs + s.resolvedDurationMs - transitionOverlapMs
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Emit the caption-beat shape (what captions.json / CaptionVideo consume) from a
 * resolved timeline, so captions and scene timing can never disagree. Words reveal
 * across the VOICE duration (voMs), not the padded/held scene — captions track the
 * voice. `wordsById` maps scene id → words[]; scenes without words are skipped.
 */
export function toCaptionBeats(scenes, wordsById = {}) {
  const beats = []
  for (const s of scenes) {
    const words = wordsById[s.id]
    if (!Array.isArray(words) || words.length === 0 || !(s.voMs > 0)) continue
    beats.push({
      beatId: s.id,
      startSec: Math.round(s.resolvedStartMs) / 1000,
      durSec: Math.round(s.voMs) / 1000,
      words: [...words],
    })
  }
  return beats
}

/**
 * Build solver input from measured per-beat narration timing (the captions.json
 * `beats` produced by tools/synth-voice.py) + authored constraints.
 * `constraints` maps beatId → { minMs?, maxMs?, padAfterMs? }.
 */
export function scenesFromCaptions(captionBeats, constraints = {}) {
  if (!Array.isArray(captionBeats)) throw new Error('scenesFromCaptions: captionBeats required')
  return captionBeats.map((b) => ({
    id: b.beatId,
    voMs: Math.round((b.durSec ?? 0) * 1000),
    ...(constraints[b.beatId] || {}),
  }))
}
