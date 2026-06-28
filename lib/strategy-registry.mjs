// strategy-registry.mjs — load, validate, and query the ViewForge strategy library.
//
// A *strategy* is one research-backed, source-cited, testable claim about how to
// make a YouTube channel succeed (e.g. "win retention in the first minute"). Each
// strategy is a JSON file under strategy-library/strategies/. This module is the
// single source of truth for the schema and the lifecycle — the engine, the tools,
// and the tests all go through here, so a malformed or unsourced strategy can never
// silently enter the library.
//
// Zero dependencies (pure Node) so it runs in the Workflow sandbox and in CI.

import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Lifecycle — a strategy climbs this ladder ONLY by earning it (see guards.mjs).
// ---------------------------------------------------------------------------
// documented : credibly sourced (a memo, a study, a creator teardown) but not yet
//              tested inside ViewForge. The starting state for the MrBeast seeds.
// hypothesis : a NEW idea ViewForge generated itself; no external source yet.
// testing    : currently being A/B'd on real videos; accumulating observations.
// validated  : passed the promotion bar — enough out-of-sample wins, guard metrics
//              intact (anti-Goodhart), effect above noise. The only state the
//              pipeline is allowed to lean on by default.
// retired    : disproven, or decayed past its review horizon (the platform moved).
export const STRATEGY_STATUS = Object.freeze([
  'documented',
  'hypothesis',
  'testing',
  'validated',
  'retired',
])

// The metrics ViewForge optimizes. `targetMetric` is what a strategy tries to move;
// `guardMetrics` are the things it is forbidden from sacrificing to do so.
export const KNOWN_METRICS = Object.freeze([
  'CTR', // click-through rate (thumbnail/title)
  'AVD', // average view duration (seconds)
  'AVP', // average view percentage (0..1)
  'retention_30s', // % still watching at 30s
  'retention_50pct', // % reaching the halfway mark
  'likeRatio', // likes / views — a satisfaction guard
  'commentRate',
  'subsPerView',
  'returnViewerRate',
  'sessionTime', // downstream watch time the video drives
])

const REQUIRED_FIELDS = ['id', 'title', 'category', 'principle', 'targetMetric', 'source', 'status']

/**
 * Validate one strategy object. Returns { valid, errors[] } — never throws, so
 * callers can report every problem at once instead of failing on the first.
 */
export function validateStrategy(s) {
  const errors = []
  if (!s || typeof s !== 'object') return { valid: false, errors: ['strategy is not an object'] }

  for (const f of REQUIRED_FIELDS) {
    if (s[f] === undefined || s[f] === null || s[f] === '') errors.push(`missing required field: ${f}`)
  }

  if (s.id !== undefined && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(s.id))) {
    errors.push(`id must be kebab-case: ${s.id}`)
  }

  if (s.status !== undefined && !STRATEGY_STATUS.includes(s.status)) {
    errors.push(`status must be one of ${STRATEGY_STATUS.join('|')}: got ${s.status}`)
  }

  if (s.targetMetric !== undefined && !KNOWN_METRICS.includes(s.targetMetric)) {
    errors.push(`targetMetric must be a known metric (${KNOWN_METRICS.join(', ')}): got ${s.targetMetric}`)
  }

  if (s.guardMetrics !== undefined) {
    if (!Array.isArray(s.guardMetrics)) errors.push('guardMetrics must be an array')
    else for (const m of s.guardMetrics) if (!KNOWN_METRICS.includes(m)) errors.push(`unknown guardMetric: ${m}`)
  }

  if (s.confidence !== undefined && (typeof s.confidence !== 'number' || s.confidence < 0 || s.confidence > 1)) {
    errors.push(`confidence must be a number in [0,1]: got ${s.confidence}`)
  }

  // PROVENANCE — the core anti-slop rule. A `documented` strategy must cite a real
  // external source (name + url OR a direct quote). A `hypothesis` is ViewForge's
  // own idea, so it is allowed source.kind === "internal" with a rationale instead.
  if (s.source && typeof s.source === 'object') {
    const kind = s.source.kind || 'external'
    if (kind === 'external') {
      const hasName = !!s.source.name
      const hasAnchor = !!s.source.url || !!s.source.quote
      if (!hasName) errors.push('external source must have a name')
      if (!hasAnchor) errors.push('external source must have a url or a quote (no anonymous claims)')
    } else if (kind === 'internal') {
      if (s.status === 'documented') errors.push('an internal-source strategy cannot be "documented"; start it as "hypothesis"')
      if (!s.source.rationale) errors.push('internal source must explain its rationale')
    } else {
      errors.push(`unknown source.kind: ${kind}`)
    }
  } else if (s.source !== undefined) {
    errors.push('source must be an object')
  }

  if (s.evidence !== undefined && !Array.isArray(s.evidence)) errors.push('evidence must be an array')

  return { valid: errors.length === 0, errors }
}

/**
 * Load every strategy JSON file from a directory. Returns
 * { strategies[], problems[] } where problems lists files that failed to parse
 * or validate — load is total (one bad file never hides the rest), and IDs must
 * be unique across the library.
 */
export function loadStrategies(dir) {
  const strategies = []
  const problems = []
  let files = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  } catch (e) {
    return { strategies, problems: [{ file: dir, error: `cannot read dir: ${e.message}` }] }
  }

  const seenIds = new Map()
  for (const f of files) {
    const full = path.join(dir, f)
    let obj
    try {
      obj = JSON.parse(fs.readFileSync(full, 'utf8'))
    } catch (e) {
      problems.push({ file: f, error: `invalid JSON: ${e.message}` })
      continue
    }
    const { valid, errors } = validateStrategy(obj)
    if (!valid) {
      problems.push({ file: f, error: errors.join('; ') })
      continue
    }
    if (seenIds.has(obj.id)) {
      problems.push({ file: f, error: `duplicate id "${obj.id}" (also in ${seenIds.get(obj.id)})` })
      continue
    }
    seenIds.set(obj.id, f)
    strategies.push(obj)
  }
  return { strategies, problems }
}

/**
 * Query a loaded strategy list. All filters are AND-ed. `status`/`category` accept
 * a string or array. `appliesTo` matches strategies whose appliesTo includes the
 * given stage. Results sort by confidence desc, then id, for stable output.
 */
export function queryStrategies(strategies, filter = {}) {
  const asSet = (v) => (v === undefined ? null : new Set(Array.isArray(v) ? v : [v]))
  const statuses = asSet(filter.status)
  const categories = asSet(filter.category)
  const metrics = asSet(filter.targetMetric)

  return strategies
    .filter((s) => {
      if (statuses && !statuses.has(s.status)) return false
      if (categories && !categories.has(s.category)) return false
      if (metrics && !metrics.has(s.targetMetric)) return false
      if (filter.appliesTo && !(Array.isArray(s.appliesTo) && s.appliesTo.includes(filter.appliesTo))) return false
      if (filter.minConfidence !== undefined && (s.confidence ?? 0) < filter.minConfidence) return false
      return true
    })
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || String(a.id).localeCompare(String(b.id)))
}
