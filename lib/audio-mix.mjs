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
  duckDb: -19, // music under narration — a 13 dB duck, inside the v2 §6 12–15 dB window
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

// ---------------------------------------------------------------------------
// Mastering (Master Doc v2 §6/§21) + Gate-B audio checks (§25).
//
// The final mix is normalized to YouTube's target: −14 LUFS integrated, −1 dBTP true
// peak. Music sits 12–15 dB under narration while speech is active (deep enough to be
// intelligible, shallow enough to stay musical). Voice is never time-stretched beyond
// ±4%. validateMaster runs over MEASURED numbers (e.g. ffmpeg loudnorm's analysis) —
// it never trusts intended values.
// ---------------------------------------------------------------------------

import { isStretchAllowed, stretchPct } from './timing-solver.mjs'

export const MASTER_TARGETS = Object.freeze({
  lufsIntegrated: -14, // YouTube normalization target
  lufsToleranceLu: 1, // Gate B: within ±1 LU of target
  truePeakDbMax: -1, // −1 dBTP ceiling — above this is clipping risk
  duckUnderNarrationDbMin: 12, // music at least this far under narration (blocking)
  duckUnderNarrationDbMax: 15, // deeper than this loses musical continuity (advisory)
  maxSilenceGapMs: 700, // Gate B: no dead air longer than this
  maxVoiceStretchPct: 4, // voice stretch cap, same invariant as the timing solver
  lra: 11, // loudness range for the loudnorm filter
})

/** How far (dB) the music sits under the narration while speech is active. */
export function duckDepthDb(cfg = {}) {
  const { narrationDb, duckDb } = { ...MIX_DEFAULTS, ...cfg }
  return narrationDb - duckDb
}

/**
 * Find dead-air gaps: stretches of the runtime covered by NO audible interval
 * (narration, bed, SFX) longer than `maxGapMs`. Head and tail count — a video that
 * opens or ends on silence is dead air too. Returns [{ startSec, endSec, gapMs }].
 */
export function silenceGaps(intervals = [], runtimeSec = 0, { maxGapMs = MASTER_TARGETS.maxSilenceGapMs } = {}) {
  if (!(runtimeSec > 0)) throw new Error('silenceGaps: runtimeSec must be > 0')
  const spans = intervals
    .map((i) => ({ start: Math.max(0, i.startSec), end: Math.min(runtimeSec, i.endSec) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start)
  // merge overlapping/adjacent audible spans
  const merged = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else merged.push({ ...s })
  }
  const gaps = []
  let cursor = 0
  for (const m of [...merged, { start: runtimeSec, end: runtimeSec }]) {
    const gapMs = Math.round((m.start - cursor) * 1000)
    if (gapMs > maxGapMs) gaps.push({ startSec: round3(cursor), endSec: round3(m.start), gapMs })
    cursor = Math.max(cursor, m.end)
  }
  return gaps
}

/**
 * Gate-B audio checklist (§25) over MEASURED values. Returns { valid, issues,
 * warnings } — issues block, warnings are advisory.
 *
 * `measured`: { lufsIntegrated, truePeakDb, audible?: [{startSec,endSec}],
 *              runtimeSec?, voiceStretchPct?, mix? }
 *  - lufsIntegrated / truePeakDb: from the mastering analysis (e.g. loudnorm JSON).
 *  - audible + runtimeSec: enables the dead-air check.
 *  - voiceStretchPct: any stretch applied to the voice anywhere in the pipeline.
 *  - mix: the mix config (narrationDb/duckDb) for the duck-depth window check.
 */
export function validateMaster(measured = {}, targets = MASTER_TARGETS) {
  const t = { ...MASTER_TARGETS, ...targets }
  const issues = []
  const warnings = []

  if (typeof measured.lufsIntegrated !== 'number') {
    issues.push('no measured integrated loudness — master unverified')
  } else if (Math.abs(measured.lufsIntegrated - t.lufsIntegrated) > t.lufsToleranceLu + 1e-9) {
    issues.push(`integrated loudness ${measured.lufsIntegrated} LUFS outside ${t.lufsIntegrated}±${t.lufsToleranceLu} LU`)
  }

  if (typeof measured.truePeakDb !== 'number') {
    issues.push('no measured true peak — master unverified')
  } else if (measured.truePeakDb > t.truePeakDbMax + 1e-9) {
    issues.push(`true peak ${measured.truePeakDb} dBTP above the ${t.truePeakDbMax} dBTP ceiling — clipping risk`)
  }

  if (Array.isArray(measured.audible) && measured.runtimeSec > 0) {
    for (const g of silenceGaps(measured.audible, measured.runtimeSec, { maxGapMs: t.maxSilenceGapMs })) {
      issues.push(`dead air ${g.gapMs}ms at ${g.startSec}s–${g.endSec}s (max ${t.maxSilenceGapMs}ms)`)
    }
  }

  if (typeof measured.voiceStretchPct === 'number' && Math.abs(measured.voiceStretchPct) > t.maxVoiceStretchPct + 1e-9) {
    issues.push(`voice stretched ${measured.voiceStretchPct}% — beyond the ±${t.maxVoiceStretchPct}% cap; fix the script, not the voice`)
  }

  if (measured.mix) {
    const depth = duckDepthDb(measured.mix)
    if (depth < t.duckUnderNarrationDbMin - 1e-9) {
      issues.push(`music ducks only ${depth} dB under narration (min ${t.duckUnderNarrationDbMin}) — intelligibility at risk`)
    } else if (depth > t.duckUnderNarrationDbMax + 1e-9) {
      warnings.push(`music ducks ${depth} dB under narration (v2 window ${t.duckUnderNarrationDbMin}–${t.duckUnderNarrationDbMax}) — musical continuity suffers; advisory only`)
    }
  }

  return { valid: issues.length === 0, issues, warnings }
}

/**
 * Build the ffmpeg loudnorm filter args for the two-pass master (pure — args as data).
 *  - pass 'measure': analysis pass printing the JSON the apply pass needs.
 *  - pass 'apply': linear normalization using the measured values.
 */
export function ffmpegLoudnormArgs({ pass = 'measure', measured = {} } = {}, targets = MASTER_TARGETS) {
  const t = { ...MASTER_TARGETS, ...targets }
  const base = `loudnorm=I=${t.lufsIntegrated}:TP=${t.truePeakDbMax}:LRA=${t.lra}`
  if (pass === 'measure') return ['-af', `${base}:print_format=json`, '-f', 'null', '-']
  if (pass === 'apply') {
    const need = ['inputI', 'inputTp', 'inputLra', 'inputThresh']
    for (const k of need) if (typeof measured[k] !== 'number') throw new Error(`ffmpegLoudnormArgs: apply pass needs measured.${k} from the measure pass`)
    return [
      '-af',
      `${base}:measured_I=${measured.inputI}:measured_TP=${measured.inputTp}:measured_LRA=${measured.inputLra}:measured_thresh=${measured.inputThresh}:offset=${measured.targetOffset ?? 0}:linear=true`,
    ]
  }
  throw new Error(`ffmpegLoudnormArgs: unknown pass "${pass}"`)
}

const round3 = (x) => Math.round(x * 1000) / 1000

export { isStretchAllowed, stretchPct }
