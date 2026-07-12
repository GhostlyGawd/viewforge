// edit-qa.mjs — the edit department's deterministic QA gate.
//
// The last check before a video is allowed to ship. It assembles the final timeline
// from the motion plan + narration spec and runs the quality + integrity gates:
//   - "no dull moments": no stretch of timeline without scripted content or a visual
//     beat longer than the dull-gap threshold,
//   - coverage: narration roughly spans the runtime (no long silent dead air),
//   - the HARD CONSTRAINTS (no fake human, no fabricated metrics, claim paid off) via
//     guards.checkHardConstraints — a block here stops the ship, no matter the score.
//
// Zero dependencies beyond the guards + asset-source modules.

import { checkHardConstraints } from './guards.mjs'
import { isPublishable } from './asset-source.mjs'

/**
 * Assemble a final-cut summary from the motion plan + narration spec.
 * Returns { durationSec, scenes, narratedSec, coverage }.
 */
export function assembleTimeline(motionPlan, narrationSpec) {
  if (!motionPlan || !Array.isArray(motionPlan.scenes)) throw new Error('assembleTimeline: motionPlan required')
  const fps = motionPlan.fps || 30
  const durationSec = Math.round((motionPlan.durationFrames || 0) / fps)
  const narratedSec = (narrationSpec?.segments || []).reduce((a, s) => a + (s.spokenSec || 0), 0)
  return {
    durationSec,
    sceneCount: motionPlan.scenes.length,
    narratedSec,
    coverage: durationSec > 0 ? Math.min(1, narratedSec / durationSec) : 0,
  }
}

/**
 * Run the full edit QA gate. Returns { passed, blocking[], warnings[], timeline }.
 * `plan` is the production plan (visualMode, packaging, metricsSource, etc.) checked
 * against the hard constraints. `passed` is false if any hard block hits OR any
 * blocking QA issue is found.
 */
export function runEditQa({ motionPlan, narrationSpec, plan = {}, manifest = null }, { maxDullGapSec = 30, minCoverage = 0.5 } = {}) {
  const blocking = []
  const warnings = []

  // 0. Assembly-time publishable enforcement (Master Doc v2 §16): scan every asset
  // the timeline actually carries; research-only material blocks the ship in code,
  // not by convention. Feeds the hard-constraint signal below.
  const researchOnlyUses = []
  if (manifest) {
    const byId = new Map((manifest.assets || []).map((a) => [a.id, a]))
    for (const scene of motionPlan?.scenes || []) {
      for (const a of scene.assets || []) {
        const id = typeof a === 'string' ? a : a?.id
        const rec = byId.get(id)
        if (rec && !isPublishable(rec)) {
          researchOnlyUses.push({ beatId: scene.beatId, id })
          blocking.push(`scene "${scene.beatId}" carries non-publishable asset "${id}" (${rec.origin ?? 'publishable:false'}) — pull it before ship`)
        }
      }
    }
  }

  // 1. Hard constraints — the non-negotiables (incl. no fake human). The manifest
  // scan's finding must win over whatever the plan claims about itself.
  const hc = checkHardConstraints({
    visualMode: motionPlan?.visualMode,
    ...plan,
    usesResearchOnlyAssets: plan.usesResearchOnlyAssets === true || researchOnlyUses.length > 0,
  })
  for (const v of hc.violations) (v.severity === 'block' ? blocking : warnings).push(`[${v.id}] ${v.description}`)

  // 2. No dull moments — scan the narration coverage per scene.
  const timeline = assembleTimeline(motionPlan, narrationSpec)
  const segByBeat = new Map((narrationSpec?.segments || []).map((s) => [s.beatId, s]))
  for (const scene of motionPlan?.scenes || []) {
    const dur = (scene.endSec ?? scene.startSec) - scene.startSec
    const seg = segByBeat.get(scene.beatId)
    const hasNarration = seg && seg.words > 0
    const hasFastCuts = (scene.params?.cutsPerScene ?? 0) >= 3
    if (dur > maxDullGapSec && !hasNarration && !hasFastCuts) {
      warnings.push(`scene "${scene.beatId}" is ${dur}s with no narration and slow cuts — potential dull moment`)
    }
  }

  // 3. Coverage — narration shouldn't leave the video mostly silent.
  if (timeline.coverage < minCoverage) {
    warnings.push(`narration coverage is only ${Math.round(timeline.coverage * 100)}% of runtime (min ${Math.round(minCoverage * 100)}%) — check for dead air`)
  }

  return { passed: blocking.length === 0, blocking, warnings, timeline }
}
