// packaging-experiment.mjs — YouTube thumbnail/title Test & Compare as a first-class
// object (Master Doc v2 §10/§17/§23).
//
// Packaging is decided BEFORE the script (packaging-first), and the only true A/B
// available on YouTube is the native Test & Compare — everything else is
// observational. An experiment pits a primary against a challenger that must pay off
// the SAME promise (Gate 0's packaging-payoff applies to every arm — an experiment is
// never a licence for one dishonest arm). Results ingest as EXPERIMENT-class,
// HOLDOUT-cohort observations — the fast path through the promotion gate, because a
// platform-split test is out-of-sample by construction — and only from youtube_api
// provenance; anything else is recorded but advances nothing.
//
// Zero dependencies beyond analytics (which builds the observation).

import { computeObservation } from './analytics.mjs'

export const EXPERIMENT_TYPE = 'thumbnail_test_and_compare'
export const EXPERIMENT_ARMS = Object.freeze(['primary', 'challenger'])

/** One arm: { title, thumbnailConcept } — the §13 packaging pair. */
function validateArm(arm, name, errors) {
  if (!arm || typeof arm !== 'object') {
    errors.push(`${name} arm missing`)
    return
  }
  if (!arm.title || !String(arm.title).trim()) errors.push(`${name}.title required`)
  if (!arm.thumbnailConcept || !String(arm.thumbnailConcept).trim()) errors.push(`${name}.thumbnailConcept required`)
  if (arm.claimPaidOff === false) errors.push(`${name}: claim not paid off — an experiment arm is never a licence for dishonest packaging`)
}

/**
 * Build a Test & Compare experiment record. Both arms serve the same locked
 * `promise`; they must actually differ somewhere or there is nothing to learn.
 */
export function buildPackagingExperiment({ id, videoId, strategyId, promise, primary, challenger } = {}) {
  const errors = []
  if (!id) errors.push('id required')
  if (!videoId) errors.push('videoId required')
  if (!strategyId) errors.push('strategyId required — an experiment must name the strategy it tests')
  if (!promise || !String(promise).trim()) errors.push('promise required — both arms pay off the same locked promise')
  validateArm(primary, 'primary', errors)
  validateArm(challenger, 'challenger', errors)
  if (primary && challenger && primary.title === challenger.title && primary.thumbnailConcept === challenger.thumbnailConcept) {
    errors.push('primary and challenger are identical — nothing to learn')
  }
  if (errors.length) throw new Error(`buildPackagingExperiment: ${errors.join('; ')}`)
  return {
    id,
    type: EXPERIMENT_TYPE,
    videoId,
    strategyId,
    promise,
    arms: { primary: { ...primary }, challenger: { ...challenger } },
    status: 'planned',
    result: null,
  }
}

/** Validate an experiment record (e.g. re-loaded from state). Returns { valid, errors }. */
export function validatePackagingExperiment(exp) {
  const errors = []
  if (!exp || typeof exp !== 'object') return { valid: false, errors: ['not an object'] }
  if (exp.type !== EXPERIMENT_TYPE) errors.push(`type must be ${EXPERIMENT_TYPE}`)
  if (!exp.id) errors.push('id required')
  if (!exp.videoId) errors.push('videoId required')
  if (!exp.strategyId) errors.push('strategyId required')
  if (!exp.promise) errors.push('promise required')
  validateArm(exp.arms?.primary, 'primary', errors)
  validateArm(exp.arms?.challenger, 'challenger', errors)
  if (!['planned', 'running', 'completed'].includes(exp.status)) errors.push(`unknown status ${exp.status}`)
  return { valid: errors.length === 0, errors }
}

/**
 * Ingest a finished Test & Compare result. Returns { experiment, observation,
 * reasons } — the completed experiment record (immutably updated) plus the
 * experiment-class, holdout-cohort observation for the strategy under test…
 * UNLESS the numbers didn't come from the API: then `observation` is null and the
 * reasons say why. Fabricated or hand-typed results are recorded, never learned from.
 *
 * `shareOfWatchTime` = { primary, challenger }, fractions summing to ~1 (YouTube's
 * Test & Compare reports watch-time share per arm).
 */
export function ingestExperimentResult(exp, { winner, shareOfWatchTime, targetMetric = 'CTR', baseline, treatment, guards = [], provenance, topicCluster } = {}) {
  const v = validatePackagingExperiment(exp)
  if (!v.valid) throw new Error(`ingestExperimentResult: invalid experiment: ${v.errors.join('; ')}`)
  if (!EXPERIMENT_ARMS.includes(winner)) throw new Error(`ingestExperimentResult: winner must be one of ${EXPERIMENT_ARMS.join('|')}`)

  const shares = shareOfWatchTime || {}
  for (const arm of EXPERIMENT_ARMS) {
    if (typeof shares[arm] !== 'number' || shares[arm] < 0 || shares[arm] > 1) {
      throw new Error(`ingestExperimentResult: shareOfWatchTime.${arm} must be a fraction in [0,1]`)
    }
  }
  const total = shares.primary + shares.challenger
  if (Math.abs(total - 1) > 0.02) throw new Error(`ingestExperimentResult: watch-time shares sum to ${total.toFixed(3)}, expected ~1`)

  const experiment = {
    ...exp,
    status: 'completed',
    result: { winner, shareOfWatchTime: { ...shares }, provenance: provenance ?? 'unstated' },
  }

  if (provenance !== 'youtube_api') {
    return {
      experiment,
      observation: null,
      reasons: [`result recorded but NOT admissible as evidence: provenance "${provenance ?? 'unstated'}" is not youtube_api — the loop only learns from real API measurements`],
    }
  }

  const observation = {
    ...computeObservation({
      videoId: exp.videoId,
      // A platform-split Test & Compare is out-of-sample by construction: the
      // challenger ran on audience the rule never shaped. Experiments are the
      // fast path through the promotion gate (§23).
      cohort: 'holdout',
      targetMetric,
      baseline,
      treatment,
      guards,
      provenance,
      evidenceClass: 'experiment',
      ...(topicCluster !== undefined && { topicCluster }),
    }),
    strategyId: exp.strategyId,
    experimentId: exp.id,
  }
  return { experiment, observation, reasons: ['experiment result admissible — holdout, experiment-class evidence'] }
}
