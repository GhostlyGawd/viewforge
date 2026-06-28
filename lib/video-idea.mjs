// video-idea.mjs — the research department's deterministic engine.
//
// This is where several strategy-library claims become testable code. The research
// department's job is to pick video ideas and lock the *packaged promise* (title +
// thumbnail) before production. This module scores a video idea on:
//   - packaging strength (encodes `thumbnail-title-extremity` + `package-before-you-produce`)
//   - demand
//   - production fit for motion graphics (no fake humans)
//   - format novelty vs what the channel just shipped (encodes `format-novelty`)
// and HARD-BLOCKS an idea whose title claim the content won't pay off (the
// `no-deceptive-clickbait` constraint). The point: the strategies aren't just prose —
// they gate what the factory is allowed to make.
//
// Zero dependencies.

// Curiosity/intrigue markers drawn from the packaging strategies. Presence of these
// (honestly applied) correlates with click-through in the documented memo guidance.
const INTRIGUE_WORDS = [
  'survived', 'survive', 'impossible', 'nobody', 'everyone', 'worst', 'best', 'secret',
  'last', 'first', 'never', 'why', 'how', 'what happens', 'i tried', 'we built',
  'destroyed', 'beat', 'hidden', 'banned', 'real', 'truth', 'vs', 'until',
]
const SUPERLATIVE_RE = /\b(most|least|biggest|smallest|fastest|slowest|hardest|easiest|richest|deadliest)\b/i
const NUMBER_RE = /\b\d+([.,]\d+)?\b/

// YouTube shows roughly this many characters before truncation in most surfaces.
const TITLE_MAX_VISIBLE = 70
const TITLE_MIN = 15

/**
 * Score the packaging (title) of an idea, 0..10. Rewards intrigue, a concrete
 * number/stake, and superlative framing; penalizes titles that are too long to read
 * or too short to promise anything. Returns { score, signals[] } so the breakdown is
 * explainable. This does NOT judge whether the claim is honest — that's the separate
 * hard-constraint check below.
 */
export function scoreTitle(title) {
  const t = String(title || '').trim()
  const signals = []
  let score = 0

  const lower = t.toLowerCase()
  const intrigueHits = INTRIGUE_WORDS.filter((w) => lower.includes(w))
  if (intrigueHits.length) {
    score += Math.min(4, intrigueHits.length * 2)
    signals.push(`intrigue: ${intrigueHits.slice(0, 3).join(', ')}`)
  }
  if (SUPERLATIVE_RE.test(t)) {
    score += 2
    signals.push('superlative framing')
  }
  if (NUMBER_RE.test(t)) {
    score += 2
    signals.push('concrete number/stake')
  }

  const len = t.length
  if (len < TITLE_MIN) {
    score -= 2
    signals.push(`too short (${len} chars) — promises little`)
  } else if (len > TITLE_MAX_VISIBLE) {
    score -= 2
    signals.push(`too long (${len} chars) — truncates past ~${TITLE_MAX_VISIBLE}`)
  } else {
    score += 2
    signals.push('readable length')
  }

  return { score: clamp(score, 0, 10), signals }
}

const SUPERLATIVE_CLAIM_RE = /\b(most|least|biggest|smallest|fastest|slowest|hardest|easiest|richest|deadliest|first|only|never|nobody|everyone|worst|best)\b/i

/**
 * Check whether a video idea makes a QUANTIFIED or SUPERLATIVE claim in its title that
 * isn't backed by a source. Dogfooded from the 2026-06-28 incident where a "$40M"
 * title was locked without grounding and only got verified at script time. Returns
 * { needsGrounding, grounded, reason }. This mirrors the strategy library's provenance
 * rule: a factual claim in packaging should carry a real source before it's locked.
 */
export function checkClaimGrounding(idea) {
  const title = String(idea?.title || '')
  const hasNumber = NUMBER_RE.test(title) || /\$|\bmillion|\bbillion|\bpercent|%/i.test(title)
  const hasSuperlative = SUPERLATIVE_CLAIM_RE.test(title)
  const needsGrounding = hasNumber || hasSuperlative
  // A claim is grounded if the idea carries a non-empty source for it.
  const grounded = !!(idea?.claimSource && String(idea.claimSource).trim())
  return {
    needsGrounding,
    grounded: needsGrounding ? grounded : true,
    reason: needsGrounding && !grounded ? `title makes a ${hasNumber ? 'quantified' : 'superlative'} claim with no claimSource — ground it before locking` : null,
  }
}

/**
 * Score a complete video idea. Returns { score (0..100), breakdown, blocked,
 * blockReason, groundingWarning }.
 *
 *   idea = {
 *     title, thumbnailConcept, claimPaidOff: bool,   // packaging + honesty
 *     demand: 0..10, productionFit: 0..10,           // research-grounded factors
 *     format: "stair-step" | "countdown" | ...       // for novelty vs recent uploads
 *   }
 *   opts.recentFormats = formats of the channel's last N videos (most-recent-first)
 *
 * HARD BLOCK: if claimPaidOff is explicitly false, the idea is blocked regardless of
 * how strong the packaging is — clickbait the content doesn't deliver is not allowed.
 */
export function scoreVideoIdea(idea, opts = {}) {
  if (!idea || typeof idea !== 'object' || !idea.title) {
    throw new Error('scoreVideoIdea: idea must be an object with a title')
  }
  const recentFormats = opts.recentFormats || []

  // Hard constraint first — an unpaid-off claim is blocked, not merely penalized.
  if (idea.claimPaidOff === false) {
    return {
      score: 0,
      blocked: true,
      blockReason: 'title/thumbnail claim is not paid off by the content (no-deceptive-clickbait)',
      breakdown: [],
    }
  }

  const title = scoreTitle(idea.title)
  const demand = clamp(Number(idea.demand ?? 5), 0, 10)
  const productionFit = clamp(Number(idea.productionFit ?? 5), 0, 10)

  // Format novelty: full marks if this format wasn't used in the last upload, and a
  // steeper penalty the more recently/often it repeats (encodes `format-novelty`).
  let novelty = 10
  let noveltySignal = 'fresh format'
  if (idea.format) {
    const idx = recentFormats.findIndex((f) => f === idea.format)
    if (idx === 0) {
      novelty = 2
      noveltySignal = 'same format as the immediately-previous video — back-to-back repeat'
    } else if (idx > 0) {
      novelty = clamp(10 - Math.max(0, 5 - idx) * 1.5, 2, 10)
      noveltySignal = `format last used ${idx + 1} videos ago`
    }
  } else {
    noveltySignal = 'no format specified'
  }

  // Weighted composite. Packaging is weighted highest — it's the promise that earns
  // the click, and the strategies emphasize knowing it first.
  const weights = { title: 1.6, demand: 1.3, productionFit: 1.2, novelty: 1.0 }
  const parts = [
    { key: 'packaging', value: title.score, weight: weights.title, detail: title.signals.join('; ') },
    { key: 'demand', value: demand, weight: weights.demand, detail: 'research-grounded audience demand' },
    { key: 'productionFit', value: productionFit, weight: weights.productionFit, detail: 'motion-graphics production fit' },
    { key: 'formatNovelty', value: novelty, weight: weights.novelty, detail: noveltySignal },
  ]
  const weightedSum = parts.reduce((a, p) => a + p.value * p.weight, 0)
  const weightTotal = parts.reduce((a, p) => a + p.weight * 10, 0)
  const score = round((weightedSum / weightTotal) * 100)

  const grounding = checkClaimGrounding(idea)
  return {
    score,
    blocked: false,
    blockReason: null,
    // Not a hard block (the content may still pay off) — a warning the research skill
    // must resolve by grounding the claim before the idea is locked.
    groundingWarning: grounding.reason,
    breakdown: parts.map((p) => ({ ...p, contribution: round(p.value * p.weight) })),
  }
}

/**
 * Rank a slate of ideas best-first, dropping blocked ones to the bottom with their
 * reason intact. `recentFormats` is shared context (the channel's last uploads).
 */
export function rankVideoIdeas(ideas, opts = {}) {
  if (!Array.isArray(ideas)) throw new Error('rankVideoIdeas: expected an array')
  const scored = ideas.map((idea) => ({ title: idea.title, format: idea.format ?? null, ...scoreVideoIdea(idea, opts) }))
  scored.sort((a, b) => Number(a.blocked) - Number(b.blocked) || b.score - a.score)
  scored.forEach((s, i) => (s.rank = i + 1))
  return scored
}

function clamp(x, lo, hi) {
  if (Number.isNaN(x)) return lo
  return Math.max(lo, Math.min(hi, x))
}
function round(x) {
  return Math.round(x * 100) / 100
}
