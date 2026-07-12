// gates.mjs — the v2 gate architecture (Master Doc v2 §11/§25), composed from the
// tested validators that already exist. Three properties, in code:
//
//   1. GATE 0 (the hard integrity constraints) is evaluated at EVERY gate — no
//      stage is exempt from no-fake-human / payoff / disclosure / research-only.
//   2. GATE A sits at packaging/storyboard where rejection costs a prompt, not a
//      render: code checks READINESS (packaging locked + grounded, script structure,
//      narration fits); a human approves the creative.
//   3. GATE B sits before assembly: resolved-timeline invariants, the scene-QC
//      verdict, the mastering numbers, publishable assets. Blocked scenes feed the
//      per-scene re-render loop — never a full re-render.
//
// Every gate returns { gate, pass, blocking, warnings } with named reasons.

import { checkHardConstraints } from './guards.mjs'
import { validateScriptStructure } from './script-model.mjs'
import { validateNarrationSpec } from './voice-spec.mjs'
import { checkClaimGrounding } from './video-idea.mjs'
import { validateResolvedTimeline } from './timing-solver.mjs'
import { validateMaster } from './audio-mix.mjs'
import { validatePlanAssets } from './asset-source.mjs'
import { aggregateFindings } from './scene-qc.mjs'
import { validatePublishPackage } from './distribution.mjs'

/** Gate 0 alone — the hard constraints, callable anywhere. */
export function runGate0(plan = {}) {
  const hc = checkHardConstraints(plan)
  return {
    gate: '0',
    pass: hc.ok,
    blocking: hc.violations.filter((v) => v.severity === 'block').map((v) => `[${v.id}] ${v.description}`),
    warnings: hc.violations.filter((v) => v.severity !== 'block').map((v) => `[${v.id}] ${v.description}`),
  }
}

const merge = (target, r) => {
  target.blocking.push(...r.blocking)
  target.warnings.push(...r.warnings)
}

/**
 * GATE A — human, at packaging/storyboard (cheap to reject). Code validates
 * readiness; the operator approves the creative in the skill.
 *   { plan, packaging: { title, thumbnailConcept, promise, claimPaidOff, claimSource? },
 *     script, narrationSpec }
 */
export function runGateA({ plan = {}, packaging, script, narrationSpec } = {}) {
  const out = { gate: 'A', pass: false, blocking: [], warnings: [] }
  merge(out, runGate0(plan))

  if (!packaging || typeof packaging !== 'object') {
    out.blocking.push('packaging not locked — Gate A approves title/thumbnail/promise BEFORE production spend')
  } else {
    if (!packaging.title || !String(packaging.title).trim()) out.blocking.push('packaging.title missing')
    if (!packaging.thumbnailConcept || !String(packaging.thumbnailConcept).trim()) out.blocking.push('packaging.thumbnailConcept missing')
    if (!packaging.promise || !String(packaging.promise).trim()) out.blocking.push('packaging.promise missing — the one claim the video must deliver on')
    if (packaging.claimPaidOff === false) out.blocking.push('packaging claim is not paid off by the planned content — unpaid-off clickbait stops here')
    const g = checkClaimGrounding(packaging)
    if (!g.grounded) out.blocking.push(g.reason)
  }

  if (script) {
    const sv = validateScriptStructure(script)
    out.blocking.push(...sv.issues.map((i) => `script: ${i}`))
  } else {
    out.blocking.push('no script to review')
  }

  if (narrationSpec) {
    const nv = validateNarrationSpec(narrationSpec)
    out.blocking.push(...nv.issues.map((i) => `narration: ${i}`))
  }

  out.pass = out.blocking.length === 0
  return out
}

/**
 * GATE B — automated, pre-assembly (§25). Blocking scene-QC findings return the
 * scene ids to re-render (per-scene, cached — never the whole video).
 *   { plan, resolvedScenes, transitionOverlapMs?, qcFindings, master, motionPlan, manifest }
 */
export function runGateB({ plan = {}, resolvedScenes, transitionOverlapMs, qcFindings = [], master, motionPlan, manifest } = {}) {
  const out = { gate: 'B', pass: false, blocking: [], warnings: [], rerenderScenes: [] }
  merge(out, runGate0(plan))

  if (resolvedScenes) {
    const tv = validateResolvedTimeline(resolvedScenes, transitionOverlapMs !== undefined ? { transitionOverlapMs } : undefined)
    out.blocking.push(...tv.errors.map((e) => `timeline: ${e}`))
  } else {
    out.blocking.push('no resolved timeline — Gate B only reviews solver output')
  }

  const qc = aggregateFindings(qcFindings)
  out.blocking.push(...qc.blocking.map((b) => `scene-qc[${b.sceneId}/${b.checkId}]: ${b.note}`))
  out.blocking.push(...qc.invalid.map((i) => `scene-qc: invalid finding (${i.reason}) — fail closed`))
  out.warnings.push(...qc.warnings.map((w) => `scene-qc[${w.sceneId}/${w.checkId}]: ${w.note}`))
  out.rerenderScenes = qc.blockingScenes

  if (master) {
    const mv = validateMaster(master)
    out.blocking.push(...mv.issues.map((i) => `master: ${i}`))
    out.warnings.push(...mv.warnings.map((w) => `master: ${w}`))
  } else {
    out.blocking.push('no mastering measurements — the master bus is unverified')
  }

  if (motionPlan && manifest) {
    const pa = validatePlanAssets(motionPlan, manifest)
    out.blocking.push(...pa.errors.map((e) => `assets: ${e}`))
  }

  out.pass = out.blocking.length === 0
  return out
}

/**
 * GATE PUBLISH — the last look before upload: publish package valid (incl. the
 * synthetic-voice disclosure when narration is TTS) + master verified + Gate 0 +
 * THE QUALITY BAR (v0.12.0, operator mandate): nothing ships below the top-1%
 * visual bar. `quality` is evaluateQualityBar's verdict — absent means unevaluated,
 * and unevaluated does not ship.
 *   { plan, publishPackage, master, requireDisclosure, quality }
 */
export function runGatePublish({ plan = {}, publishPackage, master, requireDisclosure, quality } = {}) {
  const out = { gate: 'publish', pass: false, blocking: [], warnings: [] }
  merge(out, runGate0(plan))

  if (!quality) {
    out.blocking.push('quality bar unevaluated — run evaluateQualityBar (cadence, static scenes, grammar variety, sound density, craft rubric); the ship gate refuses unmeasured cuts')
  } else if (!quality.pass) {
    out.blocking.push(...(quality.blocking || []).map((b) => `quality: ${b}`))
  } else {
    out.warnings.push(...(quality.warnings || []).map((w) => `quality: ${w}`))
  }

  const mustDisclose = requireDisclosure ?? plan.usesSyntheticVoice === true
  if (publishPackage) {
    const pv = validatePublishPackage(publishPackage, { requireDisclosure: mustDisclose })
    out.blocking.push(...pv.issues.map((i) => `publish: ${i}`))
  } else {
    out.blocking.push('no publish package')
  }

  if (master) {
    const mv = validateMaster(master)
    out.blocking.push(...mv.issues.map((i) => `master: ${i}`))
    out.warnings.push(...mv.warnings.map((w) => `master: ${w}`))
  }

  out.pass = out.blocking.length === 0
  return out
}
