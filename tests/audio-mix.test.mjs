import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MIX_DEFAULTS, musicLevelDb, musicGain, validateMix, isNarrating,
  placeSfxCue, validateSfxCues, assertAudioRightsClean, narrationSegmentsFromBeats,
} from '../lib/audio-mix.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

// Generate a runtime + non-overlapping narration segments.
const genTimeline = (rng) => {
  const runtime = gens.int(30, 120)(rng)
  const n = gens.int(0, 5)(rng)
  const segs = []
  let t = gens.float(1, 5)(rng)
  for (let i = 0; i < n && t < runtime - 5; i++) {
    const dur = gens.float(2, 8)(rng)
    const end = Math.min(t + dur, runtime - 1)
    if (end > t) segs.push({ startSec: t, endSec: end })
    t = end + gens.float(1, 4)(rng)
  }
  return { runtime, segs }
}

// ---- B1 + B2: property — the mix is always safe over generated timelines ----

test('B1+B2 property: validateMix is valid for any generated timeline (default cfg)', () => {
  forAll(genTimeline, ({ runtime, segs }) => validateMix({ runtimeSec: runtime, segments: segs }).valid === true, { runs: 250 })
})

test('B1 property: during ANY narration segment, narration − music ≥ minSeparationDb', () => {
  forAll(genTimeline, ({ runtime, segs }) => {
    for (const s of segs) {
      const mid = (s.startSec + s.endSec) / 2
      const clearance = MIX_DEFAULTS.narrationDb - musicLevelDb(mid, segs, { runtimeSec: runtime })
      if (clearance < MIX_DEFAULTS.minSeparationDb - 1e-9) return false
    }
    return true
  }, { runs: 250 })
})

test('B2 property: in the body of the track music gain is always > 0 (no silent gaps)', () => {
  forAll(genTimeline, ({ runtime, segs }) => {
    for (let sec = MIX_DEFAULTS.fadeSec + 0.05; sec < runtime - MIX_DEFAULTS.fadeSec; sec += 0.5) {
      if (musicGain(sec, segs, { runtimeSec: runtime }) <= 0) return false
    }
    return true
  }, { runs: 150 })
})

// ---- B1: BDD ----

feature('Music ducks under narration', () => {
  const segs = [{ startSec: 5, endSec: 12 }]
  const runtime = 30

  scenario('While narration plays, music sits at the duck level with safe clearance', () => {
    const lvl = when('we read the music level mid-narration', () => musicLevelDb(8, segs, { runtimeSec: runtime }))
    then('it equals duckDb and clears narration by ≥ minSeparationDb', () => {
      assert.equal(lvl, MIX_DEFAULTS.duckDb)
      assert.ok(MIX_DEFAULTS.narrationDb - lvl >= MIX_DEFAULTS.minSeparationDb)
    })
  })

  scenario('In open air the bed comes back up (louder than during narration)', () => {
    then('open-air level > ducked level', () => {
      assert.ok(musicLevelDb(20, segs, { runtimeSec: runtime }) > musicLevelDb(8, segs, { runtimeSec: runtime }))
    })
  })

  scenario('A misconfigured shallow duck is REJECTED by validateMix', () => {
    const res = when('duckDb is set too high (−10, above the −16 ceiling)', () => validateMix({ runtimeSec: runtime, segments: segs, opts: { duckDb: -10 } }))
    then('the mix is invalid', () => {
      assert.equal(res.valid, false)
      assert.match(res.issues.join(';'), /duckDb/)
    })
  })
})

// ---- B3: SFX placement ----

const genBeat = gens.record({ id: () => 'b', startSec: gens.int(0, 100), len: gens.int(2, 30) })

test('B3 property: placeSfxCue always lands inside its beat window', () => {
  forAll(
    (rng) => {
      const b = genBeat(rng)
      return { beat: { id: b.id, startSec: b.startSec, endSec: b.startSec + b.len }, f: gens.float(0, 1)(rng) }
    },
    ({ beat, f }) => {
      const cue = placeSfxCue(beat, f)
      return cue.atSec >= beat.startSec && cue.atSec < beat.endSec
    },
    { runs: 300 },
  )
})

feature('SFX cue placement', () => {
  const beats = [{ id: 'hook', startSec: 0, endSec: 14 }, { id: 'payoff', startSec: 295, endSec: 346 }]
  scenario('A cue placed within a beat validates; one outside is flagged', () => {
    const good = given('a cue at the start of the hook', () => placeSfxCue(beats[0], 0))
    const bad = and('a hand-made cue outside the payoff window', () => ({ beatId: 'payoff', atSec: 999, gain: 0.6 }))
    then('only the in-window cue validates', () => {
      assert.equal(validateSfxCues(beats, [good]).valid, true)
      assert.equal(validateSfxCues(beats, [bad]).valid, false)
    })
  })
})

// ---- B4: audio rights gate ----

test('B4 property: assertAudioRightsClean matches the license gate for every asset', () => {
  const LIC = ['cc0', 'public domain', 'CC BY 4.0', 'CC BY-NC 4.0', 'unknown']
  forAll(
    gens.array(gens.record({ id: () => 'x', license: gens.pick(LIC), attribution: (rng) => gens.pick(['A. Composer', null])(rng) }), 0, 12),
    (assets) => {
      const res = assertAudioRightsClean(assets)
      // valid iff every asset individually passes the gate
      const everyOk = assets.every((a) => {
        const usable = a.license === 'cc0' || a.license === 'public domain' || (a.license === 'CC BY 4.0' && a.attribution)
        return usable
      })
      return res.valid === everyOk
    },
    { runs: 200 },
  )
})

feature('Audio rights gate', () => {
  scenario('Synthesized (CC0) audio passes; NC and unknown are rejected', () => {
    then('the gate is correct', () => {
      assert.equal(assertAudioRightsClean([{ id: 'bed', license: 'cc0' }]).valid, true)
      assert.equal(assertAudioRightsClean([{ id: 'm', license: 'CC BY-NC 4.0', attribution: 'x' }]).valid, false)
      assert.equal(assertAudioRightsClean([{ id: 'm', license: 'unknown' }]).valid, false)
    })
  })
})

// ---- helper: derive segments from beats ----

test('narrationSegmentsFromBeats keeps only spoken beats and applies the offset', () => {
  const beats = [{ startSec: 0, endSec: 14, text: 'hi' }, { startSec: 14, endSec: 20, text: '' }]
  const segs = narrationSegmentsFromBeats(beats, { offsetSec: 1.4 })
  assert.equal(segs.length, 1)
  assert.equal(segs[0].startSec, 1.4)
  assert.ok(isNarrating(5, segs))
})
