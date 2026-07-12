import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runEditQa, assembleTimeline } from '../lib/edit-qa.mjs'
import { buildBeatSheet } from '../lib/script-model.mjs'
import { buildMotionPlan } from '../lib/motion-plan.mjs'
import { buildNarrationSpec } from '../lib/voice-spec.mjs'

const brand = {
  name: 'Marginalia',
  visualMode: 'motion-graphics',
  usesFakeHumanPresenter: false,
  palette: { bg: '#14110E', ink: '#EDE6D6', accent: '#C8462C' },
  typography: { display: 'Fraunces', body: 'Inter' },
}

function fixture(targetSeconds = 300) {
  const beats = buildBeatSheet({ targetSeconds })
  const built = buildMotionPlan(beats, brand)
  // a clean modern cut carries visual material — the factory binds imagery since
  // v0.7.0, and an entirely bare cut is now a blocking defect (the 2026-07-12
  // bare-render incident), so the healthy fixture reflects the real pipeline
  const motionPlan = { ...built, scenes: built.scenes.map((s) => ({ ...s, assets: [{ id: `img-${s.beatId}`, localFile: `${s.beatId}.jpg` }] })) }
  // give every beat some narration so coverage is healthy
  const script = { beats: beats.map((b) => ({ ...b, text: 'word '.repeat(Math.max(8, b.wordBudget)).trim() })) }
  const narrationSpec = buildNarrationSpec(script)
  return { beats, motionPlan, narrationSpec }
}

test('assembleTimeline computes duration, scene count, and coverage', () => {
  const { motionPlan, narrationSpec } = fixture(300)
  const t = assembleTimeline(motionPlan, narrationSpec)
  assert.equal(t.durationSec, 300)
  assert.ok(t.sceneCount > 0)
  assert.ok(t.coverage > 0 && t.coverage <= 1)
})

test('runEditQa passes a clean motion-graphics cut', () => {
  const { motionPlan, narrationSpec } = fixture(300)
  const r = runEditQa({ motionPlan, narrationSpec, plan: { metricsSource: 'youtube-analytics' } })
  assert.equal(r.passed, true, JSON.stringify(r.blocking))
  assert.equal(r.blocking.length, 0)
})

test('runEditQa BLOCKS a plan that violates a hard constraint', () => {
  const { motionPlan, narrationSpec } = fixture(120)
  const r = runEditQa({ motionPlan, narrationSpec, plan: { usesFakeHumanAvatar: true } })
  assert.equal(r.passed, false)
  assert.ok(r.blocking.some((b) => b.includes('no-fake-human-visual')))
})

test('runEditQa BLOCKS deceptive packaging even with good visuals', () => {
  const { motionPlan, narrationSpec } = fixture(120)
  const r = runEditQa({ motionPlan, narrationSpec, plan: { packaging: { claimPaidOff: false } } })
  assert.equal(r.passed, false)
  assert.ok(r.blocking.some((b) => b.includes('no-deceptive-clickbait')))
})

test('runEditQa warns on low narration coverage (dead air)', () => {
  const beats = buildBeatSheet({ targetSeconds: 600 })
  const motionPlan = buildMotionPlan(beats, brand)
  const narrationSpec = buildNarrationSpec({ beats: [{ id: 'hook', startSec: 0, endSec: 10, text: 'tiny' }] })
  const r = runEditQa({ motionPlan, narrationSpec })
  assert.ok(r.warnings.some((w) => w.includes('coverage')))
})

// ---------------------------------------------------------------------------
// Assembly-time publishable enforcement (Master Doc v2 §16/§25 Gate 0) — plan 06 Phase E
// ---------------------------------------------------------------------------
test('runEditQa BLOCKS a timeline carrying a research-only asset (enforced at assembly, not by convention)', () => {
  const motionPlan = {
    visualMode: 'motion-graphics',
    fps: 30,
    durationFrames: 900,
    scenes: [
      { beatId: 'hook', startSec: 0, endSec: 10, params: { cutsPerScene: 6 }, assets: ['yt-pull-1'] },
      { beatId: 'payoff', startSec: 10, endSec: 30, params: { cutsPerScene: 4 }, assets: ['pd-photo'] },
    ],
  }
  const manifest = {
    assets: [
      { id: 'yt-pull-1', origin: 'research-only', license: 'unknown', source: 'yt-dlp', sourceUrl: 'https://youtube.com/w', url: 'x', width: 1920, height: 1080 },
      { id: 'pd-photo', license: 'cc0', source: 'loc', sourceUrl: 'https://loc.gov/x', url: 'y', width: 1920, height: 1080 },
    ],
  }
  const narrationSpec = { segments: [{ beatId: 'hook', words: 20, spokenSec: 9 }, { beatId: 'payoff', words: 40, spokenSec: 18 }] }

  const res = runEditQa({ motionPlan, narrationSpec, plan: { packaging: { claimPaidOff: true } }, manifest })
  assert.equal(res.passed, false)
  assert.match(res.blocking.join(';'), /non-publishable asset "yt-pull-1"/)
  assert.match(res.blocking.join(';'), /research-only-never-published/)

  // pull the research asset → the same cut ships
  const cleanPlan = { ...motionPlan, scenes: motionPlan.scenes.map((s) => (s.beatId === 'hook' ? { ...s, assets: [] } : s)) }
  const ok = runEditQa({ motionPlan: cleanPlan, narrationSpec, plan: { packaging: { claimPaidOff: true } }, manifest })
  assert.equal(ok.passed, true)
})

test('a plan cannot talk its way past the manifest scan (computed signal wins over plan claims)', () => {
  const motionPlan = {
    visualMode: 'motion-graphics',
    fps: 30,
    durationFrames: 300,
    scenes: [{ beatId: 'hook', startSec: 0, endSec: 10, params: {}, assets: ['yt-pull-1'] }],
  }
  const manifest = { assets: [{ id: 'yt-pull-1', origin: 'research-only' }] }
  const res = runEditQa({ motionPlan, narrationSpec: { segments: [] }, plan: { usesResearchOnlyAssets: false }, manifest })
  assert.equal(res.passed, false)
  assert.match(res.blocking.join(';'), /research-only-never-published/)
})

// ---------------------------------------------------------------------------
// Visual-material gate (2026-07-12 incident: the bare 47s render) — proxies for
// "engaging" must be paired with a direct is-anything-on-screen check.
// ---------------------------------------------------------------------------
test('a cut where NO scene carries a visual asset is BLOCKED, not warned (the bare-render incident)', () => {
  const motionPlan = {
    visualMode: 'motion-graphics',
    fps: 30,
    durationFrames: 1410,
    // exactly the incident shape: narrated, fast-cut params, zero assets anywhere
    scenes: ['hook', 'body', 'payoff'].map((beatId, i) => ({ beatId, startSec: i * 15, endSec: (i + 1) * 15, params: { cutsPerScene: 6 }, assets: [] })),
  }
  const narrationSpec = { segments: motionPlan.scenes.map((s) => ({ beatId: s.beatId, words: 30, spokenSec: 14 })) }
  const res = runEditQa({ motionPlan, narrationSpec, plan: { packaging: { claimPaidOff: true } } })
  assert.equal(res.passed, false)
  assert.match(res.blocking.join(';'), /no scene carries any visual asset/)

  // binding imagery to even one scene lifts the block; the still-bare scenes warn
  const oneBound = { ...motionPlan, scenes: motionPlan.scenes.map((s, i) => (i === 0 ? { ...s, assets: [{ id: 'a1', localFile: 'a1.jpg' }] } : s)) }
  const ok = runEditQa({ motionPlan: oneBound, narrationSpec, plan: { packaging: { claimPaidOff: true } } })
  assert.equal(ok.passed, true)
  assert.equal(ok.warnings.filter((w) => /no visual asset bound/.test(w)).length, 2)

  // a knowingly-degraded fallback scene warns with its missing list, not a bare-scene warning
  const withFallback = { ...oneBound, scenes: oneBound.scenes.map((s, i) => (i === 2 ? { ...s, assetFallback: { missing: ['chart-1'], placeholder: 'brand-glow' } } : s)) }
  const fb = runEditQa({ motionPlan: withFallback, narrationSpec, plan: { packaging: { claimPaidOff: true } } })
  assert.ok(fb.warnings.some((w) => /ships on the placeholder \(missing: chart-1\)/.test(w)))
})
