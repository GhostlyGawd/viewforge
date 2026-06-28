// analytics.mjs — the analytics department's engine. This is what CLOSES THE LOOP.
//
// Departments 1-7 produce a video; analytics is what makes the system *learn* from it.
// It ingests real measured metrics, turns them into observations, attributes them to
// the strategy/experiment that produced them, runs the promotion gate, and advances a
// strategy along its lifecycle (documented/hypothesis → testing → validated → retired).
//
// The integrity rules from guards.mjs are load-bearing here: a strategy only graduates
// to `validated` on enough OUT-OF-SAMPLE wins with guard metrics intact, and NEVER on
// simulated data. That's the difference between learning and fooling yourself.
//
// Depends only on guards.mjs (and is otherwise zero-dep).

import { evaluatePromotion } from './guards.mjs'

/**
 * Turn a measured A/B result for one video into an observation.
 *   computeObservation({ videoId, cohort, targetMetric, baseline, treatment,
 *                        guards:[{metric, baseline, treatment}], simulated })
 * `delta` is treatment − baseline in the metric's native units.
 */
export function computeObservation({ videoId, cohort = 'train', targetMetric, baseline, treatment, guards = [], simulated = false }) {
  if (!videoId) throw new Error('computeObservation: videoId required')
  if (!targetMetric) throw new Error('computeObservation: targetMetric required')
  return {
    videoId,
    cohort,
    simulated: !!simulated,
    target: { metric: targetMetric, delta: round(num(treatment) - num(baseline)) },
    guards: guards.map((g) => ({ metric: g.metric, delta: round(num(g.treatment) - num(g.baseline)) })),
  }
}

/** Keep only the observations that belong to a given strategy's target metric (a
 * simple attribution; an experiment id can be threaded through `observation.strategyId`
 * for stricter attribution). */
export function attributeToStrategy(observations, strategy) {
  return observations.filter((o) => (o.strategyId ? o.strategyId === strategy.id : o.target?.metric === strategy.targetMetric))
}

/**
 * Given a strategy and its attributed observations, decide the next lifecycle state.
 * Returns { nextStatus, confidence, decision, reasons }.
 *
 *  - any REAL observation moves a `documented`/`hypothesis` strategy into `testing`,
 *  - the promotion gate (guards.evaluatePromotion) decides `testing → validated`,
 *  - simulated-only evidence never advances anything (decision: 'insufficient').
 */
export function evaluateStrategyEvidence(strategy, observations, opts = {}) {
  const reasons = []
  const real = observations.filter((o) => !o.simulated)
  if (observations.length && !real.length) {
    return { nextStatus: strategy.status, confidence: strategy.confidence ?? 0, decision: 'insufficient', reasons: ['all observations are simulated — cannot advance lifecycle on simulated data'] }
  }
  if (!real.length) {
    return { nextStatus: strategy.status, confidence: strategy.confidence ?? 0, decision: 'no-evidence', reasons: ['no real observations attributed yet'] }
  }

  const promo = evaluatePromotion(real, opts)
  if (promo.promote) {
    return { nextStatus: 'validated', confidence: promo.confidence, decision: 'promote', reasons: promo.reasons }
  }

  // Real evidence exists but isn't enough to validate → strategy is (or becomes) testing.
  const moved = ['documented', 'hypothesis'].includes(strategy.status)
  reasons.push(moved ? `entering testing — ${real.length} real observation(s) so far` : 'still testing — promotion bar not yet met')
  reasons.push(...promo.reasons)
  return { nextStatus: 'testing', confidence: Math.min(strategy.confidence ?? 0.5, 0.6), decision: 'keep-testing', reasons }
}

/**
 * Apply evidence to a strategy IMMUTABLY: returns a new strategy object with the
 * updated status/confidence, the observations appended to `evidence`, and a refreshed
 * `lastReviewedUtc`. Never mutates the input. `now` is injectable for tests.
 */
export function applyEvidence(strategy, observations, opts = {}, now = () => new Date().toISOString()) {
  const verdict = evaluateStrategyEvidence(strategy, observations, opts)
  return {
    strategy: {
      ...strategy,
      status: verdict.nextStatus,
      confidence: verdict.confidence,
      evidence: [...(strategy.evidence || []), ...observations],
      lastReviewedUtc: now().slice(0, 10),
    },
    verdict,
  }
}

/** Retire a strategy whose last review is older than the horizon (platform drift). */
export function isStale(strategy, asOfUtc, horizonDays = 365) {
  if (!strategy.lastReviewedUtc) return false
  const last = Date.parse(strategy.lastReviewedUtc + 'T00:00:00Z')
  const asOf = Date.parse(asOfUtc + 'T00:00:00Z')
  return asOf - last > horizonDays * 86400000
}

function num(x) {
  const n = Number(x)
  return Number.isNaN(n) ? 0 : n
}
function round(x) {
  return Math.round(x * 10000) / 10000
}
