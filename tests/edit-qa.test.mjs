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
  const motionPlan = buildMotionPlan(beats, brand)
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
