// niche-discovery.mjs — the cold-start engine for the niche department.
//
// Normally the niche department starts from an interest the operator names. In
// COLD-START (fully autonomous) mode it's given nothing, or only a loose constraint,
// and has to *discover* candidate niches itself before scoring them. The discovery
// itself is web research (agentic, in the skill) — what lives here is the
// deterministic, testable scaffolding around it:
//   - DISCOVERY_LENSES: the distinct search angles to sweep, so discovery isn't one
//     blinkered query but a spread (trending / monetization / whitespace / format-fit).
//   - name normalization + dedupe: web sweeps return the same niche phrased five ways;
//     this collapses them so the ranking isn't polluted by duplicates.
//   - a constraint filter: drop anything that needs an on-camera/real human, since the
//     product never uses a fake human and a face-led niche is out of scope.
//
// Zero dependencies.

// Each lens is one search angle. The skill runs a query per lens (optionally suffixed
// with the operator's loose constraint) and harvests candidate niche names. The set is
// deliberately diverse — a niche that's invisible to one lens shows up in another.
export const DISCOVERY_LENSES = Object.freeze([
  { id: 'trending', query: 'fastest growing faceless YouTube niches', rationale: 'momentum — niches on the way up' },
  { id: 'high-rpm', query: 'highest RPM / CPM YouTube niches advertisers pay most for', rationale: 'monetization ceiling' },
  { id: 'faceless-format', query: 'best faceless YouTube channel ideas using animation or motion graphics', rationale: 'fit for no-fake-human motion-graphics production' },
  { id: 'whitespace', query: 'underserved YouTube topics with high demand and low quality competition', rationale: 'saturation gaps' },
  { id: 'evergreen', query: 'evergreen educational YouTube niches with long-tail search demand', rationale: 'repeatable, durable demand' },
  { id: 'product-led', query: 'YouTube niches that sell digital products or sponsorships well', rationale: 'beyond-adsense revenue' },
])

/** Normalize a niche name for comparison: lowercase, strip punctuation, collapse
 * whitespace, and drop a few generic filler words so near-duplicates collide. */
export function normalizeNicheName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(youtube|channel|niche|videos?|content|ideas?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Lightweight plural fold so "explainer" / "explainers" collide. Only strips a
    // trailing 's' from tokens long enough that it's plausibly a plural (>3 chars,
    // not ending in 'ss'), which is enough to merge web sweeps without over-collapsing.
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ')
}

/**
 * Dedupe discovered candidates by normalized name. Each input is { name, lenses?:[],
 * ... }. When the same niche surfaces from multiple lenses, they're merged and the
 * union of lenses is kept (more lenses = stronger signal the niche is real). The
 * first-seen display name wins. Returns the merged list in first-seen order.
 */
export function dedupeCandidates(candidates) {
  if (!Array.isArray(candidates)) throw new Error('dedupeCandidates: expected an array')
  const byKey = new Map()
  for (const c of candidates) {
    if (!c || !c.name) continue
    const key = normalizeNicheName(c.name)
    if (!key) continue
    if (!byKey.has(key)) {
      byKey.set(key, { ...c, lenses: [...(c.lenses || [])] })
    } else {
      const existing = byKey.get(key)
      existing.lenses = [...new Set([...existing.lenses, ...(c.lenses || [])])]
    }
  }
  return [...byKey.values()]
}

// Markers that a niche fundamentally needs a real on-camera human — out of scope for
// a no-fake-human, motion-graphics factory. (We never fake a human to fake-fit one.)
const FACE_LED_MARKERS = [
  'vlog', 'vlogging', 'talking head', 'face reveal', 'reaction', 'react ',
  'makeup tutorial', 'get ready with me', 'grwm', 'fitness demonstration', 'dance',
  'asmr whisper', 'mukbang', 'haul', 'try on',
]

/**
 * Returns true if a niche is a reasonable fit for faceless motion-graphics production.
 * Conservative: only rejects niches that *inherently* require a real on-camera person.
 */
export function isFacelessFriendly(nicheName) {
  const n = String(nicheName || '').toLowerCase()
  return !FACE_LED_MARKERS.some((m) => n.includes(m))
}

/** Filter a candidate list to faceless-friendly niches, returning { kept, dropped }. */
export function filterFaceless(candidates) {
  const kept = []
  const dropped = []
  for (const c of candidates) (isFacelessFriendly(c.name) ? kept : dropped).push(c)
  return { kept, dropped }
}
