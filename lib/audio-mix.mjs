// audio-mix.mjs — the mix model for narration + music bed + SFX.
//
// The priority bus is the NARRATION. The music bed plays under it and DUCKS whenever
// narration is active, so speech stays intelligible. Ducking is anticipatory (the duck
// completes by narration onset), which makes the core invariant exact: during any
// narration segment the music sits at `duckDb`, a fixed margin below the narration.
//
// Pure + zero-dep. The actual audio rendering uses these gains; the synthesis lives in
// tools/synth-audio.mjs.

import { isUsable } from './asset-license.mjs'

export const MIX_DEFAULTS = Object.freeze({
  narrationDb: -6, // reference narration level
  bedDb: -18, // music when no narration
  duckDb: -30, // music under narration
  minSeparationDb: 10, // narration must sit this far above music during speech
  fadeSec: 0.8, // bed fade-in/out at the track ends + duck ramp in gaps
})

export const dbToGain = (db) => Math.pow(10, db / 20)
export const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-6))

/** Narration segments: [{ startSec, endSec }]. True if `sec` is inside any segment. */
export function isNarrating(sec, segments = []) {
  return segments.some((s) => sec >= s.startSec && sec < s.endSec)
}

/**
 * Music level (dB) at `sec`:
 *  - exactly `duckDb` while narration is active (anticipatory duck),
 *  - `bedDb` in open air,
 *  - a fade-in over the first `fadeSec` and fade-out over the last `fadeSec` of the track,
 *  - a short ramp between duck and bed in the gaps (purely cosmetic; never raises the
 *    level during narration).
 */
const SILENT_DB = -60

export function musicLevelDb(sec, segments, opts = {}) {
  const { bedDb, duckDb, fadeSec } = { ...MIX_DEFAULTS, ...opts }
  const runtimeSec = opts.runtimeSec ?? Infinity
  if (isNarrating(sec, segments)) return duckDb // exact during narration → invariant holds

  let level = bedDb
  // fade-in over the first fadeSec (SILENT → bed)
  if (sec < fadeSec) level = SILENT_DB + (sec / fadeSec) * (bedDb - SILENT_DB)
  // fade-out over the last fadeSec (bed → SILENT)
  if (Number.isFinite(runtimeSec) && sec > runtimeSec - fadeSec) {
    const t = Math.max(0, Math.min(1, (runtimeSec - sec) / fadeSec)) // 1 at fade start → 0 at end
    level = Math.min(level, SILENT_DB + t * (bedDb - SILENT_DB))
  }
  // ramp back up out of a recent duck (never raises level during narration)
  const ends = segments.filter((s) => s.endSec <= sec).map((s) => s.endSec)
  if (ends.length) {
    const lastEnd = Math.max(...ends)
    if (sec - lastEnd < fadeSec) level = Math.min(level, duckDb + ((sec - lastEnd) / fadeSec) * (bedDb - duckDb))
  }
  return level
}

export const musicGain = (sec, segments, opts = {}) => dbToGain(musicLevelDb(sec, segments, opts))

/**
 * Validate a mix config + timeline. Returns { valid, issues }.
 *  - B1: at sampled points INSIDE narration, narration − music ≥ minSeparationDb.
 *  - B2: at sampled points in the body of the track, music gain > 0 (no silent gap).
 */
export function validateMix({ runtimeSec, segments = [], opts = {} } = {}) {
  const cfg = { ...MIX_DEFAULTS, ...opts }
  const issues = []
  if (!(runtimeSec > 0)) return { valid: false, issues: ['runtimeSec must be > 0'] }

  // config sanity: the duck must be deep enough that the invariant CAN hold
  if (cfg.duckDb > cfg.narrationDb - cfg.minSeparationDb) {
    issues.push(`duckDb ${cfg.duckDb} too high — must be ≤ narrationDb − minSeparationDb (${cfg.narrationDb - cfg.minSeparationDb})`)
  }

  const step = 0.1
  for (let sec = 0; sec < runtimeSec; sec += step) {
    if (isNarrating(sec, segments)) {
      const clearance = cfg.narrationDb - musicLevelDb(sec, segments, { ...cfg, runtimeSec })
      if (clearance < cfg.minSeparationDb - 1e-9) issues.push(`B1 violated at ${sec.toFixed(1)}s: clearance ${clearance.toFixed(1)}dB < ${cfg.minSeparationDb}`)
    }
    // body of the track (exclude the very ends where intentional fades approach silence)
    if (sec > cfg.fadeSec && sec < runtimeSec - cfg.fadeSec) {
      if (musicGain(sec, segments, { ...cfg, runtimeSec }) <= 0) issues.push(`B2 violated at ${sec.toFixed(1)}s: silent gap`)
    }
    if (issues.length > 5) break
  }
  return { valid: issues.length === 0, issues }
}

/** Place an SFX cue at a fraction within a beat; returns { beatId, atSec, gain }. */
export function placeSfxCue(beat, atFraction = 0.0, gain = 0.6) {
  const f = Math.max(0, Math.min(0.999, atFraction))
  const atSec = beat.startSec + f * (beat.endSec - beat.startSec)
  return { beatId: beat.id, atSec, gain }
}

/** Validate SFX cues fall within their beats (B3). Returns { valid, issues }. */
export function validateSfxCues(beats, cues) {
  const byId = new Map(beats.map((b) => [b.id, b]))
  const issues = []
  for (const c of cues) {
    const b = byId.get(c.beatId)
    if (!b) {
      issues.push(`cue references unknown beat ${c.beatId}`)
      continue
    }
    if (!(c.atSec >= b.startSec && c.atSec < b.endSec)) issues.push(`cue ${c.beatId}@${c.atSec}s outside beat window [${b.startSec},${b.endSec})`)
  }
  return { valid: issues.length === 0, issues }
}

/** Rights gate for audio assets (B4): every music/SFX asset must pass the license gate. */
export function assertAudioRightsClean(assets) {
  const issues = []
  for (const a of assets) if (!isUsable(a.license, { attribution: a.attribution })) issues.push(`${a.id || a.localFile}: license ${a.license} not usable`)
  return { valid: issues.length === 0, issues }
}

/** Derive narration segments from script beats that carry spoken text. */
export function narrationSegmentsFromBeats(beats, { offsetSec = 0 } = {}) {
  return beats.filter((b) => (b.text || '').trim()).map((b) => ({ startSec: b.startSec + offsetSec, endSec: b.endSec + offsetSec }))
}
