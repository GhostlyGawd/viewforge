// motion-plan.mjs — the motion department's deterministic engine.
//
// Turns the beat sheet + the channel brand into a SCENE TIMELINE where every visual
// element is an explicit, tweakable PARAMETER. That parameterization is the whole
// point: it's the substrate the optimization loop A/B-tests over (swap a transition,
// a pace, an accent placement → measure retention). The plan is renderer-agnostic
// data; the motion skill feeds it to a Remotion project.
//
// Hard rule carried here too: the visual mode is motion-graphics and never a fake
// human. Zero dependencies.

export const VISUAL_MODE = 'motion-graphics'

// Brand palette values often carry a human label, e.g. "#14110E (warm near-black)".
// Passed straight to CSS that renders as an invalid color (white/black fallback) — a
// bug a still-render exposed that unit tests with clean fixtures missed. Extract the
// first real color token so the render always gets valid CSS.
export function extractCssColor(token, fallback = '#000000') {
  if (typeof token !== 'string') return fallback
  const m = token.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/)
  if (m) return m[0]
  const word = token.trim().split(/\s+/)[0]
  return word || fallback
}

// Typography tokens carry labels too, e.g. "Fraunces (high-contrast serif) for titles".
// Take the family name (up to the first parenthesis/comma) and append a generic
// fallback so the render still works if the font isn't installed.
export function extractFontFamily(token, generic = 'serif') {
  if (typeof token !== 'string' || !token.trim()) return generic
  const name = token.split(/[(,]/)[0].trim()
  return name ? `'${name}', ${generic}` : generic
}

// Default per-scene visual parameters. These are the knobs the system tunes over time.
const SCENE_DEFAULTS = {
  transitionIn: 'ink-draw', // brand motion identity
  transitionOut: 'cut',
  textWeight: 'display', // display | body
  accentUsage: 'single-focus', // one accented element per scene (brand rule)
  cutsPerScene: 4, // pacing — higher early for the hook
  texture: 'paper-grain',
}

// Per-beat overrides that encode retention strategy as motion (fast hook, slower
// investment, escalation back-half). Keyed by beat id from script-model BLUEPRINT.
const BEAT_MOTION = {
  hook: { cutsPerScene: 7, transitionIn: 'hard-cut-montage', note: 'max stimulation; pay off the title visually in <3s' },
  'show-dont-tell': { cutsPerScene: 6 },
  progression: { cutsPerScene: 6, transitionIn: 'timeline-morph' },
  'reengage-1': { cutsPerScene: 5, transitionIn: 'reveal-wipe', note: 'visual reveal aligned to the re-engagement beat' },
  investment: { cutsPerScene: 4 },
  'reengage-2': { cutsPerScene: 5, transitionIn: 'reveal-wipe' },
  escalation: { cutsPerScene: 5, transitionIn: 'map-morph', note: 'wow-factor set piece lives here' },
  payoff: { cutsPerScene: 4, transitionIn: 'stamp', note: 'land the promised payoff' },
  outro: { cutsPerScene: 3, transitionOut: 'soft-hold', note: 'no hard ending; hand to next video' },
}

/**
 * Build a scene timeline from a beat sheet + a brand record.
 * Returns { visualMode, fps, palette, type, scenes: [...] }. Each scene carries fully
 * resolved, tweakable parameters + the brand tokens it should use. Throws if the brand
 * would put a fake human on screen.
 */
export function buildMotionPlan(beatSheet, brand, { fps = 30, weightOverrides = {} } = {}) {
  if (!Array.isArray(beatSheet) || beatSheet.length === 0) throw new Error('buildMotionPlan: beatSheet required')
  if (!brand || typeof brand !== 'object') throw new Error('buildMotionPlan: brand required')
  if (brand.usesFakeHumanPresenter === true || ['ai-avatar', 'deepfake-presenter'].includes(brand.visualMode)) {
    throw new Error('buildMotionPlan: brand requires a fake-human presenter — blocked by the no-fake-human constraint')
  }

  const scenes = beatSheet.map((beat) => {
    const params = { ...SCENE_DEFAULTS, ...(BEAT_MOTION[beat.id] || {}), ...weightOverrides }
    return {
      beatId: beat.id,
      startSec: beat.startSec,
      endSec: beat.endSec,
      startFrame: Math.round(beat.startSec * fps),
      endFrame: Math.round(beat.endSec * fps),
      params,
      tokens: {
        bg: extractCssColor(brand.palette?.bg, '#000000'),
        ink: extractCssColor(brand.palette?.ink, '#ffffff'),
        accent: extractCssColor(brand.palette?.accent, '#ff0000'),
        displayFont: extractFontFamily(brand.typography?.display, 'serif'),
        bodyFont: extractFontFamily(brand.typography?.body, 'sans-serif'),
      },
      strategyIds: beat.strategyIds || [],
    }
  })

  return {
    visualMode: VISUAL_MODE,
    fps,
    durationFrames: scenes.length ? scenes[scenes.length - 1].endFrame : 0,
    brandName: brand.name ?? null,
    palette: brand.palette ?? null,
    scenes,
  }
}

/** List the tweakable parameter keys in a plan (the A/B surface) — used by the
 * optimization loop to know what it's allowed to vary. */
export function tweakableParameters(plan) {
  const keys = new Set()
  for (const s of plan.scenes || []) for (const k of Object.keys(s.params)) keys.add(k)
  return [...keys].sort()
}
