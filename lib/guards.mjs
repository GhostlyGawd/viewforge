// guards.mjs — the integrity layer that keeps ViewForge honest.
//
// A self-optimizing content system has two failure modes that look like success:
//   1. Reward hacking — moving the target metric by sacrificing something that
//      actually matters (clickbait that lifts CTR while tanking AVP/likeRatio).
//      This is Goodhart's law: "when a measure becomes a target it ceases to be a
//      good measure." We fight it by pairing every target with guard metrics.
//   2. Overfitting — declaring a win from noise or from the very videos a strategy
//      was tuned on. We fight it by requiring out-of-sample confirmation and a
//      minimum sample size before a strategy is allowed to be "validated".
//
// There is also a set of HARD CONSTRAINTS the pipeline may never violate no matter
// what the metrics say — most importantly, ViewForge never presents a fake human
// (an AI avatar pretending to be a real person) as the on-screen visual.
//
// Zero dependencies. Pure functions, so every rule is unit-testable.

// ---------------------------------------------------------------------------
// Hard constraints — inviolable. The pipeline checks a plan against these BEFORE
// any optimization runs; a hit blocks the plan regardless of predicted metrics.
// ---------------------------------------------------------------------------
export const HARD_CONSTRAINTS = Object.freeze([
  {
    id: 'no-fake-human-visual',
    description:
      'Never use a fake/synthetic human as the on-screen visual — no AI avatar acting like a real person, no deepfake presenter, no lip-synced synthetic face presented as real. Motion graphics, illustration, real footage, screen capture, and disclosed stylized characters are fine.',
    severity: 'block',
  },
  {
    id: 'no-fabricated-metrics',
    description:
      'Never record an analytics number that did not come from a real measurement source. Simulated or projected numbers must be tagged simulated:true and can never promote a strategy.',
    severity: 'block',
  },
  {
    id: 'no-deceptive-clickbait',
    description:
      'The thumbnail/title promise must be paid off by the video. A packaging idea whose claim the content does not deliver is blocked even if it is predicted to raise CTR.',
    severity: 'block',
  },
  {
    id: 'disclose-ai-generation',
    description:
      'Synthetic voice and AI-generated imagery are allowed but must comply with platform disclosure rules; the plan must carry a disclosure flag where required.',
    severity: 'warn',
  },
])

/**
 * Check a production plan against the hard constraints. `plan` is a free-form
 * object describing the intended video; we look at explicit signal fields rather
 * than guessing. Returns { ok, violations[] } where each violation names the
 * constraint and the severity. `ok` is false only if a `block`-severity rule hits.
 */
export function checkHardConstraints(plan = {}) {
  const violations = []
  const flag = (id) => HARD_CONSTRAINTS.find((c) => c.id === id)

  // no-fake-human-visual: a plan declares its visual mode. Anything that renders a
  // synthetic human presented as real is blocked. Stylized/disclosed characters
  // (visualMode: "character" with disclosed:true) are allowed.
  const vm = plan.visualMode
  const synthHuman =
    plan.usesFakeHumanAvatar === true ||
    vm === 'ai-avatar' ||
    vm === 'deepfake-presenter' ||
    (vm === 'synthetic-human' && plan.disclosedAsSynthetic !== true)
  if (synthHuman) violations.push({ ...flag('no-fake-human-visual'), field: 'visualMode' })

  // no-fabricated-metrics: any observation flagged simulated must not be presented
  // as real. (Enforced again at promotion time; this catches it at plan time.)
  if (plan.metricsSource === 'fabricated' || plan.metricsSource === 'guessed') {
    violations.push({ ...flag('no-fabricated-metrics'), field: 'metricsSource' })
  }

  // no-deceptive-clickbait: packaging must be marked as paid off by the content.
  if (plan.packaging && plan.packaging.claimPaidOff === false) {
    violations.push({ ...flag('no-deceptive-clickbait'), field: 'packaging.claimPaidOff' })
  }

  // disclose-ai-generation: warn (not block) if AI media is used without disclosure.
  if ((plan.usesSyntheticVoice || plan.usesGeneratedImagery) && plan.aiDisclosure !== true) {
    violations.push({ ...flag('disclose-ai-generation'), field: 'aiDisclosure' })
  }

  const ok = !violations.some((v) => v.severity === 'block')
  return { ok, violations }
}

// ---------------------------------------------------------------------------
// Promotion gate — anti-overfitting + anti-Goodhart.
// ---------------------------------------------------------------------------

// An *observation* is one measured result of applying a strategy to a video:
//   { videoId, cohort: "train"|"holdout", target: {metric, delta}, guards: [{metric, delta}], simulated?:bool }
// `delta` is the change vs the control/baseline for that video, in the metric's
// native units (AVP/likeRatio are fractions; AVD/sessionTime seconds; CTR fraction).

export const PROMOTION_DEFAULTS = Object.freeze({
  minObservations: 5, // never call n<5 a win
  minHoldoutWins: 2, // at least this many wins must be out-of-sample
  maxGuardDrop: 0.02, // a guard metric may not fall more than this (2pp) on average
  minMeanTargetDelta: 0, // mean target effect must be strictly positive by default
})

/**
 * Decide whether a strategy currently in `testing` has earned `validated`.
 * Returns { promote, confidence, reasons[] }.
 *
 * The bar (all must hold):
 *  - enough observations (anti-noise),
 *  - enough of the wins are on holdout videos the strategy wasn't tuned on
 *    (anti-overfit),
 *  - no simulated observation is counted (anti-fabrication),
 *  - the mean target delta is positive,
 *  - NO guard metric drops more than maxGuardDrop on average (anti-Goodhart).
 *
 * `confidence` is a bounded 0..1 estimate from sample size and out-of-sample
 * agreement — deliberately conservative so the library doesn't over-trust itself.
 */
export function evaluatePromotion(observations = [], opts = {}) {
  const cfg = { ...PROMOTION_DEFAULTS, ...opts }
  const reasons = []

  const real = observations.filter((o) => !o.simulated)
  if (real.length < observations.length) {
    reasons.push(`ignored ${observations.length - real.length} simulated observation(s) — cannot promote on simulated data`)
  }

  if (real.length < cfg.minObservations) {
    return { promote: false, confidence: 0, reasons: [...reasons, `need ${cfg.minObservations} real observations, have ${real.length}`] }
  }

  const targetDeltas = real.map((o) => o.target?.delta ?? 0)
  const meanTarget = mean(targetDeltas)
  if (!(meanTarget > cfg.minMeanTargetDelta)) {
    reasons.push(`mean target delta ${fmt(meanTarget)} is not above ${cfg.minMeanTargetDelta}`)
  }

  const holdoutWins = real.filter((o) => o.cohort === 'holdout' && (o.target?.delta ?? 0) > 0).length
  if (holdoutWins < cfg.minHoldoutWins) {
    reasons.push(`need ${cfg.minHoldoutWins} out-of-sample (holdout) wins, have ${holdoutWins} — guarding against overfit`)
  }

  // Anti-Goodhart: aggregate each guard metric across observations; the worst mean
  // drop must stay within tolerance. A win bought by wrecking a guard is not a win.
  const guardDrops = aggregateGuardDrops(real)
  const breached = guardDrops.filter((g) => g.meanDelta < -cfg.maxGuardDrop)
  for (const g of breached) {
    reasons.push(`guard metric ${g.metric} dropped ${fmt(g.meanDelta)} on average (max allowed -${cfg.maxGuardDrop}) — reward-hacking guard`)
  }

  const promote =
    real.length >= cfg.minObservations &&
    meanTarget > cfg.minMeanTargetDelta &&
    holdoutWins >= cfg.minHoldoutWins &&
    breached.length === 0

  // Conservative confidence: scales with sample size (saturating ~20) and the
  // share of observations that are positive holdout wins.
  const holdoutTotal = real.filter((o) => o.cohort === 'holdout').length || 1
  const sampleFactor = Math.min(1, real.length / 20)
  const agreement = holdoutWins / holdoutTotal
  const confidence = promote ? round(0.5 + 0.5 * sampleFactor * agreement) : 0

  if (promote) reasons.unshift('all promotion criteria met')
  return { promote, confidence, reasons }
}

/**
 * Goodhart spot-check for a single observation — useful at edit/QA time before a
 * video ships, independent of long-run promotion. Flags when the target moved up
 * but a guard moved down past tolerance.
 */
export function detectGoodhart(observation, maxGuardDrop = PROMOTION_DEFAULTS.maxGuardDrop) {
  const targetUp = (observation?.target?.delta ?? 0) > 0
  const sacrificed = (observation?.guards ?? []).filter((g) => (g.delta ?? 0) < -maxGuardDrop)
  return { gamed: targetUp && sacrificed.length > 0, sacrificed }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function aggregateGuardDrops(observations) {
  const byMetric = new Map()
  for (const o of observations) {
    for (const g of o.guards ?? []) {
      if (!byMetric.has(g.metric)) byMetric.set(g.metric, [])
      byMetric.get(g.metric).push(g.delta ?? 0)
    }
  }
  return [...byMetric.entries()].map(([metric, deltas]) => ({ metric, meanDelta: mean(deltas), n: deltas.length }))
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}
function round(x) {
  return Math.round(x * 1000) / 1000
}
function fmt(x) {
  return (x >= 0 ? '+' : '') + round(x)
}
