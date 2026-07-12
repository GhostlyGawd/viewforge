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

import { evaluatePromotion, isAdmissibleEvidence, METRIC_PROVENANCE, EVIDENCE_CLASSES } from './guards.mjs'
import { domainOfMetric, strategyDomain } from './strategy-registry.mjs'

/**
 * Turn a measured A/B result for one video into an observation.
 *   computeObservation({ videoId, cohort, targetMetric, baseline, treatment,
 *                        guards:[{metric, baseline, treatment}], simulated,
 *                        provenance, evidenceClass, topicCluster })
 * `delta` is treatment − baseline in the metric's native units.
 *
 * Provenance (v2 §17) is WHERE the numbers came from: youtube_api | manual |
 * simulated. Only youtube_api evidence is admissible anywhere in the loop; a
 * `simulated` provenance forces the simulated flag, and claiming youtube_api while
 * flagging simulated is a contradiction, rejected loudly.
 */
export function computeObservation({ videoId, cohort = 'train', targetMetric, baseline, treatment, guards = [], simulated = false, provenance, evidenceClass, topicCluster }) {
  if (!videoId) throw new Error('computeObservation: videoId required')
  if (!targetMetric) throw new Error('computeObservation: targetMetric required')
  if (provenance !== undefined && !METRIC_PROVENANCE.includes(provenance)) {
    throw new Error(`computeObservation: unknown provenance "${provenance}" (${METRIC_PROVENANCE.join('|')})`)
  }
  if (evidenceClass !== undefined && !EVIDENCE_CLASSES.includes(evidenceClass)) {
    throw new Error(`computeObservation: unknown evidenceClass "${evidenceClass}" (${EVIDENCE_CLASSES.join('|')})`)
  }
  if (provenance === 'youtube_api' && simulated) {
    throw new Error('computeObservation: provenance youtube_api contradicts simulated:true — pick one')
  }
  return {
    videoId,
    cohort,
    simulated: provenance === 'simulated' ? true : !!simulated,
    ...(provenance !== undefined && { provenance }),
    ...(evidenceClass !== undefined && { evidenceClass }),
    ...(topicCluster !== undefined && { topicCluster }),
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

  // Domain separation (v2 §10): CTR evidence may only advance packaging rules;
  // retention/watch evidence only content rules. Cross-domain observations are
  // excluded BEFORE anything else — one metric never writes the other domain's rules.
  const domain = strategyDomain(strategy)
  const inDomain = []
  for (const o of observations) {
    const metric = o.target?.metric
    if (metric && domainOfMetric(metric) !== domain) {
      reasons.push(`excluded ${metric} observation on ${o.videoId}: ${domainOfMetric(metric)}-domain evidence cannot advance a ${domain}-domain strategy`)
    } else {
      inDomain.push(o)
    }
  }

  const real = inDomain.filter(isAdmissibleEvidence)
  if (inDomain.length && !real.length) {
    return {
      nextStatus: strategy.status,
      confidence: strategy.confidence ?? 0,
      decision: 'insufficient',
      reasons: [...reasons, 'no admissible observations — only real youtube_api measurements can advance a lifecycle (no simulated/manual data)'],
    }
  }
  if (!real.length) {
    return { nextStatus: strategy.status, confidence: strategy.confidence ?? 0, decision: 'no-evidence', reasons: [...reasons, 'no real observations attributed yet'] }
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

/**
 * Jobs-based expiry (v2 §23): a rule backed by observational/comments evidence must
 * not live forever unvalidated — it either earns `validated` within its window or
 * retires. `videosSinceCreated` is how many channel videos shipped since the
 * strategy was created (the caller counts; this stays pure).
 *
 * Returns { strategy, expired, reason } — a NEW object when expired (immutable),
 * the input untouched otherwise. `validated` strategies never expire this way
 * (staleness/decay is `isStale`'s job); strategies without `expiresAfterVideos`
 * never expire this way either.
 */
export function applyExpiry(strategy, { videosSinceCreated } = {}) {
  if (!Number.isInteger(videosSinceCreated) || videosSinceCreated < 0) {
    throw new Error('applyExpiry: videosSinceCreated (integer ≥ 0) required')
  }
  const window = strategy?.expiresAfterVideos
  if (!window || strategy.status === 'validated' || strategy.status === 'retired') {
    return { strategy, expired: false, reason: null }
  }
  if (videosSinceCreated < window) return { strategy, expired: false, reason: null }
  const reason = `expired: ${videosSinceCreated} videos since created without earning validation (window ${window}) — observational rules do not live forever`
  return {
    strategy: { ...strategy, status: 'retired', retiredReason: reason },
    expired: true,
    reason,
  }
}

function num(x) {
  const n = Number(x)
  return Number.isNaN(n) ? 0 : n
}
function round(x) {
  return Math.round(x * 10000) / 10000
}
