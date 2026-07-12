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
  // The §19 scene GRAMMAR — which visual treatment renders the beat. One formula
  // repeated is a slideshow (the 2026-07-12 critique); a per-beat grammar is a
  // video. Being a param makes it A/B-able like every other knob.
  sceneType: 'photo-caption',
}

// Per-beat overrides that encode retention strategy as motion (fast hook, slower
// investment, escalation back-half). Keyed by beat id from the script-model
// BLUEPRINTS (education + demo + short — §19 scene grammars).
const BEAT_MOTION = {
  hook: { cutsPerScene: 7, transitionIn: 'hard-cut-montage', sceneType: 'kinetic-open', note: 'max stimulation; voice-synced kinetic type over photo cuts; pay off the title visually in <3s' },
  'show-dont-tell': { cutsPerScene: 6, sceneType: 'mechanism', note: 'the bespoke set piece SHOWS the mechanism (comma-split)' },
  progression: { cutsPerScene: 6, transitionIn: 'timeline-morph', sceneType: 'timeline', note: 'timeline sweep + photo cuts compress time' },
  'reengage-1': { cutsPerScene: 5, transitionIn: 'reveal-wipe', sceneType: 'reveal', note: 'visual reveal aligned to the re-engagement beat — push-in on a fresh image' },
  investment: { cutsPerScene: 4, sceneType: 'photo-caption' },
  'reengage-2': { cutsPerScene: 5, transitionIn: 'reveal-wipe', sceneType: 'counter', note: 'a running counter makes the mounting cost visceral' },
  escalation: { cutsPerScene: 5, transitionIn: 'map-morph', sceneType: 'chart', note: 'wow-factor set piece lives here — comparable-case bars' },
  payoff: { cutsPerScene: 4, transitionIn: 'stamp', sceneType: 'money-payoff', note: 'land the promised payoff — the counter ticks to the full figure' },
  outro: { cutsPerScene: 3, transitionOut: 'soft-hold', sceneType: 'recap', note: 'no hard ending; hand to next video' },
  // demo grammar (§19) — capture-first, overlay-driven
  hero: { cutsPerScene: 5, transitionIn: 'hard-cut-montage', sceneType: 'kinetic-open', note: 'promise over the hero shot' },
  'ui-reveal': { cutsPerScene: 3, transitionIn: 'reveal-wipe', camera: 'push_in', sceneType: 'capture', note: 'REAL capture reveal — BrowserFrame + push-in' },
  'cursor-action': { cutsPerScene: 4, transitionIn: 'cut', camera: 'cursor_focus', sceneType: 'capture', note: 'CursorOverlay + ClickRipple + ZoomPan on the target' },
  transform: { cutsPerScene: 5, transitionIn: 'cut', sceneType: 'capture', note: 'the product doing the work; keep motion continuous' },
  proof: { cutsPerScene: 4, transitionIn: 'reveal-wipe', sceneType: 'chart', note: 'before/after comparison split' },
  benefit: { cutsPerScene: 3, transitionIn: 'fade', sceneType: 'photo-caption', note: 'feature-benefit card (mockup tier allowed — not UI truth)' },
  cta: { cutsPerScene: 3, transitionOut: 'soft-hold', sceneType: 'recap', note: 'one clear CTA; no hard stop' },
  // shorts grammar (§19) — word-timed captions carry the rhythm
  'hook-burst': { cutsPerScene: 8, transitionIn: 'hard-cut-montage', sceneType: 'kinetic-open', note: 'text-burst hook, promise in the first second' },
  insight: { cutsPerScene: 5, transitionIn: 'cut', sceneType: 'photo-caption', note: 'the one core insight' },
}

/**
 * Build a scene timeline from a beat sheet + a brand record.
 * Returns { visualMode, fps, palette, type, scenes: [...] }. Each scene carries fully
 * resolved, tweakable parameters + the brand tokens it should use. Throws if the brand
 * would put a fake human on screen.
 */
export function buildMotionPlan(beatSheet, brand, { fps = 30, weightOverrides = {}, audioFile = null } = {}) {
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
    // Optional narration track (staged in the render project's public/ by the voice
    // step). Null until audio is produced; the template renders <Audio> only if set.
    audioFile: audioFile ?? null,
    // Provenance of the scene timing. A plan built straight from the beat sheet is
    // 'authored' (guessed seconds); applyResolvedTimeline upgrades it to
    // 'audio-solver' once the real narration has driven the durations.
    timingSource: 'authored',
    scenes,
  }
}

/**
 * Re-time a plan from the timing solver's resolved timeline (Master Doc v2 §6/§15) —
 * the audio-first step. Every plan scene must have a resolved counterpart (matched
 * beatId ↔ id) and vice versa; a partial mapping is a wiring bug and throws. Returns a
 * NEW plan (never mutates) whose scene seconds/frames come from the REAL narration,
 * stamped `timingSource: 'audio-solver'`. Scenes carry the solver's visual `holdMs` so
 * the renderer knows to fill with motion, never dead air.
 */
export function applyResolvedTimeline(plan, solvedScenes, { fps = plan?.fps ?? 30 } = {}) {
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length === 0) throw new Error('applyResolvedTimeline: plan with scenes required')
  if (!Array.isArray(solvedScenes) || solvedScenes.length === 0) throw new Error('applyResolvedTimeline: solved scenes required — run solveTimeline first')

  const byId = new Map()
  for (const s of solvedScenes) {
    if (!(typeof s?.resolvedStartMs === 'number' && s.resolvedStartMs >= 0) || !(s?.resolvedDurationMs > 0)) {
      throw new Error(`applyResolvedTimeline: scene "${s?.id ?? '(no id)'}" is not resolved — only solver output may time a render`)
    }
    byId.set(s.id, s)
  }
  const planIds = new Set(plan.scenes.map((s) => s.beatId))
  for (const id of byId.keys()) if (!planIds.has(id)) throw new Error(`applyResolvedTimeline: solved scene "${id}" has no plan scene`)

  const scenes = plan.scenes.map((sc) => {
    const solved = byId.get(sc.beatId)
    if (!solved) throw new Error(`applyResolvedTimeline: plan scene "${sc.beatId}" has no resolved timing`)
    const startSec = Math.round(solved.resolvedStartMs) / 1000
    const endSec = Math.round(solved.resolvedStartMs + solved.resolvedDurationMs) / 1000
    return {
      ...sc,
      startSec,
      endSec,
      startFrame: Math.round(startSec * fps),
      endFrame: Math.round(endSec * fps),
      holdMs: solved.holdMs ?? 0,
    }
  })

  return {
    ...plan,
    fps,
    durationFrames: Math.max(...scenes.map((s) => s.endFrame)),
    timingSource: 'audio-solver',
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
