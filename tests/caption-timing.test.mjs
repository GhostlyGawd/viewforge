import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revealedIndex, wordWindow, wordRevealTimes, validateCaptionBeats } from '../lib/caption-timing.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

// ---- property: revealedIndex is always a valid in-range index ----

test('property: revealedIndex(progress, count) is always within [0, count-1]', () => {
  forAll(
    gens.record({ p: gens.float(-0.5, 1.5), count: gens.int(1, 80) }),
    ({ p, count }) => {
      const i = revealedIndex(p, count)
      return i >= 0 && i <= count - 1
    },
    { runs: 400 },
  )
})

test('property: revealedIndex is monotonic non-decreasing in progress', () => {
  forAll(gens.int(1, 60), (count) => {
    let prev = -1
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const i = revealedIndex(p, count)
      if (i < prev) return false
      prev = i
    }
    return true
  })
})

// ---- property: wordWindow stays in bounds and respects the cap ----

test('property: wordWindow is always in-bounds and ≤ windowSize', () => {
  forAll(
    gens.record({ total: gens.int(1, 80), rev: gens.int(-1, 80), win: gens.int(1, 20) }),
    ({ total, rev, win }) => {
      const words = Array.from({ length: total }, (_, i) => 'w' + i)
      const r = Math.min(rev, total - 1)
      const { start, end, words: vis } = wordWindow(words, r, win)
      return start >= 0 && end <= total && vis.length <= win && (r < 0 ? vis.length === 0 : true)
    },
    { runs: 400 },
  )
})

// ---- property: reveal times are monotonic and within the beat ----

test('property: wordRevealTimes are sorted ascending and within [0, durSec)', () => {
  forAll(
    gens.record({ n: gens.int(0, 60), dur: gens.float(0.1, 40) }),
    ({ n, dur }) => {
      const words = Array.from({ length: n }, (_, i) => 'w' + i)
      const times = wordRevealTimes(words, dur)
      if (times.length !== n) return false
      for (let i = 1; i < times.length; i++) if (times[i] < times[i - 1]) return false
      return times.every((t) => t >= 0 && t < dur + 1e-6)
    },
    { runs: 300 },
  )
})

// ---- BDD ----

feature('Word-synced captions', () => {
  const words = 'In 1872 a single comma cost forty million dollars'.split(' ') // 9 words

  scenario('At the start only the first word shows; at the end the last word is current', () => {
    const first = when('progress = 0', () => revealedIndex(0, words.length))
    const last = and('progress = 1', () => revealedIndex(1, words.length))
    then('first→0, last→8', () => {
      assert.equal(first, 0)
      assert.equal(last, words.length - 1)
    })
  })

  scenario('The rolling window keeps captions readable on a long line', () => {
    const w = when('we view the window at the last word with size 5', () => wordWindow(words, 8, 5))
    then('it shows the last 5 words only', () => {
      assert.equal(w.words.length, 5)
      assert.deepEqual(w.words, ['comma', 'cost', 'forty', 'million', 'dollars'])
    })
  })

  scenario('Overlapping or empty caption beats are rejected', () => {
    const good = given('two ordered, non-overlapping beats with words', () => [
      { beatId: 'a', startSec: 0, durSec: 5, words: ['hi'] },
      { beatId: 'b', startSec: 5.3, durSec: 4, words: ['there'] },
    ])
    const bad = and('a beat that overlaps the previous one', () => [
      { beatId: 'a', startSec: 0, durSec: 5, words: ['hi'] },
      { beatId: 'b', startSec: 2, durSec: 4, words: ['there'] },
    ])
    then('only the ordered set validates', () => {
      assert.equal(validateCaptionBeats(good).valid, true)
      const r = validateCaptionBeats(bad)
      assert.equal(r.valid, false)
      assert.match(r.errors.join(';'), /overlaps/)
    })
  })

  scenario('A beat with no words is invalid', () => {
    then('it fails validation', () => assert.equal(validateCaptionBeats([{ beatId: 'x', startSec: 0, durSec: 3, words: [] }]).valid, false))
  })
})

// ---------------------------------------------------------------------------
// Timestamp-first word timing (Master Doc v2 §6) — plan 06 Phase D
// ---------------------------------------------------------------------------
import { weightedRevealTimes, normalizeAlignedWords, revealedIndexAtTime } from '../lib/caption-timing.mjs'

test('property: D1 — weightedRevealTimes: monotonic, first at 0, all < durSec, longer words get ≥ share', () => {
  forAll(
    gens.record({ n: gens.int(1, 40), dur: gens.float(0.5, 30) }),
    ({ n, dur }) => {
      const words = Array.from({ length: n }, (_, i) => 'w'.repeat(1 + ((i * 7) % 9)))
      const times = weightedRevealTimes(words, dur)
      if (times.length !== n || times[0] !== 0) return false
      for (let i = 1; i < n; i++) if (times[i] < times[i - 1]) return false
      if (!times.every((t) => t >= 0 && t < dur + 1e-6)) return false
      // duration share of word i (time until next reveal) grows with word length
      for (let i = 0; i + 1 < n - 1; i++) {
        const shareI = times[i + 1] - times[i]
        const shareNext = times[i + 2] - times[i + 1]
        if (words[i].length < words[i + 1].length && shareI > shareNext + 1e-6) return false
        if (words[i].length > words[i + 1].length && shareI < shareNext - 1e-6) return false
      }
      return true
    },
    { runs: 300 },
  )
})

test('property: D2 — real aligned timestamps round-trip: at any word\'s start time, that word is current', () => {
  forAll(
    (rng) => {
      const n = gens.int(1, 20)(rng)
      const beatStart = gens.float(0, 50)(rng)
      let t = beatStart
      const aligned = Array.from({ length: n }, (_, i) => {
        const start = t
        t += gens.float(0.12, 0.9)(rng)
        return { word: 'w' + i, start, end: t }
      })
      return { aligned, beatStart, durSec: t - beatStart + 0.5 }
    },
    ({ aligned, beatStart, durSec }) => {
      const norm = normalizeAlignedWords(aligned, { beatStartSec: beatStart, durSec })
      if (!norm.valid) return false
      const times = norm.words.map((w) => w.tSec)
      return aligned.every((a, i) => revealedIndexAtTime(a.start - beatStart, times) === i)
    },
    { runs: 250 },
  )
})

feature('Timestamp-first captions', () => {
  scenario('D3 — non-monotonic alignment is rejected with a reason, never silently reordered', () => {
    const r = when('word 2 starts before word 1', () =>
      normalizeAlignedWords([
        { word: 'forty', start: 1.0 },
        { word: 'million', start: 0.4 },
      ]),
    )
    then('the input is invalid and no reveal times are produced', () => {
      assert.equal(r.valid, false)
      assert.match(r.errors.join(';'), /not monotonic/)
      assert.deepEqual(r.words, [])
    })
  })

  scenario('D3 — alignment outside the beat window is caught', () => {
    const r = when('a word lands after the beat ends', () => normalizeAlignedWords([{ word: 'late', start: 9 }], { beatStartSec: 0, durSec: 5 }))
    then('it is rejected', () => {
      assert.equal(r.valid, false)
      assert.match(r.errors.join(';'), /outside the beat/)
    })
  })

  scenario('Captions appear WITH the voice: before the first word, nothing is current', () => {
    then('revealedIndexAtTime is −1 before the first reveal', () => {
      assert.equal(revealedIndexAtTime(0.1, [0.4, 1.0]), -1)
      assert.equal(revealedIndexAtTime(0.4, [0.4, 1.0]), 0)
      assert.equal(revealedIndexAtTime(5, [0.4, 1.0]), 1)
      assert.equal(revealedIndexAtTime(1, []), -1)
    })
  })

  scenario('captions.json with per-word reveal times validates end-to-end', () => {
    const beat = given('a beat whose revealSec came from weightedRevealTimes', () => {
      const words = ['a', 'misplaced', 'comma']
      return { beatId: 'hook', startSec: 0, durSec: 3, words, revealSec: weightedRevealTimes(words, 3) }
    })
    then('it passes beat validation; a truncated or out-of-beat revealSec does not', () => {
      assert.equal(validateCaptionBeats([beat]).valid, true)
      assert.equal(validateCaptionBeats([{ ...beat, revealSec: beat.revealSec.slice(1) }]).valid, false)
      assert.equal(validateCaptionBeats([{ ...beat, revealSec: [0, 1, 9] }]).valid, false)
    })
  })
})
