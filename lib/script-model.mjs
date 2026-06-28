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

/**
 * Build a beat sheet for a video. Returns an array of beats with absolute second
 * boundaries, the purpose, the strategies each serves, and a per-beat word budget.
 *
 *   buildBeatSheet({ targetSeconds: 480, title: "..." })
 */
export function buildBeatSheet({ targetSeconds = 480, title = '', wpm = DEFAULT_NARRATION_WPM } = {}) {
  if (!(targetSeconds > 0)) throw new Error('buildBeatSheet: targetSeconds must be > 0')
  return BLUEPRINT.map((p) => {
    const startSec = Math.round(p.from * targetSeconds)
    const endSec = Math.round(p.to * targetSeconds)
    return {
      id: p.id,
      startSec,
      endSec,
      durationSec: endSec - startSec,
      wordBudget: estimateWords(endSec - startSec, wpm),
      purpose: p.id === 'hook' && title ? `${p.purpose} (promise: "${title}")` : p.purpose,
      strategyIds: p.strategyIds,
    }
  })
}

/**
 * Validate a drafted script's STRUCTURE (not its prose). `script` is:
 *   { targetSeconds, beats: [{ id, startSec, endSec, text, hasStimulation? }] }
 * Returns { valid, issues[] } checking the load-bearing retention rules:
 *  - opens with a hook at t=0 (first-minute discipline),
 *  - both scheduled re-engagement beats are present,
 *  - no "dull gap": no beat longer than maxDullGapSec without a stimulation marker,
 *  - does not end abruptly (an outro/payoff beat closes it).
 */
export function validateScriptStructure(script, { maxDullGapSec = 30 } = {}) {
  const issues = []
  if (!script || !Array.isArray(script.beats) || script.beats.length === 0) {
    return { valid: false, issues: ['script has no beats'] }
  }
  const beats = [...script.beats].sort((a, b) => a.startSec - b.startSec)

  if (beats[0].startSec !== 0) issues.push('script does not start at t=0 — the first second is unguarded')
  if (!/hook|open/i.test(beats[0].id || '')) issues.push('first beat is not a hook — the first-minute discipline requires opening on the payoff of the promise')

  const ids = new Set(beats.map((b) => b.id))
  if (!ids.has('reengage-1')) issues.push('missing the first re-engagement beat (~28-33%)')
  if (!ids.has('reengage-2')) issues.push('missing the second re-engagement beat (~midpoint)')

  for (const b of beats) {
    const dur = (b.endSec ?? b.startSec) - b.startSec
    const hasText = typeof b.text === 'string' && b.text.trim().length > 0
    if (dur > maxDullGapSec && !b.hasStimulation && !hasText) {
      issues.push(`beat "${b.id}" runs ${dur}s with no scripted content or stimulation marker — a dull gap (no-dull-moments)`)
    }
  }

  const last = beats[beats.length - 1]
  if (!/outro|payoff/i.test(last.id || '')) issues.push('script does not end on a payoff/outro beat — risk of an abrupt ending that sheds late retention')

  return { valid: issues.length === 0, issues }
}

export { BLUEPRINT }
