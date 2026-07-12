// design-loop.mjs — closed-loop creation (plan 09, the root-cause fix).
//
// The 2026-07-12 diagnosis, operator-confirmed: the system was OPEN-LOOP. Scenes
// were designed blind — code written once, rendered once, judged at the end — while
// every craft that produces excellence works closed-loop: perceive, adjust,
// perceive, dozens of cycles per scene. Gates catch defects; only iteration injects
// design. This module is the loop's tested skeleton: cycle budgets (deep on the
// scenes that carry the video), an immutable iteration record, stop rules, and the
// invariant that we ship the BEST cycle ever rendered — never blindly the last.
//
// Separation of powers, same doctrine as everywhere else in this repo: the MAKER
// patches, the JUDGE scores (against exemplar anchors, blind to effort), the LOOP
// decides when to stop. Zero dependencies.

import { CRAFT_DIMENSION_IDS } from './quality-bar.mjs'

export const LOOP_DEFAULTS = Object.freeze({
  heroCycles: 10, // where human designers actually spend their time
  standardCycles: 4,
  minCycles: 2, // even connective scenes get looked at twice
  plateauEpsilon: 2, // <2 points of improvement across the last two cycles = plateau
  targetScore: 87, // the operator's stated minimum (calibrated scale)
})

// The grammars that carry a video's idea — hero by default.
export const HERO_GRAMMARS = Object.freeze(['kinetic-open', 'mechanism', 'money-payoff', 'chart', 'diagram-build'])

/**
 * Allocate look-adjust cycles per scene: heroes deep, connective tissue lighter.
 * `heroSceneIds` overrides/extends the grammar-derived set. Returns { sceneId: cycles }.
 */
export function allocateCycles(scenes, { heroSceneIds = [], defaults = LOOP_DEFAULTS } = {}) {
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('allocateCycles: scenes required')
  const heroes = new Set(heroSceneIds)
  const out = {}
  for (const s of scenes) {
    const isHero = heroes.has(s.beatId) || HERO_GRAMMARS.includes(s.params?.sceneType)
    out[s.beatId] = Math.max(defaults.minCycles, isHero ? defaults.heroCycles : defaults.standardCycles)
  }
  return out
}

/** A critique must be actionable and grounded: it cites rubric dimensions and says
 *  what was OBSERVED and what to CHANGE. Vibes are not critiques. */
export function validateCritique(critique) {
  const errors = []
  if (!critique || typeof critique !== 'object') return { valid: false, errors: ['not an object'] }
  const dims = Array.isArray(critique.dimensions) ? critique.dimensions : []
  if (dims.length === 0) errors.push('critique must cite ≥1 rubric dimension')
  for (const d of dims) if (!CRAFT_DIMENSION_IDS.includes(d)) errors.push(`unknown rubric dimension "${d}"`)
  if (!critique.observed || !String(critique.observed).trim()) errors.push('critique must state what was OBSERVED in the frame')
  if (!critique.change || !String(critique.change).trim()) errors.push('critique must state the concrete CHANGE to make')
  return { valid: errors.length === 0, errors }
}

/** Open a loop for one scene. */
export function startLoop(sceneId, { cycles, target = LOOP_DEFAULTS.targetScore, plateauEpsilon = LOOP_DEFAULTS.plateauEpsilon } = {}) {
  if (!sceneId) throw new Error('startLoop: sceneId required')
  if (!(Number.isInteger(cycles) && cycles > 0)) throw new Error('startLoop: cycles (positive integer) required — use allocateCycles')
  return Object.freeze({ sceneId, budget: cycles, target, plateauEpsilon, cycles: Object.freeze([]) })
}

/**
 * Record one perceive→adjust→perceive cycle, immutably. Each cycle carries the
 * JUDGE's score of the rendered frame(s), the critique that grounded the patch, and
 * a render key so ANY cycle's artifact is recoverable from the per-scene cache.
 */
export function recordCycle(state, { judgeScore, critique, patchNote, renderKey }) {
  if (!state || !Array.isArray(state.cycles)) throw new Error('recordCycle: state required (startLoop)')
  if (state.cycles.length >= state.budget) throw new Error(`recordCycle: budget exhausted (${state.budget}) — the verdict already stands`)
  if (!(typeof judgeScore === 'number' && judgeScore >= 0 && judgeScore <= 100)) throw new Error('recordCycle: judgeScore 0–100 required — an unscored cycle teaches nothing')
  if (state.cycles.length > 0) {
    // every cycle after the first must be grounded in a critique of the previous render
    const cv = validateCritique(critique)
    if (!cv.valid) throw new Error(`recordCycle: ${cv.errors.join('; ')}`)
  }
  if (!renderKey) throw new Error('recordCycle: renderKey required — best-cycle recovery depends on it')
  const cycle = Object.freeze({ n: state.cycles.length + 1, judgeScore, critique: critique ?? null, patchNote: patchNote ?? null, renderKey })
  return Object.freeze({ ...state, cycles: Object.freeze([...state.cycles, cycle]) })
}

/** The best cycle rendered so far (highest judge score; earliest wins ties — later
 *  identical scores add nothing). */
export function bestCycle(state) {
  let best = null
  for (const c of state?.cycles ?? []) if (!best || c.judgeScore > best.judgeScore) best = c
  return best
}

/**
 * Should the loop stop, and why. Rules, in precedence order:
 *  - 'target'  — best score reached the target: done, ship it.
 *  - 'budget'  — cycles exhausted: ship the best cycle (which may still fail the
 *                ship gate — the loop improves scenes, the gate decides shipping).
 *  - 'plateau' — the last two cycles improved the best score by < epsilon: more
 *                cycles are spending money on taste the maker doesn't have yet.
 * Never stops before minCycles-equivalent (2 recorded cycles) except on 'target'.
 */
export function loopVerdict(state) {
  const cycles = state?.cycles ?? []
  const best = bestCycle(state)
  if (best && best.judgeScore >= state.target) return { done: true, reason: 'target', best, improvedFromFirst: round1(best.judgeScore - cycles[0].judgeScore) }
  if (cycles.length >= state.budget) return { done: true, reason: 'budget', best, improvedFromFirst: best ? round1(best.judgeScore - cycles[0].judgeScore) : 0 }
  if (cycles.length >= Math.max(3, 2)) {
    // best-so-far at each step; plateau = the best hasn't moved ≥ epsilon over the last two cycles
    const bestAt = []
    let running = -Infinity
    for (const c of cycles) {
      running = Math.max(running, c.judgeScore)
      bestAt.push(running)
    }
    const gain = bestAt[bestAt.length - 1] - bestAt[bestAt.length - 3]
    if (gain < state.plateauEpsilon) return { done: true, reason: 'plateau', best, improvedFromFirst: round1(best.judgeScore - cycles[0].judgeScore) }
  }
  return { done: false, reason: null, best, improvedFromFirst: best && cycles.length ? round1(best.judgeScore - cycles[0].judgeScore) : 0 }
}

const round1 = (x) => Math.round(x * 10) / 10
