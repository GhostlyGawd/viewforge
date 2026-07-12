// Phase F of plans/07 — the learning loop as a hypothesis engine (Master Doc v2
// §10/§17/§23): domain separation, provenance admissibility, topic-cluster confound
// guard, comments-class limits, expiry, and Test & Compare experiments.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateStrategy, queryStrategies, strategyDomain, domainOfMetric, METRIC_DOMAINS, KNOWN_METRICS } from '../lib/strategy-registry.mjs'
import { evaluatePromotion, isAdmissibleEvidence } from '../lib/guards.mjs'
import { computeObservation, evaluateStrategyEvidence, applyExpiry } from '../lib/analytics.mjs'
import { buildPackagingExperiment, validatePackagingExperiment, ingestExperimentResult } from '../lib/packaging-experiment.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

const strategy = (over = {}) => ({
  id: 'test-strategy',
  title: 'T',
  category: 'packaging',
  principle: 'p',
  targetMetric: 'CTR',
  source: { kind: 'external', name: 'x', url: 'https://x' },
  status: 'testing',
  ...over,
})

const obs = (over = {}) => ({
  videoId: 'v1',
  cohort: 'holdout',
  simulated: false,
  target: { metric: 'CTR', delta: 0.01 },
  guards: [],
  ...over,
})

// A set of observations that comfortably clears the promotion bar.
const winningSet = (over = {}) => Array.from({ length: 6 }, (_, i) => obs({ videoId: `v${i}`, ...over }))

// ---- F1: domain separation ----

test('property: F1 — evidence from one domain can NEVER advance a strategy in the other', () => {
  forAll(
    gens.record({ metric: gens.pick([...KNOWN_METRICS]), strategyMetric: gens.pick(['CTR', 'AVP']) }),
    ({ metric, strategyMetric }) => {
      const s = strategy({ targetMetric: strategyMetric })
      const observations = winningSet({ target: { metric, delta: 0.01 } })
      const verdict = evaluateStrategyEvidence(s, observations)
      const crossDomain = domainOfMetric(metric) !== strategyDomain(s)
      if (crossDomain) {
        // every observation excluded → no evidence to advance on
        return verdict.decision === 'no-evidence' && verdict.nextStatus === 'testing' && verdict.reasons.some((r) => /cannot advance/.test(r))
      }
      return verdict.decision === 'promote'
    },
    { runs: 200 },
  )
})

test('F1 — schema: a domain contradicting the targetMetric fails validation; consistent passes; CI-guarded', () => {
  assert.equal(validateStrategy(strategy({ domain: 'packaging' })).valid, true)
  const bad = validateStrategy(strategy({ domain: 'content' }))
  assert.equal(bad.valid, false)
  assert.match(bad.errors.join(';'), /contradicts targetMetric/)
  assert.equal(validateStrategy(strategy({ domain: 'thumbnails' })).valid, false)
  // registry query can slice by domain (prompt merging never crosses domains)
  const lib = [strategy({ id: 'a' }), strategy({ id: 'b', targetMetric: 'AVP', category: 'retention' })]
  assert.deepEqual(queryStrategies(lib, { domain: 'packaging' }).map((s) => s.id), ['a'])
  assert.deepEqual(queryStrategies(lib, { domain: 'content' }).map((s) => s.id), ['b'])
})

// ---- F2: provenance admissibility ----

test('property: F2 — only youtube_api provenance is admissible; manual/simulated never promote; legacy unaffected', () => {
  forAll(
    gens.record({ provenance: gens.pick(['youtube_api', 'manual', 'simulated', undefined]), simulated: gens.bool() }),
    ({ provenance, simulated }) => {
      if (provenance === 'youtube_api' && simulated) return true // contradiction — computeObservation refuses (tested below)
      const o = obs({ ...(provenance && { provenance }), simulated: provenance === 'simulated' ? true : simulated })
      const admissible = isAdmissibleEvidence(o)
      const expected = !o.simulated && (provenance === undefined || provenance === 'youtube_api')
      if (admissible !== expected) return false
      const r = evaluatePromotion(Array.from({ length: 6 }, (_, i) => ({ ...o, videoId: `v${i}` })))
      return r.promote === expected
    },
    { runs: 200 },
  )
})

test('F2 — computeObservation validates provenance and refuses contradictions', () => {
  assert.throws(() => computeObservation({ videoId: 'v', targetMetric: 'CTR', baseline: 1, treatment: 2, provenance: 'guessed' }), /unknown provenance/)
  assert.throws(() => computeObservation({ videoId: 'v', targetMetric: 'CTR', baseline: 1, treatment: 2, provenance: 'youtube_api', simulated: true }), /contradicts/)
  const sim = computeObservation({ videoId: 'v', targetMetric: 'CTR', baseline: 1, treatment: 2, provenance: 'simulated' })
  assert.equal(sim.simulated, true) // simulated provenance forces the flag
})

// ---- F3: topic-cluster confound guard ----

test('property: F3 — with clusters logged, single-cluster holdout wins never promote; ≥2 clusters can', () => {
  forAll(
    gens.record({ clusters: gens.pick([['legal-history'], ['legal-history', 'maritime'], ['a', 'b', 'c']]), n: gens.int(6, 10) }),
    ({ clusters, n }) => {
      const observations = Array.from({ length: n }, (_, i) => obs({ videoId: `v${i}`, topicCluster: clusters[i % clusters.length] }))
      const r = evaluatePromotion(observations)
      return clusters.length >= 2 ? r.promote : !r.promote && r.reasons.some((x) => /topic cluster/.test(x))
    },
    { runs: 120 },
  )
})

test('F3 — legacy evidence without clusters is not retroactively blocked', () => {
  assert.equal(evaluatePromotion(winningSet()).promote, true)
})

// ---- F4: comments are direction, not proof ----

feature('Comments-class evidence (v2 §10/§23)', () => {
  scenario('comments move a documented strategy into testing but can never validate it', () => {
    const s = given('a documented strategy', () => strategy({ status: 'documented' }))
    const comments = and('six positive comment-synthesis observations (API-pulled)', () =>
      winningSet({ evidenceClass: 'comments', provenance: 'youtube_api' }),
    )
    const verdict = when('we evaluate', () => evaluateStrategyEvidence(s, comments))
    then('the strategy enters testing, does not promote', () => {
      assert.equal(verdict.nextStatus, 'testing')
      assert.equal(verdict.decision, 'keep-testing')
    })
    and('the same set as experiment-class WOULD promote', () => {
      const exp = winningSet({ evidenceClass: 'experiment', provenance: 'youtube_api' })
      assert.equal(evaluateStrategyEvidence(s, exp).decision, 'promote')
    })
  })
})

// ---- F5: expiry ----

test('property: F5 — an unvalidated strategy expires exactly at its window; validated/window-less never do', () => {
  forAll(
    gens.record({ window: gens.int(1, 20), shipped: gens.int(0, 40), status: gens.pick(['testing', 'documented', 'hypothesis', 'validated']) }),
    ({ window, shipped, status }) => {
      const s = strategy({ status, expiresAfterVideos: window })
      const r = applyExpiry(s, { videosSinceCreated: shipped })
      const shouldExpire = status !== 'validated' && shipped >= window
      if (r.expired !== shouldExpire) return false
      if (shouldExpire && (r.strategy.status !== 'retired' || !/expired/.test(r.strategy.retiredReason))) return false
      if (!shouldExpire && r.strategy !== s) return false // untouched input when not expiring
      // no window ⇒ never expires this way
      return applyExpiry(strategy({ status }), { videosSinceCreated: shipped }).expired === false
    },
    { runs: 300 },
  )
})

// ---- F6: Test & Compare experiments ----

feature('Packaging Test & Compare (v2 §10/§17/§23)', () => {
  const arms = {
    primary: { title: 'The Comma That Cost $40 Million', thumbnailConcept: 'torn tariff page, red comma circled' },
    challenger: { title: 'One Comma. Forty Million Dollars.', thumbnailConcept: 'macro comma over sinking ledger' },
  }
  const exp = () => buildPackagingExperiment({ id: 'exp-1', videoId: 'vid-1', strategyId: 'thumbnail-title-extremity', promise: 'a misplaced comma cost the US $40M', ...arms })

  scenario('both arms must exist, differ, and pay off the same promise', () => {
    then('a well-formed experiment builds and validates', () => {
      const e = exp()
      assert.equal(validatePackagingExperiment(e).valid, true)
      assert.equal(e.status, 'planned')
    })
    and('identical arms, missing promise, or an unpaid-off arm are refused', () => {
      assert.throws(() => buildPackagingExperiment({ id: 'x', videoId: 'v', strategyId: 's', promise: 'p', primary: arms.primary, challenger: arms.primary }), /identical/)
      assert.throws(() => buildPackagingExperiment({ id: 'x', videoId: 'v', strategyId: 's', promise: '', ...arms }), /promise/)
      assert.throws(
        () => buildPackagingExperiment({ id: 'x', videoId: 'v', strategyId: 's', promise: 'p', primary: arms.primary, challenger: { ...arms.challenger, claimPaidOff: false } }),
        /not paid off/,
      )
    })
  })

  scenario('F6 — an API-provenance result yields a holdout, experiment-class observation; anything else is recorded but learns nothing', () => {
    const result = { winner: 'challenger', shareOfWatchTime: { primary: 0.44, challenger: 0.56 }, baseline: 0.041, treatment: 0.052 }
    const api = when('the result comes from the API', () => ingestExperimentResult(exp(), { ...result, provenance: 'youtube_api', topicCluster: 'legal-history' }))
    then('the observation is holdout + experiment-class and attributed to the strategy', () => {
      assert.equal(api.experiment.status, 'completed')
      assert.equal(api.observation.cohort, 'holdout')
      assert.equal(api.observation.evidenceClass, 'experiment')
      assert.equal(api.observation.strategyId, 'thumbnail-title-extremity')
      assert.ok(Math.abs(api.observation.target.delta - 0.011) < 1e-9)
    })
    and('a hand-typed result is recorded but yields NO observation', () => {
      const manual = ingestExperimentResult(exp(), { ...result, provenance: 'manual' })
      assert.equal(manual.experiment.status, 'completed')
      assert.equal(manual.observation, null)
      assert.match(manual.reasons.join(';'), /NOT admissible/)
    })
  })

  scenario('malformed results are rejected loudly', () => {
    then('bad winner and non-summing shares throw', () => {
      assert.throws(() => ingestExperimentResult(exp(), { winner: 'b-side', shareOfWatchTime: { primary: 0.5, challenger: 0.5 }, provenance: 'youtube_api' }), /winner/)
      assert.throws(() => ingestExperimentResult(exp(), { winner: 'primary', shareOfWatchTime: { primary: 0.9, challenger: 0.3 }, provenance: 'youtube_api' }), /sum/)
    })
  })

  scenario('property: F6 — experiment evidence is the fast path: 5 API experiment results promote a strategy', () => {
    then('five distinct-cluster experiment observations clear the gate', () => {
      const observations = Array.from({ length: 5 }, (_, i) => {
        const e = buildPackagingExperiment({ id: `exp-${i}`, videoId: `vid-${i}`, strategyId: 'thumbnail-title-extremity', promise: 'p', ...arms })
        return ingestExperimentResult(e, {
          winner: 'challenger',
          shareOfWatchTime: { primary: 0.45, challenger: 0.55 },
          baseline: 0.04,
          treatment: 0.05,
          provenance: 'youtube_api',
          topicCluster: `cluster-${i % 3}`,
        }).observation
      })
      const s = strategy({ id: 'thumbnail-title-extremity' })
      const verdict = evaluateStrategyEvidence(s, observations)
      assert.equal(verdict.decision, 'promote')
      assert.equal(verdict.nextStatus, 'validated')
    })
  })
})
