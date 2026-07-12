// caption-timing.mjs — the pure logic behind word-synced captions.
//
// The audio-driven caption composition reveals words in time with the narration. This
// module is the tested source of truth for that timing: which word is "current" at a
// given progress, the rolling visible window, and per-word reveal times — plus a
// validator for the caption beat list. The composition mirrors `revealedIndex` /
// `wordWindow` (it can't import across the Remotion bundle boundary), so these stay the
// spec. Zero-dep.

/** Clamp helper. */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

/** The index of the word that is "current" at `progress` (0..1) for `count` words.
 *  Always in [0, count-1]; count<=0 yields -1 (nothing to show). */
export function revealedIndex(progress, count) {
  if (!(count > 0)) return -1
  const p = clamp(Number(progress) || 0, 0, 1)
  return Math.min(count - 1, Math.floor(p * count))
}

/** The rolling window of visible words ending at `revealed`. Returns { start, end,
 *  words } with at most `windowSize` items, always within [0, total]. */
export function wordWindow(words, revealed, windowSize = 12) {
  const total = words.length
  if (revealed < 0 || total === 0) return { start: 0, end: 0, words: [] }
  const end = Math.min(total, revealed + 1)
  const start = Math.max(0, end - windowSize)
  return { start, end, words: words.slice(start, end) }
}

/** Per-word reveal times (seconds from the beat start), evenly distributed across the
 *  beat duration. Monotonic increasing, each in [0, durSec). */
export function wordRevealTimes(words, durSec) {
  const n = words.length
  if (n === 0 || !(durSec > 0)) return []
  return words.map((_, i) => Math.round(((i / n) * durSec) * 1000) / 1000)
}

// ---------------------------------------------------------------------------
// Timestamp-first word timing (Master Doc v2 §6). The ladder, best first:
//   1. real forced-alignment timestamps (whisperX / a TTS that reports them),
//   2. duration-weighted estimate within the beat's REAL measured audio duration
//      (longer words take longer — much closer to speech than an even split),
//   3. the even split above, kept only as the legacy fallback.
// ---------------------------------------------------------------------------

/** Per-word reveal times (seconds from beat start) weighted by word length, so the
 *  estimate tracks natural speech rhythm. Monotonic, first at 0, all in [0, durSec).
 *  The +1 per word approximates the inter-word gap. */
export function weightedRevealTimes(words, durSec) {
  const n = words.length
  if (n === 0 || !(durSec > 0)) return []
  const weights = words.map((w) => String(w).length + 1)
  const total = weights.reduce((a, b) => a + b, 0)
  let cum = 0
  return weights.map((w) => {
    const t = (cum / total) * durSec
    cum += w
    return Math.round(t * 1000) / 1000
  })
}

/**
 * Normalize REAL aligned word timestamps (whisperX-style: [{ word|text, start|startSec,
 * end|endSec }] in absolute track seconds) into beat-relative reveal times.
 * Returns { valid, errors, words: [{ word, tSec }] } — non-monotonic or out-of-beat
 * input is rejected with reasons, never silently reordered (real timestamps that look
 * wrong mean the alignment is wrong, and captions built on them would lie).
 */
export function normalizeAlignedWords(aligned, { beatStartSec = 0, durSec = Infinity } = {}) {
  const errors = []
  if (!Array.isArray(aligned) || aligned.length === 0) return { valid: false, errors: ['no aligned words'], words: [] }
  const words = []
  let prev = -Infinity
  for (const [i, a] of aligned.entries()) {
    const word = a?.word ?? a?.text
    const start = a?.start ?? a?.startSec
    if (typeof word !== 'string' || !word.trim()) errors.push(`word ${i}: missing text`)
    if (!(typeof start === 'number' && Number.isFinite(start))) {
      errors.push(`word ${i} ("${word}"): missing start time`)
      continue
    }
    if (start < prev) errors.push(`word ${i} ("${word}"): starts at ${start}s, before the previous word — alignment is not monotonic`)
    prev = start
    // floor to ms, never round up: a caption may appear ≤1ms early, never late
    const tSec = Math.floor((start - beatStartSec) * 1000) / 1000
    if (tSec < -1e-9 || tSec >= durSec + 1e-9) errors.push(`word ${i} ("${word}"): ${tSec}s falls outside the beat [0, ${durSec})`)
    words.push({ word, tSec })
  }
  return { valid: errors.length === 0, errors, words: errors.length === 0 ? words : [] }
}

/** The index of the word being spoken at `tSec` given real reveal times: the last
 *  reveal ≤ t. −1 before the first word (captions appear WITH the voice, not before). */
export function revealedIndexAtTime(tSec, revealTimes) {
  if (!Array.isArray(revealTimes) || revealTimes.length === 0) return -1
  let idx = -1
  for (let i = 0; i < revealTimes.length; i++) {
    if (revealTimes[i] <= tSec + 1e-9) idx = i
    else break
  }
  return idx
}

/** Validate a caption beat list: each beat has non-empty words and durSec>0, and the
 *  beats are time-ordered and non-overlapping. Returns { valid, errors }. */
export function validateCaptionBeats(beats) {
  const errors = []
  if (!Array.isArray(beats)) return { valid: false, errors: ['beats must be an array'] }
  let prevEnd = -Infinity
  for (const b of beats) {
    const tag = b?.beatId || '(no id)'
    if (!Array.isArray(b?.words) || b.words.length === 0) errors.push(`${tag}: no words`)
    if (!(b?.durSec > 0)) errors.push(`${tag}: durSec must be > 0`)
    if (!(typeof b?.startSec === 'number')) errors.push(`${tag}: startSec must be a number`)
    else {
      if (b.startSec < prevEnd - 1e-6) errors.push(`${tag}: starts at ${b.startSec}s, overlaps previous beat ending at ${prevEnd}s`)
      prevEnd = b.startSec + (b.durSec || 0)
    }
    // optional per-word reveal times (beat-relative): must cover every word, be
    // monotonic non-decreasing, and stay within the beat
    if (b?.revealSec !== undefined) {
      if (!Array.isArray(b.revealSec) || b.revealSec.length !== (b.words?.length ?? 0)) {
        errors.push(`${tag}: revealSec must have one entry per word`)
      } else {
        for (let i = 0; i < b.revealSec.length; i++) {
          const t = b.revealSec[i]
          if (!(typeof t === 'number' && t >= 0 && t < (b.durSec ?? 0) + 1e-6)) errors.push(`${tag}: revealSec[${i}]=${t} outside [0, durSec)`)
          if (i > 0 && t < b.revealSec[i - 1] - 1e-9) errors.push(`${tag}: revealSec not monotonic at ${i}`)
        }
      }
    }
  }
  return { valid: errors.length === 0, errors }
}
