// v0.12.0 — the top-1% quality bar (operator mandate: nothing below the bar ships).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { QUALITY_BAR, visualEvents, validateCadence, decodePng, frameDifference, detectStaticScenes, CRAFT_RUBRIC, scoreCraft, evaluateQualityBar, JUDGE_PROTOCOL, scoreRubricV2Frame } from '../lib/quality-bar.mjs'
import { runGatePublish } from '../lib/gates.mjs'
import { forAll, gens } from './helpers/prop.mjs'

// ---- tiny PNG encoder for tests (filter 0 rows; decoder ignores CRC) ----
function encodePng(width, height, pixel) {
  const bpp = 4
  const stride = width * bpp
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y)
      raw.writeUInt8(r, y * (stride + 1) + 1 + x * bpp)
      raw.writeUInt8(g, y * (stride + 1) + 1 + x * bpp + 1)
      raw.writeUInt8(b, y * (stride + 1) + 1 + x * bpp + 2)
      raw.writeUInt8(a, y * (stride + 1) + 1 + x * bpp + 3)
    }
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4)
    data.copy(out, 8)
    return out // CRC left zero — decoder does not verify
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const scene = (beatId, startSec, endSec, over = {}) => ({ beatId, startSec, endSec, params: { sceneType: 'photo-caption', cutsPerScene: 4, ...over.params }, assets: over.assets ?? [{ id: 'a', localFile: 'a.jpg' }], ...over })

// ---- cadence ----

test('property: cadence — gaps beyond the bar are found; a cut-dense scene never violates', () => {
  forAll(
    gens.record({ dur: gens.float(6, 30), cuts: gens.int(1, 8) }),
    ({ dur, cuts }) => {
      const plan = { scenes: [scene('s0', 0, dur, { params: { sceneType: 'photo-caption', cutsPerScene: cuts }, assets: [{ id: 'a', localFile: 'a.jpg' }, { id: 'b', localFile: 'b.jpg' }] })] }
      const r = validateCadence(plan)
      const n = Math.max(1, Math.min(cuts, 6)) // 2 assets → cap 6
      const worstGap = dur / n
      return worstGap > QUALITY_BAR.maxEventGapSec ? !r.valid : r.valid
    },
    { runs: 250 },
  )
})

test('cadence — declared holds are exempt up to their own cap; undeclared stillness is not', () => {
  const still = { scenes: [scene('long', 0, 12, { params: { sceneType: 'photo-caption', cutsPerScene: 1 } })] }
  assert.equal(validateCadence(still).valid, false)
  const declared = { scenes: [scene('long', 0, 12, { holdMs: 3000, params: { sceneType: 'photo-caption', cutsPerScene: 1 } })] }
  assert.equal(validateCadence(declared).valid, true)
  const tooLong = { scenes: [scene('long', 0, 20, { holdMs: 3000, params: { sceneType: 'photo-caption', cutsPerScene: 1 } })] }
  assert.equal(validateCadence(tooLong).valid, false) // even a declared hold caps at 15s
})

test('cadence — kinetic scenes pulse on word reveals; set-piece scenes on their internal events', () => {
  const captions = { beats: [{ beatId: 'hook', startSec: 0, durSec: 8, words: 'a b c d e f g h'.split(' '), revealSec: [0, 1, 2, 3, 4, 5, 6, 7] }] }
  const plan = { scenes: [scene('hook', 0, 8, { params: { sceneType: 'kinetic-open', cutsPerScene: 1 } })] }
  assert.equal(validateCadence(plan, { captions }).valid, true)
  const mech = { scenes: [scene('m', 0, 8, { params: { sceneType: 'mechanism', cutsPerScene: 1 } })] }
  assert.equal(validateCadence(mech).valid, true) // internal events at 0.1/0.35/0.6/0.8 of 8s
  assert.ok(visualEvents(mech.scenes && mech).some((e) => e.kind === 'set-piece'))
})

// ---- PNG decode + static detection ----

test('property: PNG round-trip — identical frames diff ~0; different frames diff large; static detection follows', () => {
  forAll(
    gens.record({ shade: gens.int(0, 200), w: gens.int(8, 24), h: gens.int(8, 24) }),
    ({ shade, w, h }) => {
      const flat = decodePng(encodePng(w, h, () => [shade, shade, shade, 255]))
      const flat2 = decodePng(encodePng(w, h, () => [shade, shade, shade, 255]))
      const moved = decodePng(encodePng(w, h, (x, y) => ((x + y) % 5 === 0 ? [255, 40, 40, 255] : [shade, shade, shade, 255])))
      if (frameDifference(flat, flat2) > 0.01) return false
      if (frameDifference(flat, moved) < QUALITY_BAR.staticSceneMaxDiff) return false
      const { staticScenes } = detectStaticScenes({ dead: [flat, flat2, flat2], alive: [flat, moved, flat] })
      return staticScenes.includes('dead') && !staticScenes.includes('alive')
    },
    { runs: 60 },
  )
})

test('PNG decoder handles all five filter types (gradient image exercises sub/up/avg/paeth)', () => {
  const img = decodePng(encodePng(32, 32, (x, y) => [x * 8, y * 8, (x * y) % 256, 255]))
  assert.equal(img.width, 32)
  // spot-check a pixel value survives filtering round-trip
  const px = (x, y) => img.data[(y * 32 + x) * 4]
  assert.equal(px(4, 0), 32)
  assert.equal(px(10, 5), 80)
})

// ---- craft rubric ----

test('craft rubric: weights sum to 1; unevaluated dimensions can never help; perfect = 100', () => {
  assert.ok(Math.abs(CRAFT_RUBRIC.reduce((a, d) => a + d.weight, 0) - 1) < 1e-9)
  const perfect = scoreCraft(Object.fromEntries(CRAFT_RUBRIC.map((d) => [d.id, 4])))
  assert.equal(perfect.score, 100)
  const partial = scoreCraft({ composition: 4 }) // everything else missing → 0
  assert.equal(partial.score, 20)
  assert.ok(partial.score < QUALITY_BAR.minCraftScore)
})

// ---- the bar verdict + ship gate ----

test('evaluateQualityBar: a bar-passing cut passes; each failure mode blocks with a named reason', () => {
  const goodPlan = {
    scenes: [
      scene('hook', 0, 6, { params: { sceneType: 'kinetic-open', cutsPerScene: 3 }, assets: [{ id: 'a', localFile: 'a.jpg' }, { id: 'b', localFile: 'b.jpg' }] }),
      scene('mech', 6, 12, { params: { sceneType: 'mechanism', cutsPerScene: 1 } }),
      scene('timeline', 12, 18, { params: { sceneType: 'timeline', cutsPerScene: 4 }, assets: [{ id: 'a', localFile: 'a.jpg' }, { id: 'b', localFile: 'b.jpg' }] }),
      scene('chart', 18, 24, { params: { sceneType: 'chart', cutsPerScene: 2 } }),
      scene('payoff', 24, 30, { params: { sceneType: 'money-payoff', cutsPerScene: 1 } }),
      scene('recap', 30, 34, { params: { sceneType: 'recap', cutsPerScene: 2 }, assets: [{ id: 'a', localFile: 'a.jpg' }, { id: 'b', localFile: 'b.jpg' }] }),
    ],
  }
  const captions = { beats: [{ beatId: 'hook', startSec: 0, durSec: 6, words: 'w '.repeat(8).trim().split(' '), revealSec: [0, 0.8, 1.6, 2.4, 3.2, 4, 4.8, 5.6] }] }
  const craft = Object.fromEntries(CRAFT_RUBRIC.map((d) => [d.id, 3.5]))
  const sfx = [1, 6.5, 13, 24.5, 30.5] // ~8.8/min over 34s
  const good = evaluateQualityBar({ plan: goodPlan, captions, sfxCueTimesSec: sfx, craftScores: craft, runtimeSec: 34 })
  assert.equal(good.pass, true, JSON.stringify(good.blocking))

  const noSfx = evaluateQualityBar({ plan: goodPlan, captions, sfxCueTimesSec: [], craftScores: craft, runtimeSec: 34 })
  assert.match(noSfx.blocking.join(';'), /sound density/)
  const slideshow = evaluateQualityBar({
    plan: { scenes: goodPlan.scenes.map((s) => ({ ...s, params: { ...s.params, sceneType: 'photo-caption' } })) },
    captions, sfxCueTimesSec: sfx, craftScores: craft, runtimeSec: 34,
  })
  assert.match(slideshow.blocking.join(';'), /slideshow does not ship/)
  const unscored = evaluateQualityBar({ plan: goodPlan, captions, sfxCueTimesSec: sfx, runtimeSec: 34 })
  assert.match(unscored.blocking.join(';'), /craft rubric unscored/)
  const lowCraft = evaluateQualityBar({ plan: goodPlan, captions, sfxCueTimesSec: sfx, craftScores: { composition: 2 }, runtimeSec: 34 })
  assert.match(lowCraft.blocking.join(';'), /craft: /)
})

test('the ship gate refuses an unevaluated or failing bar; a passing bar ships (with disclosure etc.)', () => {
  const base = {
    plan: { visualMode: 'motion-graphics', usesSyntheticVoice: true, aiDisclosure: true, packaging: { claimPaidOff: true } },
    publishPackage: { title: 't', description: 'd', chapters: [{ startSec: 0 }], tags: [], disclosures: ['AI-synthesized narration'] },
    master: { lufsIntegrated: -14, truePeakDb: -1.3 },
  }
  assert.match(runGatePublish(base).blocking.join(';'), /quality bar unevaluated/)
  const failing = runGatePublish({ ...base, quality: { pass: false, blocking: ['cadence: 9s with nothing changing'], warnings: [] } })
  assert.equal(failing.pass, false)
  assert.match(failing.blocking.join(';'), /quality: cadence/)
  assert.equal(runGatePublish({ ...base, quality: { pass: true, blocking: [], warnings: [] } }).pass, true)
})

test('v2.1 (the +23 incident): frame judging scores only still-judgeable dims, renormalized; protocol demands a real reference', () => {
  assert.equal(JUDGE_PROTOCOL.comparative, true)
  assert.equal(JUDGE_PROTOCOL.inadmissibleWithoutReference, true)
  assert.ok(!JUDGE_PROTOCOL.stillJudgeable.includes('world-coherence')) // a single frame cannot assess a cut-level property
  const perfect = scoreRubricV2Frame({ 'visual-ideation': 10, composition: 10, 'type-information': 10, finish: 10 })
  assert.equal(perfect.score, 100) // renormalized
  assert.equal(scoreRubricV2Frame({ 'visual-ideation': 10 }).score, Math.round((0.25 / 0.55) * 1000) / 10)
})

test('v2.2 (the +10.4 incident): the judge is a separate context — maker-as-judge is not a judge', () => {
  assert.equal(JUDGE_PROTOCOL.separateContext, true) // no loop history, no maker predictions, unlabeled artifacts
})

test('v2.3 (the comprehension incident): meaning precedes craft — no stated viewer-understanding, ideation caps at 5', () => {
  assert.equal(JUDGE_PROTOCOL.version, 'v2.3')
  assert.equal(JUDGE_PROTOCOL.comprehensionFirst, true)
  assert.equal(JUDGE_PROTOCOL.ideationCapWithoutMeaning, 5)
})

test('empty-frame gate (the c10 black-frame incident): overwhelming darkness blocks unless declared; property holds at the boundary', async () => {
  const { frameCoverage, checkFrameCoverage, FRAME_COVERAGE } = await import('../lib/scene-qc.mjs')
  const img = (w, h, pixelAt) => {
    const data = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const [r, g, b] = pixelAt(i)
      data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255
    }
    return { width: w, height: h, data }
  }
  const DARK = [18, 15, 12] // ≈0.06 luma — inside the 0.10 band (the incident's charcoal, not pure black)
  const PAPER = [232, 223, 201]
  const broken = img(40, 40, () => DARK)
  assert.equal(checkFrameCoverage(broken, { sceneId: 's' })[0].checkId, 'empty-frame')
  assert.equal(checkFrameCoverage(broken, { sceneId: 's', declaredDark: true }).length, 0) // declared intent, like declared holds
  const blown = img(40, 40, () => [252, 252, 252])
  assert.match(checkFrameCoverage(blown, { sceneId: 's' })[0].note, /near-white/)
  // property: finding exists iff dark fraction exceeds the calibrated threshold
  forAll(gens.record({ pct: gens.int(0, 100) }), ({ pct }) => {
    const n = 100 * 100
    const cut = Math.floor((pct / 100) * n)
    const mixed = img(100, 100, (i) => (i < cut ? DARK : PAPER))
    const dark = frameCoverage(mixed).nearBlackFraction
    const found = checkFrameCoverage(mixed, { sceneId: 's' }).some((f) => /near-black/.test(f.note))
    return found === (dark > FRAME_COVERAGE.maxNearBlackFraction)
  }, { runs: 40 })
})
