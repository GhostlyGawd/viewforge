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
  }
  return { valid: errors.length === 0, errors }
}
