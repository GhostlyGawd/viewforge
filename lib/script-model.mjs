// script-model.mjs — the script department's deterministic engine.
//
// Turns a locked, packaged video into a retention-STRUCTURED beat sheet, and
// validates a drafted script against the structure. This is where the retention
// strategies become an enforceable shape: the first-minute over-investment, "crazy
// progression" (show don't tell), the scheduled re-engagement beats, no dull gaps,
// and a payoff that doesn't signal "the end" early and shed late retention.
//
// The beat sheet scales to any target length; timings are derived, not hard-coded to
// one runtime. Zero dependencies.

export const DEFAULT_NARRATION_WPM = 150 // conversational explainer narration pace

export function estimateSeconds(words, wpm = DEFAULT_NARRATION_WPM) {
  return Math.round((words / wpm) * 60)
}
export function estimateWords(seconds, wpm = DEFAULT_NARRATION_WPM) {
  return Math.round((seconds / 60) * wpm)
}

// The retention blueprint as proportions of total runtime (derived from the memo's
// minute-based guidance, generalized so it scales to a 6-minute or a 14-minute video).
// Each phase cites the strategy it serves.
const BLUEPRINT = [
  { id: 'hook', from: 0.0, to: 0.04, purpose: 'Pay off the title/thumbnail promise instantly; max stimulation, quick cuts.', strategyIds: ['first-minute-retention', 'package-before-you-produce'] },
  { id: 'show-dont-tell', from: 0.04, to: 0.12, purpose: 'Stop telling them what they will watch — start showing. No slow setup.', strategyIds: ['crazy-progression'] },
  { id: 'progression', from: 0.12, to: 0.28, purpose: 'Crazy progression: compress time, escalate stakes every beat.', strategyIds: ['crazy-progression', 'no-dull-moments'] },
  { id: 'reengage-1', from: 0.28, to: 0.33, purpose: 'First scheduled re-engagement spike — a reveal that fits the story.', strategyIds: ['reengagement-beats'] },
  { id: 'investment', from: 0.33, to: 0.5, purpose: 'Core content; the viewer who reaches halfway almost always finishes.', strategyIds: ['no-dull-moments'] },
  { id: 'reengage-2', from: 0.5, to: 0.56, purpose: 'Second re-engagement spike at the midpoint.', strategyIds: ['reengagement-beats'] },
  { id: 'escalation', from: 0.56, to: 0.82, purpose: 'Back-half escalation toward the payoff; wow-factor moment lives here.', strategyIds: ['wow-factor', 'no-dull-moments'] },
  { id: 'payoff', from: 0.82, to: 0.96, purpose: 'Deliver the promised payoff fully — the title claim is paid off here.', strategyIds: ['package-before-you-produce'] },
  { id: 'outro', from: 0.96, to: 1.0, purpose: 'Soft hand-off to the next video; do NOT signal a hard ending early.', strategyIds: ['reengagement-beats'] },
]

// Product-demo grammar (Master Doc v2 §19): capture-first — the REAL UI is on screen
// by ≤8% of runtime (§13 show_ui_early: first 5–8s of a demo). Staged performance:
// hero → reveal → cursor to key element → action → result + benefit → next/cta.
const DEMO_BLUEPRINT = [
  { id: 'hero', from: 0.0, to: 0.05, purpose: 'State the promise over the hero shot; the demo pays it off on the real product.', strategyIds: ['package-before-you-produce', 'first-minute-retention'] },
  { id: 'ui-reveal', from: 0.05, to: 0.15, purpose: 'Reveal the REAL product UI (capture, never mockup for UI truth) — early, per show_ui_early.', strategyIds: ['first-minute-retention'] },
  { id: 'cursor-action', from: 0.15, to: 0.35, purpose: 'Cursor to the key element; hover, click, modal — the scripted walkthrough on real footage.', strategyIds: ['no-dull-moments'] },
  { id: 'transform', from: 0.35, to: 0.55, purpose: 'The work happening: data transforms, the product doing the thing.', strategyIds: ['crazy-progression'] },
  { id: 'proof', from: 0.55, to: 0.75, purpose: 'Before/after comparison — the result, proven on screen.', strategyIds: ['wow-factor'] },
  { id: 'benefit', from: 0.75, to: 0.9, purpose: 'Result + benefit stated plainly (feature-benefit card tier is fine here).', strategyIds: ['no-dull-moments'] },
  { id: 'cta', from: 0.9, to: 1.0, purpose: 'One clear call to action; no hard stop.', strategyIds: ['reengagement-beats'] },
]

// Shorts grammar (§19): hook burst → fast visual proof → one core insight → quick CTA.
const SHORT_BLUEPRINT = [
  { id: 'hook-burst', from: 0.0, to: 0.12, purpose: 'Text-burst hook — the promise in the first second.', strategyIds: ['first-minute-retention', 'package-before-you-produce'] },
  { id: 'proof', from: 0.12, to: 0.55, purpose: 'Fast visual proof with rapid word-timed captions.', strategyIds: ['no-dull-moments'] },
  { id: 'insight', from: 0.55, to: 0.88, purpose: 'The one core insight — a Short carries exactly one.', strategyIds: ['crazy-progression'] },
  { id: 'cta', from: 0.88, to: 1.0, purpose: 'Quick CTA; loop-friendly ending.', strategyIds: ['reengagement-beats'] },
]

export const BLUEPRINTS = Object.freeze({ education: BLUEPRINT, demo: DEMO_BLUEPRINT, short: SHORT_BLUEPRINT })
export const FORMATS = Object.freeze(Object.keys(BLUEPRINTS))

// §13 show_ui_early: a demo must reveal the real UI within the first 8% of runtime.
export const DEMO_UI_REVEAL_MAX_FRACTION = 0.08

/**
 * Build a beat sheet for a video. Returns an array of beats with absolute second
 * boundaries, the purpose, the strategies each serves, and a per-beat word budget.
 *
 *   buildBeatSheet({ targetSeconds: 480, title: "...", format: "education"|"demo"|"short" })
 */
export function buildBeatSheet({ targetSeconds = 480, title = '', wpm = DEFAULT_NARRATION_WPM, format = 'education' } = {}) {
  if (!(targetSeconds > 0)) throw new Error('buildBeatSheet: targetSeconds must be > 0')
  const blueprint = BLUEPRINTS[format]
  if (!blueprint) throw new Error(`buildBeatSheet: unknown format "${format}" (${FORMATS.join('|')})`)
  return blueprint.map((p, i) => {
    const startSec = Math.round(p.from * targetSeconds)
    const endSec = Math.round(p.to * targetSeconds)
    return {
      id: p.id,
      startSec,
      endSec,
      durationSec: endSec - startSec,
      wordBudget: estimateWords(endSec - startSec, wpm),
      purpose: i === 0 && title ? `${p.purpose} (promise: "${title}")` : p.purpose,
      strategyIds: p.strategyIds,
    }
  })
}

/**
 * Validate a drafted script's STRUCTURE (not its prose). `script` is:
 *   { targetSeconds, format?, beats: [{ id, startSec, endSec, text, hasStimulation? }] }
 * Returns { valid, issues[] }. Common rules for every format: starts at t=0 on a
 * hook-class beat, no dull gaps, no abrupt ending. Format-specific rules:
 *  - education: both scheduled re-engagement beats present; ends payoff/outro.
 *  - demo (§13/§19): the real UI reveal must START within the first 8% of runtime;
 *    ends on a CTA.
 *  - short (§19): one insight, ends on a CTA.
 */
export function validateScriptStructure(script, { maxDullGapSec = 30, format } = {}) {
  const issues = []
  if (!script || !Array.isArray(script.beats) || script.beats.length === 0) {
    return { valid: false, issues: ['script has no beats'] }
  }
  const fmt = format ?? script.format ?? 'education'
  if (!BLUEPRINTS[fmt]) return { valid: false, issues: [`unknown format "${fmt}" (${FORMATS.join('|')})`] }
  const beats = [...script.beats].sort((a, b) => a.startSec - b.startSec)

  if (beats[0].startSec !== 0) issues.push('script does not start at t=0 — the first second is unguarded')
  if (!/hook|open|hero/i.test(beats[0].id || '')) issues.push('first beat is not a hook — the first-minute discipline requires opening on the payoff of the promise')

  const ids = new Set(beats.map((b) => b.id))
  const last = beats[beats.length - 1]

  if (fmt === 'education') {
    if (!ids.has('reengage-1')) issues.push('missing the first re-engagement beat (~28-33%)')
    if (!ids.has('reengage-2')) issues.push('missing the second re-engagement beat (~midpoint)')
    if (!/outro|payoff/i.test(last.id || '')) issues.push('script does not end on a payoff/outro beat — risk of an abrupt ending that sheds late retention')
  } else if (fmt === 'demo') {
    const reveal = beats.find((b) => /ui-reveal|reveal/i.test(b.id || ''))
    const runtime = script.targetSeconds ?? (last.endSec ?? last.startSec)
    if (!reveal) issues.push('demo has no ui-reveal beat — a demo shows the real product (show_ui_early)')
    else if (runtime > 0 && reveal.startSec > DEMO_UI_REVEAL_MAX_FRACTION * runtime + 1e-9) {
      issues.push(`ui-reveal starts at ${reveal.startSec}s — later than ${Math.round(DEMO_UI_REVEAL_MAX_FRACTION * 100)}% of the ${runtime}s runtime (show_ui_early: the UI belongs in the first 5-8s)`)
    }
    if (!/cta/i.test(last.id || '')) issues.push('demo does not end on a CTA beat')
  } else if (fmt === 'short') {
    if (!ids.has('insight')) issues.push('short has no insight beat — a Short carries exactly one core insight')
    if (!/cta/i.test(last.id || '')) issues.push('short does not end on a CTA beat')
  }

  for (const b of beats) {
    const dur = (b.endSec ?? b.startSec) - b.startSec
    const hasText = typeof b.text === 'string' && b.text.trim().length > 0
    if (dur > maxDullGapSec && !b.hasStimulation && !hasText) {
      issues.push(`beat "${b.id}" runs ${dur}s with no scripted content or stimulation marker — a dull gap (no-dull-moments)`)
    }
  }

  return { valid: issues.length === 0, issues }
}

export { BLUEPRINT }
