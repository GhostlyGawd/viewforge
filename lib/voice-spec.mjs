// voice-spec.mjs — the voice department's deterministic engine.
//
// Produces a narration SPEC from a script (the text to speak, per-beat, with timing
// targets and light SSML-style markup) and recommends a TTS engine. ViewForge uses a
// SYNTHETIC voice (which is fine and must be disclosed where the platform requires) —
// what it never does is put a fake human on screen; the voice is audio only.
//
// Per the build rule "find a free/forkable tool before building one", the recommended
// engines are all free + self-hostable. Zero dependencies in this module itself.

import { estimateSeconds } from './script-model.mjs'

// Free, self-hostable TTS options, best-first for this use case. Piper is the default:
// fast, fully local, permissive license, good neural quality, no per-use cost.
// Kokoro is the DEFAULT — markedly more natural than Piper, still free + fully local.
// Use tools/synth-voice.py (audio-driven, per-beat → captions.json). Piper stays as a
// lighter fallback. Genuinely human voice = a paid API (ElevenLabs), out of the free set.
export const TTS_ENGINES = Object.freeze([
  { id: 'kokoro', name: 'Kokoro TTS', cost: 'free', local: true, license: 'Apache-2.0', defaultVoice: 'am_michael', note: 'most natural free local voice; the default. Drive via tools/synth-voice.py.' },
  { id: 'piper', name: 'Piper (rhasspy)', cost: 'free', local: true, license: 'MIT', defaultVoice: 'en_US-lessac-medium', note: 'fast lightweight fallback; more obviously synthetic. https://github.com/rhasspy/piper' },
  { id: 'xtts', name: 'Coqui XTTS v2', cost: 'free', local: true, license: 'MPL/Coqui', note: 'higher expressiveness + voice cloning; heavier.' },
])

export function recommendTtsEngine(prefer = 'kokoro') {
  return TTS_ENGINES.find((e) => e.id === prefer) || TTS_ENGINES[0]
}

// Pause hints (ms) so the narration breathes with the edit rather than racing.
const PAUSE = { beatBreak: 450, sentence: 250 }

/**
 * Build a narration spec from a drafted script. `script` = { beats: [{id, startSec,
 * endSec, text }] }. Returns:
 *   { engine, totalWords, estimatedSeconds, disclosureRequired, segments: [...] }
 * Each segment carries the beat's text, an estimated spoken duration, the target
 * window from the beat sheet, and a `fits` flag (does the spoken estimate fit the
 * beat's time budget?) so the script can be tightened before any audio is rendered.
 */
export function buildNarrationSpec(script, { engine = 'kokoro', disclose = true } = {}) {
  if (!script || !Array.isArray(script.beats)) throw new Error('buildNarrationSpec: script.beats required')
  const eng = recommendTtsEngine(engine)
  let totalWords = 0
  const segments = script.beats.map((b) => {
    const text = (b.text || '').trim()
    const words = text ? text.split(/\s+/).length : 0
    totalWords += words
    const spokenSec = estimateSeconds(words)
    const windowSec = (b.endSec ?? b.startSec) - b.startSec
    return {
      beatId: b.id,
      text,
      words,
      ssml: text ? toLightSsml(text) : '',
      spokenSec,
      windowSec,
      // A segment "fits" if it isn't so long it overruns the beat window (a short
      // segment is fine — motion/pauses fill the rest).
      fits: windowSec === 0 ? true : spokenSec <= windowSec + 2,
    }
  })
  return {
    engine: eng,
    totalWords,
    estimatedSeconds: estimateSeconds(totalWords),
    disclosureRequired: disclose,
    segments,
  }
}

/** Minimal SSML-ish wrapper: sentence pauses + a beat-break at the end. Engines that
 * don't read SSML can ignore the tags; the plain text is always present too. */
function toLightSsml(text) {
  const withSentencePauses = text.replace(/([.!?])\s+/g, `$1<break time="${PAUSE.sentence}ms"/> `)
  return `<speak>${withSentencePauses}<break time="${PAUSE.beatBreak}ms"/></speak>`
}

/** Sanity-check a spec: every segment fits its window, and disclosure is set. */
export function validateNarrationSpec(spec) {
  const issues = []
  if (!spec || !Array.isArray(spec.segments)) return { valid: false, issues: ['no segments'] }
  for (const s of spec.segments) if (!s.fits) issues.push(`segment "${s.beatId}" overruns its window (${s.spokenSec}s > ${s.windowSec}s) — tighten the copy`)
  if (spec.disclosureRequired && spec.engine && !spec.engine.local) issues.push('non-local engine — confirm usage rights + disclosure')
  return { valid: issues.length === 0, issues }
}
