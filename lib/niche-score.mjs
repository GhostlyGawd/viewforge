// niche-score.mjs — the deterministic core of the niche-selection department.
//
// Picking a niche well is the single highest-leverage decision a channel makes, and
// it is a decision ViewForge must make *repeatably* and *improve over time*. This
// module turns a niche candidate into a transparent, weighted score so the choice
// is auditable (you can see exactly why one niche beat another) instead of a vibe.
//
// The factor weights are themselves a tunable strategy: as ViewForge runs real
// channels it learns which factors actually predicted success and re-weights here
// (every weight change is a strategy observation, subject to the same guards).
//
// Zero dependencies.

// Each factor is scored 0..10 by the caller (research department fills these in),
// and carries a weight and a direction. `lowerIsBetter` factors (like saturation
// and production cost) are inverted before weighting, so a high raw saturation
// correctly pulls the composite DOWN.
export const NICHE_FACTORS = Object.freeze([
  { key: 'demand', label: 'Audience demand / search + watch volume', weight: 1.5, lowerIsBetter: false },
  { key: 'growth', label: 'Trend trajectory (is the niche growing?)', weight: 1.2, lowerIsBetter: false },
  { key: 'monetization', label: 'RPM / sponsor depth / product potential', weight: 1.3, lowerIsBetter: false },
  { key: 'saturation', label: 'Competitive saturation', weight: 1.2, lowerIsBetter: true },
  { key: 'differentiability', label: 'Room for a distinct angle / "wow factor"', weight: 1.3, lowerIsBetter: false },
  { key: 'productionFit', label: 'Fit for motion-graphics production (no fake humans needed)', weight: 1.4, lowerIsBetter: false },
  { key: 'repeatability', label: 'Can it sustain a format engine (many videos)?', weight: 1.1, lowerIsBetter: false },
  { key: 'productionCost', label: 'Cost / effort per video', weight: 0.9, lowerIsBetter: true },
  { key: 'passionDurability', label: 'Operator can sustain it for years', weight: 0.7, lowerIsBetter: false },
])

const FACTOR_BY_KEY = new Map(NICHE_FACTORS.map((f) => [f.key, f]))
const MAX_FACTOR = 10

/**
 * Score one niche candidate.
 *
 *   niche = { name, factors: { demand: 0..10, saturation: 0..10, ... }, notes? }
 *
 * Returns { name, score (0..100), breakdown[], missing[] }:
 *  - score is normalized to 0..100 so it reads like a percentage of the ideal.
 *  - breakdown lists each factor's raw value, the direction-corrected effective
 *    value, the weighted contribution, and the source note — so the ranking is
 *    fully explainable.
 *  - missing lists factors the caller didn't supply (scored as a neutral 5, and
 *    surfaced so the research department knows what still needs grounding).
 *
 * Optional `weightOverrides` lets the niche-selection strategy A/B different
 * weightings without editing this file.
 */
export function scoreNiche(niche, weightOverrides = {}) {
  if (!niche || typeof niche !== 'object' || !niche.name) {
    throw new Error('scoreNiche: niche must be an object with a name')
  }
  const factors = niche.factors || {}
  const missing = []
  let weightedSum = 0
  let weightTotal = 0
  const breakdown = []

  for (const f of NICHE_FACTORS) {
    const weight = weightOverrides[f.key] ?? f.weight
    let raw = factors[f.key]
    if (raw === undefined || raw === null) {
      missing.push(f.key)
      raw = 5 // neutral default — never silently treat unknown as best or worst
    }
    raw = clamp(Number(raw), 0, MAX_FACTOR)
    // Direction correction: for lowerIsBetter factors, invert around the scale.
    const effective = f.lowerIsBetter ? MAX_FACTOR - raw : raw
    const contribution = effective * weight
    weightedSum += contribution
    weightTotal += weight * MAX_FACTOR
    breakdown.push({
      key: f.key,
      label: f.label,
      raw,
      effective,
      weight,
      lowerIsBetter: f.lowerIsBetter,
      contribution: round(contribution),
      supplied: !missing.includes(f.key),
    })
  }

  const score = weightTotal > 0 ? round((weightedSum / weightTotal) * 100) : 0
  return { name: niche.name, score, breakdown, missing }
}

/**
 * Score and rank a list of niche candidates, best first. Ties break by the count
 * of supplied (grounded) factors — a well-researched niche outranks a guessed one
 * at the same score. Returns the scored objects with a `rank` field added.
 */
export function rankNiches(niches, weightOverrides = {}) {
  if (!Array.isArray(niches)) throw new Error('rankNiches: expected an array')
  const scored = niches.map((n) => scoreNiche(n, weightOverrides))
  scored.sort((a, b) => b.score - a.score || (NICHE_FACTORS.length - a.missing.length) - (NICHE_FACTORS.length - b.missing.length))
  scored.forEach((s, i) => (s.rank = i + 1))
  return scored
}

/**
 * Confidence in a niche ranking, separate from the score itself: a 90/100 niche
 * built on 2 supplied factors is a guess, not a recommendation. Returns 0..1 =
 * (supplied factors / total factors) for the top candidate. The skill uses this to
 * decide whether to send the research department back for more grounding.
 */
export function rankingConfidence(scoredNiche) {
  if (!scoredNiche || !Array.isArray(scoredNiche.breakdown)) return 0
  const supplied = scoredNiche.breakdown.filter((b) => b.supplied).length
  return round(supplied / NICHE_FACTORS.length)
}

function clamp(x, lo, hi) {
  if (Number.isNaN(x)) return lo
  return Math.max(lo, Math.min(hi, x))
}
function round(x) {
  return Math.round(x * 100) / 100
}

export { FACTOR_BY_KEY }
