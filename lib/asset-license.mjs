// asset-license.mjs — the rights-clean gate for any sourced media (image, music, SFX).
//
// ViewForge channels are MONETIZED and the editor CROPS/COMPOSITES, so the usable set is
// narrow and the exclusions are deliberate:
//   ✅ public-domain, cc0, cc-by (needs attribution), cc-by-sa (attribution + sharealike)
//   ❌ *-nc*  (NonCommercial — ads make the channel commercial)
//   ❌ *-nd   (NoDerivatives — cropping/compositing is a derivative)
//   ❌ unknown / all-rights-reserved / anything unclassified  → NEVER usable
//
// This mirrors the strategy library's provenance rule: nothing enters a video without a
// recorded, usable license. Pure + zero-dep.

export const CANONICAL = Object.freeze([
  'public-domain', 'cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd', 'cc-by-nd', 'all-rights-reserved', 'unknown',
])
const USABLE = new Set(['public-domain', 'cc0', 'cc-by', 'cc-by-sa'])
const NEEDS_ATTRIBUTION = new Set(['cc-by', 'cc-by-sa'])
const SHARE_ALIKE = new Set(['cc-by-sa'])

/**
 * Normalize a raw license string/id (from Openverse, LoC, Wikimedia, etc.) to a
 * canonical id. Conservative: anything it can't confidently classify → 'unknown'.
 */
export function classifyLicense(raw) {
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return 'unknown'
  // public domain variants
  if (/(^|\b)(pdm|publicdomain|public[\s-]?domain|no known (restrictions|copyright)|us government work)\b/.test(s)) return 'public-domain'
  if (/(^|\b)(cc0|cc-?zero|zero)\b/.test(s)) return 'cc0'
  // strip a leading "cc"/"cc-by" prefix noise and inspect the clause tokens
  const tokens = s.replace(/creative commons/g, '').replace(/cc/g, '').replace(/[^a-z]+/g, '-').split('-').filter(Boolean)
  const has = (t) => tokens.includes(t)
  if (has('by')) {
    if (has('nc') && has('nd')) return 'cc-by-nc-nd'
    if (has('nc') && has('sa')) return 'cc-by-nc-sa'
    if (has('nc')) return 'cc-by-nc'
    if (has('nd')) return 'cc-by-nd'
    if (has('sa')) return 'cc-by-sa'
    return 'cc-by'
  }
  if (/(all rights reserved|copyright|rights-reserved|arr)\b/.test(s)) return 'all-rights-reserved'
  return 'unknown'
}

/** Full classification of a raw license. */
export function describeLicense(raw) {
  const id = classifyLicense(raw)
  return {
    id,
    usable: USABLE.has(id),
    requiresAttribution: NEEDS_ATTRIBUTION.has(id),
    shareAlike: SHARE_ALIKE.has(id),
  }
}

/**
 * The GATE. Returns true only if the license is usable AND, when the license requires
 * attribution, a non-empty attribution is present. Everything else is false.
 *   isUsable('by', { attribution: 'Jane Doe / LoC' }) === true
 *   isUsable('by', {}) === false   (attribution required but missing)
 *   isUsable('by-nc', { attribution: 'x' }) === false  (NC excluded)
 */
export function isUsable(rawLicense, { attribution } = {}) {
  const d = describeLicense(rawLicense)
  if (!d.usable) return false
  if (d.requiresAttribution && !(attribution && String(attribution).trim())) return false
  return true
}
