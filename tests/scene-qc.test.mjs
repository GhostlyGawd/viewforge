// Phase G of plans/07 — scene QC harness + gate composition (Master Doc v2 §11/§25).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stillPlan, contrastRatio, checkTokenContrast, expectedCaptionAt, aggregateFindings, QC_CHECKS, STILL_POSITIONS } from '../lib/scene-qc.mjs'
import { runGate0, runGateA, runGateB, runGatePublish } from '../lib/gates.mjs'
import { solveTimeline } from '../lib/timing-solver.mjs'
import { weightedRevealTimes } from '../lib/caption-timing.mjs'
import { buildBeatSheet } from '../lib/script-model.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

// ---- G1: still plan ----

test('property: G1 — exactly start/mid/end per resolved scene, every still inside its scene', () => {
  forAll(
    (rng) => {
      const n = gens.int(1, 8)(rng)
      const scenes = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, voMs: gens.int(1000, 15000)(rng) }))
      return solveTimeline(scenes).scenes
    },
    (resolved) => {
      const stills = stillPlan(resolved, { fps: 30 })
      if (stills.length !== resolved.length * 3) return false
      for (const s of resolved) {
        const mine = stills.filter((x) => x.sceneId === s.id)
        if (mine.map((x) => x.position).join(',') !== STILL_POSITIONS.join(',')) return false
        for (const x of mine) {
          if (x.atMs < s.resolvedStartMs || x.atMs > s.resolvedStartMs + s.resolvedDurationMs) return false
          if (x.frame !== Math.round((x.atMs / 1000) * 30)) return false
        }
      }
      return true
    },
    { runs: 200 },
  )
})

test('stillPlan refuses unresolved scenes (QC never reviews guessed timing)', () => {
  assert.throws(() => stillPlan([{ id: 'a', startSec: 0, endSec: 5 }]), /not resolved/)
})

// ---- G2: contrast ----

test('property: G2 — contrast ratio: symmetric, ≥1, black/white = 21, identical = 1', () => {
  forAll(
    (rng) => {
      const hex = () => '#' + Array.from({ length: 6 }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('')
      return { a: hex(), b: hex() }
    },
    ({ a, b }) => {
      const r = contrastRatio(a, b)
      return r >= 1 - 1e-9 && r <= 21 + 1e-9 && Math.abs(contrastRatio(b, a) - r) < 1e-9 && Math.abs(contrastRatio(a, a) - 1) < 1e-9
    },
    { runs: 300 },
  )
})

feature('Token contrast gate (WCAG, code not vibes)', () => {
  scenario('black on white passes; grey-on-grey blocks; mid-contrast warns', () => {
    then('the numeric thresholds hold', () => {
      assert.equal(Math.round(contrastRatio('#000', '#fff')), 21)
      assert.deepEqual(checkTokenContrast({ bg: '#0B0B0B', ink: '#EDE6D6', accent: '#C8462C' }).filter((f) => f.severity === 'block'), [])
      const block = checkTokenContrast({ bg: '#777777', ink: '#888888' })
      assert.equal(block[0].severity, 'block')
      const warn = checkTokenContrast({ bg: '#0B0B0B', ink: '#EDE6D6', accent: '#a04a2e' }) // 3.29:1 — readable at display size, borderline small
      assert.ok(warn.some((f) => f.severity === 'warn' && /accent/.test(f.note)))
      const dim = checkTokenContrast({ bg: '#0B0B0B', ink: '#EDE6D6', accent: '#8a3a24' }) // 2.54:1 — below the large-text floor
      assert.ok(dim.some((f) => f.severity === 'block' && /accent/.test(f.note)))
    })
  })
})

// ---- G3: caption spot-check ----

test('property: G3 — expectedCaptionAt returns exactly the word audible at the still timestamp', () => {
  forAll(
    (rng) => {
      const words = Array.from({ length: gens.int(3, 15)(rng) }, (_, i) => 'w' + i)
      const durSec = gens.float(2, 12)(rng)
      const startSec = gens.float(0, 40)(rng)
      return { beat: { beatId: 'b', startSec, durSec, words, revealSec: weightedRevealTimes(words, durSec) }, pick: gens.int(0, words.length - 1)(rng) }
    },
    ({ beat, pick }) => {
      // probe just after word `pick` reveals (and before the next word)
      const t = beat.revealSec[pick]
      const next = beat.revealSec[pick + 1] ?? beat.durSec
      const probeSec = beat.startSec + t + Math.min(0.001, (next - t) / 2)
      const hit = expectedCaptionAt([beat], probeSec * 1000)
      if (!hit || hit.wordIndex !== pick || hit.word !== beat.words[pick]) return false
      // outside any beat → null
      return expectedCaptionAt([beat], (beat.startSec + beat.durSec + 1) * 1000) === null
    },
    { runs: 250 },
  )
})

// ---- G4: findings aggregation ----

test('property: G4 — blocking findings produce a deduped re-render list; unknown checks fail closed', () => {
  forAll(
    (rng) => {
      const sceneIds = ['hook', 'body', 'cta']
      const n = gens.int(0, 10)(rng)
      const findings = Array.from({ length: n }, () => ({
        sceneId: gens.pick(sceneIds)(rng),
        checkId: gens.pick(['text-overflow', 'caption-sync', 'brand-tokens', 'artifact', 'made-up-check'])(rng),
      }))
      return findings
    },
    (findings) => {
      const r = aggregateFindings(findings)
      const hasUnknown = findings.some((f) => f.checkId === 'made-up-check')
      const blockIds = new Set(QC_CHECKS.filter((c) => c.severity === 'block').map((c) => c.id))
      const expectBlockingScenes = [...new Set(findings.filter((f) => blockIds.has(f.checkId)).map((f) => f.sceneId))].sort()
      if (JSON.stringify(r.blockingScenes) !== JSON.stringify(expectBlockingScenes)) return false
      if (hasUnknown && r.pass) return false // fail closed
      if (!hasUnknown && expectBlockingScenes.length === 0 && !r.pass) return false
      return true
    },
    { runs: 250 },
  )
})

test('G4 — an explicit severity may escalate a warn-check but never downgrade a binary block-check', () => {
  const esc = aggregateFindings([{ sceneId: 'a', checkId: 'brand-tokens', severity: 'block', note: 'wrong font everywhere' }])
  assert.deepEqual(esc.blockingScenes, ['a'])
  const down = aggregateFindings([{ sceneId: 'a', checkId: 'text-overflow', severity: 'warn', note: 'tiny crop' }])
  assert.deepEqual(down.blockingScenes, ['a']) // still blocking
})

test('G4 — graded checks honor the code-defined band: a warn-band contrast finding stays a warn (2026-07-12 incident)', () => {
  // checkTokenContrast emits the severity from its numeric bands; the aggregator
  // must not re-escalate a warn-band ratio into a blocking re-render.
  const warnBand = checkTokenContrast({ bg: '#0B0B0B', ink: '#EDE6D6', accent: '#a04a2e' }).map((f) => ({ ...f, sceneId: 'hero' }))
  assert.ok(warnBand.length > 0 && warnBand.every((f) => f.severity === 'warn'))
  const r = aggregateFindings(warnBand)
  assert.equal(r.pass, true)
  assert.deepEqual(r.blockingScenes, [])
  assert.equal(r.warnings.length, warnBand.length)
  // …while a block-band ratio and a severity-less contrast finding both still block
  const blockBand = checkTokenContrast({ bg: '#777777', ink: '#888888' }).map((f) => ({ ...f, sceneId: 'hero' }))
  assert.deepEqual(aggregateFindings(blockBand).blockingScenes, ['hero'])
  assert.deepEqual(aggregateFindings([{ sceneId: 'hero', checkId: 'contrast', note: 'unreadable' }]).blockingScenes, ['hero'])
})

// ---- G5: the gates ----

feature('Gate composition (v2 §11/§25)', () => {
  const goodPackaging = { title: 'The Comma That Cost Forty Million Dollars', thumbnailConcept: 'torn page, red comma', promise: 'a comma cost $40M', claimPaidOff: true, claimSource: 'https://loc.gov/tariff-1872' }
  const goodScript = () => ({
    targetSeconds: 60,
    beats: buildBeatSheet({ targetSeconds: 60 }).map((b) => ({ id: b.id, startSec: b.startSec, endSec: b.endSec, text: 'words '.repeat(8).trim() })),
  })
  const cleanPlan = { visualMode: 'motion-graphics', metricsSource: 'youtube-analytics', packaging: { claimPaidOff: true } }

  scenario('Gate A passes locked, grounded packaging with a valid script — and names every miss', () => {
    const pass = when('everything is ready', () => runGateA({ plan: cleanPlan, packaging: goodPackaging, script: goodScript() }))
    then('it passes', () => assert.equal(pass.pass, true))
    and('missing promise, ungrounded claim, and no script each block with a named reason', () => {
      const r1 = runGateA({ plan: cleanPlan, packaging: { ...goodPackaging, promise: '' }, script: goodScript() })
      assert.match(r1.blocking.join(';'), /promise missing/)
      const r2 = runGateA({ plan: cleanPlan, packaging: { ...goodPackaging, claimSource: '' }, script: goodScript() })
      assert.match(r2.blocking.join(';'), /claimSource/)
      const r3 = runGateA({ plan: cleanPlan, packaging: goodPackaging })
      assert.match(r3.blocking.join(';'), /no script/)
    })
  })

  scenario('Gate 0 violations block at EVERY gate', () => {
    const dirty = { ...cleanPlan, visualMode: 'ai-avatar' }
    then('A, B, and publish all refuse a fake-human plan', () => {
      assert.equal(runGateA({ plan: dirty, packaging: goodPackaging, script: goodScript() }).pass, false)
      assert.equal(runGateB({ plan: dirty, resolvedScenes: solveTimeline([{ id: 'a', voMs: 3000 }]).scenes, master: { lufsIntegrated: -14, truePeakDb: -1.5 } }).pass, false)
      assert.equal(runGatePublish({ plan: dirty, publishPackage: { title: 't', description: 'd' } }).pass, false)
    })
  })

  scenario('Gate B: QC blocking findings fail the gate and name the scenes to re-render', () => {
    const resolved = given('a resolved 3-scene timeline', () => solveTimeline([{ id: 'hook', voMs: 3000 }, { id: 'body', voMs: 5000 }, { id: 'cta', voMs: 2000 }]).scenes)
    const r = when('the VLM reports a caption desync on body and a brand drift on cta', () =>
      runGateB({
        plan: cleanPlan,
        resolvedScenes: resolved,
        qcFindings: [
          { sceneId: 'body', checkId: 'caption-sync', note: 'shows "million" while audio says "forty"' },
          { sceneId: 'cta', checkId: 'brand-tokens', note: 'accent slightly off' },
        ],
        master: { lufsIntegrated: -14.2, truePeakDb: -1.3 },
      }),
    )
    then('the gate fails with exactly [body] to re-render; the brand drift stays a warning', () => {
      assert.equal(r.pass, false)
      assert.deepEqual(r.rerenderScenes, ['body'])
      assert.ok(r.warnings.some((w) => /brand-tokens/.test(w)))
    })
    and('with clean findings and a verified master the same gate passes', () => {
      const ok = runGateB({ plan: cleanPlan, resolvedScenes: resolved, qcFindings: [], master: { lufsIntegrated: -14.2, truePeakDb: -1.3 } })
      assert.equal(ok.pass, true)
    })
    and('an unverified master blocks', () => {
      const r2 = runGateB({ plan: cleanPlan, resolvedScenes: resolved, qcFindings: [], master: null })
      assert.match(r2.blocking.join(';'), /unverified/)
    })
  })

  scenario('Gate publish: a synthetic voice without disclosure never ships', () => {
    const pkg = { title: 't', description: 'd', chapters: [{ startSec: 0, title: 'Intro' }], tags: [], disclosures: [] }
    const passingBar = { pass: true, blocking: [], warnings: [] } // evaluateQualityBar verdict shape
    const r = when('the plan uses TTS but the package lacks the disclosure', () =>
      runGatePublish({ plan: { ...cleanPlan, usesSyntheticVoice: true, aiDisclosure: true }, publishPackage: pkg, master: { lufsIntegrated: -14, truePeakDb: -1.2 }, quality: passingBar }),
    )
    then('publish blocks on the disclosure', () => {
      assert.equal(r.pass, false)
      assert.match(r.blocking.join(';'), /disclosure/)
    })
    and('adding the disclosure ships it', () => {
      const ok = runGatePublish({
        plan: { ...cleanPlan, usesSyntheticVoice: true, aiDisclosure: true },
        publishPackage: { ...pkg, disclosures: ['Narration is an AI-synthesized voice.'] },
        master: { lufsIntegrated: -14, truePeakDb: -1.2 },
        quality: passingBar,
      })
      assert.equal(ok.pass, true)
    })
    and('v0.12.0: WITHOUT a quality-bar verdict the same cut refuses to ship', () => {
      const noBar = runGatePublish({
        plan: { ...cleanPlan, usesSyntheticVoice: true, aiDisclosure: true },
        publishPackage: { ...pkg, disclosures: ['Narration is an AI-synthesized voice.'] },
        master: { lufsIntegrated: -14, truePeakDb: -1.2 },
      })
      assert.equal(noBar.pass, false)
      assert.match(noBar.blocking.join(';'), /quality bar unevaluated/)
    })
  })
})
