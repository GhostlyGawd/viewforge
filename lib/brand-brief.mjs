// brand-brief.mjs — the brand department's deterministic engine.
//
// The brand department's creative work (naming, logo, palette, motion identity) is
// delegated to the brand-studio plugin. What lives here is the part that must be
// exact and testable: (1) deriving a structured BRAND BRIEF from the chosen niche so
// brand-studio is briefed consistently every time, and (2) VALIDATING the brand
// record that comes back, so a channel can't advance past the brand stage with a
// half-finished identity ("no mistakes"). No fake-human identity is ever briefed —
// the visual identity is motion-graphics / illustration first.
//
// Zero dependencies.

// The full brand suite a channel needs before it can produce. The brief requires all
// of these; the validator checks the returned record carries them.
export const BRAND_DELIVERABLES = Object.freeze([
  'name', // channel name
  'palette', // color system
  'typography', // type system
  'logo', // logo / wordmark asset
  'voiceGuide', // tone-of-voice + writing guide
  'thumbnailTemplate', // reusable thumbnail system (drives CTR consistency)
  'motionIdentity', // signature motion language (intros, transitions, lower-thirds)
])

const REQUIRED_BRAND_FIELDS = ['name', 'palette', 'typography', 'voiceGuide', 'logo', 'thumbnailTemplate', 'motionIdentity']

const titleCase = (s) =>
  String(s || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * Derive a structured brand brief from a channel's niche object (as produced by the
 * niche department). Deterministic and honest: it organizes what we know into the
 * inputs brand-studio needs and surfaces what's still unknown as `openQuestions`
 * rather than inventing it. The brief never requests an on-camera human identity.
 *
 *   niche = { name, factors?, notes?/sources?, angle?, wowFactor? }
 */
export function deriveBrandBrief(niche) {
  if (!niche || typeof niche !== 'object' || !niche.name) {
    throw new Error('deriveBrandBrief: niche must be an object with a name')
  }
  const f = niche.factors || {}
  const differentiable = (f.differentiability ?? 5) >= 6

  return {
    nicheName: niche.name,
    workingConcept: titleCase(niche.name),
    audience: niche.audience || null, // filled by the brand skill if not on the niche
    positioning: niche.angle || (differentiable ? 'lean into a distinct, ownable angle' : 'differentiate hard — the niche is crowded'),
    wowFactor: niche.wowFactor || null,
    toneSeeds: niche.toneSeeds || [],
    visualDirection: {
      mode: 'motion-graphics', // hard product constraint: never a fake human
      noFakeHuman: true,
      cues: niche.visualCues || [],
    },
    deliverables: [...BRAND_DELIVERABLES],
    openQuestions: [
      ...(niche.audience ? [] : ['Who exactly is the target viewer?']),
      ...(niche.wowFactor ? [] : ['What is the channel-level "wow factor" no competitor can match?']),
      ...(niche.toneSeeds && niche.toneSeeds.length ? [] : ['What three tone words define the voice?']),
    ],
    // Pointer for the skill: this is the plugin that does the creative generation.
    delegateTo: 'brand-studio',
  }
}

/**
 * Validate a brand record before it is stored on the channel / before the channel
 * advances past the brand stage. Returns { valid, errors[] }. Every deliverable must
 * be present and non-empty, and the visual identity must not be a fake human.
 */
export function validateBrandRecord(brand) {
  const errors = []
  if (!brand || typeof brand !== 'object') return { valid: false, errors: ['brand record is not an object'] }

  for (const field of REQUIRED_BRAND_FIELDS) {
    const v = brand[field]
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    if (empty) errors.push(`missing brand deliverable: ${field}`)
  }

  // Carry the product line into the brand layer: the identity can't be a fake human.
  if (brand.visualMode && ['ai-avatar', 'deepfake-presenter'].includes(brand.visualMode)) {
    errors.push(`brand visualMode "${brand.visualMode}" violates the no-fake-human constraint`)
  }
  if (brand.usesFakeHumanPresenter === true) errors.push('brand uses a fake-human presenter — not allowed')

  return { valid: errors.length === 0, errors }
}

export { REQUIRED_BRAND_FIELDS }
