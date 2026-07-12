// quality-bar.mjs — the top-1% production bar, enforced in code.
//
// The operator's mandate (2026-07-12): "This cannot pass QA until it's matching the
// quality bar set by 1M-view channels that use only visuals and motion and
// animation." So the bar is not advice — it is a SHIP GATE input. What top visual
// channels actually do, reduced to what code can measure:
//
//  1. CADENCE — something changes on screen constantly. Long-form educational
//     pacing alternates fast micro-cut stretches with deliberate processing holds
//     (miracamp.com/learn/youtube/duration-of-a-video; soundimages.net.au pacing
//     guide); short-form retention cuts every 2-4s (opus.pro shorts retention
//     data). Our explainers sit between: nothing may sit unchanged longer than
//     `maxEventGapSec` unless the scene DECLARES a hold (the solver's holdMs — a
//     hold is a choice, never an accident).
//  2. NO STATIC SCENES — Kurzgesagt-school motion: overlapping action, fake-3D
//     depth, perpetual drift (Kurzgesagt Motion Graphics, Skillshare parts 1-3).
//     Measured, not assumed: the Gate-B stills (start/mid/end per scene) are
//     pixel-compared; a scene whose three stills are near-identical is static and
//     BLOCKS. Zero-dep PNG decode below (node:zlib is builtin).
//  3. SOUND DENSITY — visual events carry SFX in top edits. Entered as an
//     internal-hypothesis strategy (sfx-on-visual-events) with an expiry — the
//     number is provisional until our own loop validates it.
//  4. GRAMMAR VARIETY — quantified: a cut of ≥6 scenes needs ≥4 distinct scene
//     grammars (the slideshow finding, promoted from warning to bar input).
//  5. CRAFT RUBRIC — what only eyes can judge (composition, depth, type
//     discipline, polish) is scored by the reviewing VLM against anchored
//     dimensions; the SCORING and the threshold are code.
//
// The model proposes; this file decides. Zero npm dependencies.

import { inflateSync } from 'node:zlib'

export const QUALITY_BAR = Object.freeze({
  maxEventGapSec: 5, // fast-stretch ceiling between visual events
  declaredHoldMaxSec: 15, // an INTENTIONAL hold may run this long (processing time)
  minSfxPerMinute: 3, // provisional — tracked by the sfx-on-visual-events hypothesis
  minDistinctGrammars: 4, // for cuts of ≥ minScenesForVariety scenes
  minScenesForVariety: 6,
  staticSceneMaxDiff: 2.5, // mean |Δ| (0..255) across sampled pixels — below this, frames are "the same"
  minCraftScore: 87, // the operator's stated minimum (calibrated scale) — below this the cut does not ship
})

// ---------------------------------------------------------------------------
// 1+3. Cadence — the visual-event timeline.
// ---------------------------------------------------------------------------

// Each grammar's INTERNAL animation events, as fractions of the scene duration.
// These mirror the StoryVideo set pieces (slam/split/labels, bar staggers, counter
// settle + seal…). kinetic-open is word-driven: its events are the voice-synced
// reveals themselves.
export const SCENE_EVENTS = Object.freeze({
  'kinetic-open': 'word-reveals',
  mechanism: [0.1, 0.35, 0.6, 0.8],
  timeline: [0.2, 0.4, 0.6, 0.8],
  reveal: [0, 0.15],
  counter: [0.2, 0.4, 0.6, 0.8], // the odometer never rests
  chart: [0.1, 0.25, 0.4, 0.55],
  'money-payoff': [0.05, 0.3, 0.55, 0.62],
  recap: [0.7], // end-card entrance — sparse by design, so cuts must carry it
  'photo-caption': [],
  capture: [0.25, 0.5, 0.75], // cursor motion is continuous; sampled conservatively
})

const intraCutTimes = (scene, durSec) => {
  const nAssets = Array.isArray(scene.assets) ? scene.assets.length : 0
  const n = Math.max(1, Math.min(scene.params?.cutsPerScene ?? 1, Math.max(1, nAssets * 3)))
  const times = []
  for (let i = 1; i < n; i++) times.push((i * durSec) / n)
  return nAssets > 0 ? times : [] // no assets → PhotoCuts renders one fallback, no real cuts
}

/**
 * The absolute visual-event timeline for a cut: scene starts, intra-scene photo
 * cuts, each grammar's internal animation events, voice-synced kinetic reveals, and
 * SFX cue times. Bottom captions deliberately do NOT count — overlay text is not a
 * scene change, and counting it would let a slideshow pass the bar.
 */
export function visualEvents(plan, { captions = null, sfxCueTimesSec = [] } = {}) {
  const events = []
  const beats = new Map((captions?.beats || []).map((b) => [b.beatId, b]))
  for (const s of plan?.scenes || []) {
    const start = s.startSec
    const dur = (s.endSec ?? s.startSec) - s.startSec
    if (!(dur > 0)) continue
    events.push({ tSec: start, sceneId: s.beatId, kind: 'scene-start' })
    for (const t of intraCutTimes(s, dur)) events.push({ tSec: start + t, sceneId: s.beatId, kind: 'cut' })
    const spec = SCENE_EVENTS[s.params?.sceneType ?? 'photo-caption'] ?? []
    if (spec === 'word-reveals') {
      const b = beats.get(s.beatId)
      for (const r of b?.revealSec || []) events.push({ tSec: start + r, sceneId: s.beatId, kind: 'kinetic-word' })
    } else {
      for (const f of spec) events.push({ tSec: start + f * dur, sceneId: s.beatId, kind: 'set-piece' })
    }
  }
  for (const t of sfxCueTimesSec) events.push({ tSec: t, sceneId: null, kind: 'sfx' })
  return events.sort((a, b) => a.tSec - b.tSec)
}

/**
 * Cadence check: no gap between visual events longer than the bar, except inside a
 * scene that DECLARED its hold (solver holdMs / params.declaredHold), which may run
 * to `declaredHoldMaxSec`. Returns { valid, violations, maxGapSec }.
 */
export function validateCadence(plan, { captions, sfxCueTimesSec = [], bar = QUALITY_BAR } = {}) {
  const events = visualEvents(plan, { captions, sfxCueTimesSec })
  if (events.length === 0) return { valid: false, violations: [{ reason: 'no visual events at all' }], maxGapSec: Infinity }
  const scenes = plan?.scenes || []
  const holdAllowed = (tSec) => {
    const s = scenes.find((x) => tSec >= x.startSec && tSec < (x.endSec ?? x.startSec))
    return s && (s.holdMs > 0 || s.params?.declaredHold === true)
  }
  const end = Math.max(...scenes.map((s) => s.endSec ?? 0), events[events.length - 1].tSec)
  const points = [...events.map((e) => e.tSec), end]
  const violations = []
  let maxGapSec = 0
  for (let i = 1; i < points.length; i++) {
    const gap = points[i] - points[i - 1]
    maxGapSec = Math.max(maxGapSec, gap)
    const limit = holdAllowed(points[i - 1]) ? bar.declaredHoldMaxSec : bar.maxEventGapSec
    if (gap > limit + 1e-9) {
      violations.push({ fromSec: round2(points[i - 1]), toSec: round2(points[i]), gapSec: round2(gap), limitSec: limit, reason: `${round2(gap)}s with nothing changing on screen (limit ${limit}s${limit === bar.declaredHoldMaxSec ? ', declared hold' : ''})` })
    }
  }
  return { valid: violations.length === 0, violations, maxGapSec: round2(maxGapSec) }
}

// ---------------------------------------------------------------------------
// 2. Static-scene detection — pixels, not promises. Minimal PNG decode
// (8-bit RGB/RGBA, non-interlaced — what `remotion still` emits).
// ---------------------------------------------------------------------------

export function decodePng(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('decodePng: not a PNG')
  let pos = 8
  let ihdr = null
  const idat = []
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] }
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (!ihdr) throw new Error('decodePng: no IHDR')
  if (ihdr.bitDepth !== 8 || ![2, 6].includes(ihdr.colorType) || ihdr.interlace !== 0) {
    throw new Error(`decodePng: only 8-bit RGB/RGBA non-interlaced supported (got depth=${ihdr.bitDepth} color=${ihdr.colorType} interlace=${ihdr.interlace})`)
  }
  const bpp = ihdr.colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = ihdr.width * bpp
  const out = Buffer.alloc(ihdr.height * stride)
  for (let y = 0; y < ihdr.height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = x >= bpp && prev ? prev[x - bpp] : 0
      let v = row[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`decodePng: unknown filter ${filter}`)
      cur[x] = v & 0xff
    }
  }
  return { width: ihdr.width, height: ihdr.height, bpp, data: out }
}

/** Mean |Δ| (0..255) between two decoded frames over a sampled grid. */
export function frameDifference(a, b, { grid = 48 } = {}) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('frameDifference: dimensions differ')
  let sum = 0
  let n = 0
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = Math.floor(((gx + 0.5) / grid) * a.width)
      const y = Math.floor(((gy + 0.5) / grid) * a.height)
      const ia = (y * a.width + x) * a.bpp
      const ib = (y * b.width + x) * b.bpp
      sum += Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2])
      n += 3
    }
  }
  return sum / n
}

/**
 * A scene is STATIC when its Gate-B stills (start/mid/end) are all near-identical.
 * `stillsByScene`: { sceneId: [decodedStart, decodedMid, decodedEnd] }.
 * Returns { staticScenes, diffs } — staticScenes block at the bar.
 */
export function detectStaticScenes(stillsByScene, { bar = QUALITY_BAR } = {}) {
  const staticScenes = []
  const diffs = {}
  for (const [sceneId, frames] of Object.entries(stillsByScene)) {
    if (!Array.isArray(frames) || frames.length < 2) continue
    let maxDiff = 0
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) maxDiff = Math.max(maxDiff, frameDifference(frames[i], frames[j]))
    }
    diffs[sceneId] = Math.round(maxDiff * 100) / 100
    if (maxDiff < bar.staticSceneMaxDiff) staticScenes.push(sceneId)
  }
  return { staticScenes, diffs }
}

// ---------------------------------------------------------------------------
// 5. The craft rubric — the VLM scores; the code decides.
// ---------------------------------------------------------------------------

export const CRAFT_RUBRIC = Object.freeze([
  { id: 'composition', weight: 0.2, anchor4: 'Clear focal hierarchy per frame; rule-of-thirds or deliberate center; nothing fights the subject.' },
  { id: 'depth-layering', weight: 0.2, anchor4: 'Foreground/midground/background separation (scrims, parallax, fake-3D drift) — the Kurzgesagt depth trick; never a flat single plane.' },
  { id: 'motion-purpose', weight: 0.25, anchor4: 'Every movement serves the idea (reveal, emphasis, causality); eased, overlapping action; no ambient wiggle for its own sake.' },
  { id: 'type-discipline', weight: 0.15, anchor4: 'Few words, big, kinetic where spoken; no paragraph walls; emphasis words visually distinct.' },
  { id: 'color-hierarchy', weight: 0.1, anchor4: 'Accent color reserved for the ONE thing that matters per frame; palettes differentiate elements, not decorate.' },
  { id: 'polish', weight: 0.1, anchor4: 'No seams, clipping, banding, default-font tells, or placeholder texture; credits present but unobtrusive.' },
])

/** Weighted 0..100 from per-dimension 0..4 scores. Missing dimensions score 0 —
 *  an unevaluated dimension can never help a cut pass. (Rubric v1 — superseded by
 *  RUBRIC_V2 after failing its first calibration test; kept for the ledger record.) */
export function scoreCraft(scores = {}) {
  let total = 0
  const breakdown = {}
  for (const d of CRAFT_RUBRIC) {
    const raw = Math.max(0, Math.min(4, Number(scores[d.id] ?? 0)))
    breakdown[d.id] = raw
    total += (raw / 4) * d.weight * 100
  }
  return { score: Math.round(total * 10) / 10, breakdown }
}

// ---------------------------------------------------------------------------
// RUBRIC v2 — rebuilt after v1 failed calibration (self-scored 78 vs operator 39
// on the same video, 2026-07-12). Three corrections, from first principles:
//  1. Dimensions derive from the VIEWER'S EXPERIENCE, led by visual-ideation —
//     "does this scene SHOW the idea, or decorate the narration with a related
//     object?" — the single biggest separator from the reference class.
//  2. Anchors are EXEMPLARS, not adjectives: 9 = a named reference-class frame
//     (assets/reference-pack/), 3 = a stock-explainer frame. The judge scores our
//     frames AND reference frames in the same blind pass.
//  3. 0–10 scale for discriminative range: a ~50-point true gap must not compress
//     into 10 rubric points. The judge is NEVER the maker.
// ---------------------------------------------------------------------------

export const RUBRIC_V2 = Object.freeze([
  { id: 'visual-ideation', weight: 0.25, question: 'Does each scene visualize the IDEA (mechanism, metaphor, data made visible) rather than decorate the narration with a related object?', anchor9: 'reference-pack: Kurzgesagt/3B1B — the concept itself is drawn and moving', anchor3: 'a related stock photo pans behind captions' },
  { id: 'motion-choreography', weight: 0.2, question: 'Is movement DESIGNED — entrances/exits with anticipation and weight, eased transformations, camera as narrative — or ambient drift?', anchor9: 'reference-pack: overlapping action, motivated camera', anchor3: 'Ken Burns drift + hard cuts, nothing else' },
  { id: 'composition', weight: 0.15, question: 'Is each frame deliberately composed — focal hierarchy, negative space, grid — or laid out by global constants?', anchor9: 'reference-pack: every frame reads as designed', anchor3: 'same layout every scene, text at fixed coordinates' },
  { id: 'world-coherence', weight: 0.1, question: 'Do scenes feel like one visual WORLD (persistent style, palette, texture) or disconnected sourced frames?', anchor9: 'reference-pack: one hand drew everything', anchor3: 'stock assets of varied provenance side by side' },
  { id: 'type-information', weight: 0.1, question: 'Is text an information design system (hierarchy, restraint, kinetic where spoken) or subtitles plus headlines?', anchor9: 'reference-pack: type carries structure', anchor3: 'caption strip + occasional big word' },
  { id: 'av-sync-sound', weight: 0.1, question: 'Is sound MARRIED to motion (every animation has an audio identity; music structure follows the arc) or a bed plus scattered SFX?', anchor9: 'reference-pack: sound design per event, musical builds land on reveals', anchor3: 'looped drone, duck under voice, a few whooshes' },
  { id: 'performance-voice', weight: 0.05, question: 'Does the narration PERFORM (emphasis dynamics, pacing energy, intent) or read?', anchor9: 'directed human-grade delivery', anchor3: 'flat TTS cadence' },
  { id: 'finish', weight: 0.05, question: 'Grade, grain, edge discipline, zero template tells?', anchor9: 'indistinguishable from a funded studio', anchor3: 'default fonts, unaligned margins, raw renders' },
])

/** Weighted 0..100 from per-dimension 0..10 scores (rubric v2). Missing dimensions
 *  score 0 — unevaluated can never help a cut pass. */
export function scoreRubricV2(scores = {}) {
  let total = 0
  const breakdown = {}
  for (const d of RUBRIC_V2) {
    const raw = Math.max(0, Math.min(10, Number(scores[d.id] ?? 0)))
    breakdown[d.id] = raw
    total += (raw / 10) * d.weight * 100
  }
  return { score: Math.round(total * 10) / 10, breakdown, rubricVersion: 'v2' }
}

/** Every dimension id either rubric version knows — critiques cite these. */
export const CRAFT_DIMENSION_IDS = Object.freeze([...new Set([...CRAFT_RUBRIC.map((d) => d.id), ...RUBRIC_V2.map((d) => d.id)])])


/**
 * Judging protocol v2.1 — forced by the calibration ledger (v2 blind judge ran +23
 * vs the operator on hook-lab-c4). Model judges scoring in the ABSOLUTE run
 * lenient: scores cluster 6-8 regardless of quality when the anchor is a described
 * memory instead of a visible artifact. Therefore:
 *  1. COMPARATIVE ONLY: the judge scores our frame side-by-side with a REAL frame
 *     from assets/reference-pack/ for the same scene grammar. No reference frame on
 *     screen => the craft score is INADMISSIBLE (never "score from memory").
 *  2. Frame-level judging may only score frame-level dimensions (stillJudgeable) —
 *     world-coherence, motion, sound, and voice are cut-level and must come from
 *     clips / the full cut.
 *  3. The judge states, per dimension, what the REFERENCE does that ours does not —
 *     a score without that sentence is a vibe, and vibes are inadmissible.
 *  4. SEPARATE CONTEXT (v2.2, forced by hook-lab-c7) — the judge runs with no loop
 *     history, no maker predictions, and unlabeled artifacts. This removes the
 *     maker-as-judge confound from every score. NOTE the first replication: a
 *     separated judge scored c7 within 0.1 of the maker's estimate (65.5 vs 65.4)
 *     against the operator's 55 — so the residual ~+10 at this tier is SYSTEMATIC
 *     model-judge bias, not maker identity. The ledger exists to measure exactly
 *     this; correct via ledger-derived offset once enough operator pairs exist,
 *     never by trusting the judge's absolute number.
 */
export const JUDGE_PROTOCOL = Object.freeze({
  version: 'v2.2',
  comparative: true,
  inadmissibleWithoutReference: true,
  separateContext: true,
  stillJudgeable: Object.freeze(['visual-ideation', 'composition', 'type-information', 'finish']),
})

/** Frame-level rubric score: only stillJudgeable dimensions, weights renormalized.
 *  Cut-level dimensions must be scored from clips/the assembled cut, never stills. */
export function scoreRubricV2Frame(scores = {}) {
  const dims = RUBRIC_V2.filter((d) => JUDGE_PROTOCOL.stillJudgeable.includes(d.id))
  const wTotal = dims.reduce((a, d) => a + d.weight, 0)
  let total = 0
  const breakdown = {}
  for (const d of dims) {
    const raw = Math.max(0, Math.min(10, Number(scores[d.id] ?? 0)))
    breakdown[d.id] = raw
    total += (raw / 10) * (d.weight / wTotal) * 100
  }
  return { score: Math.round(total * 10) / 10, breakdown, rubricVersion: 'v2.1-frame' }
}

// ---------------------------------------------------------------------------
// The calibration ledger — the rubric is a HYPOTHESIS about what the operator
// (later: the audience, via the analytics loop) values. Every judged video records
// (rubricScore, operatorScore); when the rubric stops predicting the operator, the
// rubric revises — never the other way around. The operator score is the target;
// the rubric is only ever the proxy.
// ---------------------------------------------------------------------------

export function recordCalibration(ledger = [], { videoId, rubricVersion, rubricScore, operatorScore, notes } = {}) {
  if (!videoId) throw new Error('recordCalibration: videoId required')
  if (!rubricVersion) throw new Error('recordCalibration: rubricVersion required — unattributed scores cannot revise anything')
  for (const [k, v] of [['rubricScore', rubricScore], ['operatorScore', operatorScore]]) {
    if (!(typeof v === 'number' && v >= 0 && v <= 100)) throw new Error(`recordCalibration: ${k} 0–100 required`)
  }
  return Object.freeze([...ledger, Object.freeze({ videoId, rubricVersion, rubricScore, operatorScore, error: Math.round((rubricScore - operatorScore) * 10) / 10, notes: notes ?? null })])
}

/** Mean absolute error + signed bias of a rubric version against the operator. */
export function calibrationError(ledger = [], { rubricVersion } = {}) {
  const rows = ledger.filter((r) => !rubricVersion || r.rubricVersion === rubricVersion)
  if (rows.length === 0) return { n: 0, meanAbsError: null, bias: null }
  const errs = rows.map((r) => r.error)
  return {
    n: rows.length,
    meanAbsError: Math.round((errs.reduce((a, e) => a + Math.abs(e), 0) / rows.length) * 10) / 10,
    bias: Math.round((errs.reduce((a, e) => a + e, 0) / rows.length) * 10) / 10,
  }
}

/** A rubric whose mean error against the operator exceeds tolerance must revise —
 *  its scores are not admissible as the ship gate's craft input. */
export function rubricNeedsRevision(ledger, { rubricVersion, maxMeanAbsError = 10 } = {}) {
  const e = calibrationError(ledger, { rubricVersion })
  if (e.n === 0) return { revise: false, reason: 'no calibration data yet — collect operator scores' }
  if (e.meanAbsError > maxMeanAbsError) {
    return { revise: true, reason: `mean |error| ${e.meanAbsError} vs operator over ${e.n} video(s) (bias ${e.bias > 0 ? '+' : ''}${e.bias}) exceeds ±${maxMeanAbsError} — the rubric is not measuring what the operator values` }
  }
  return { revise: false, reason: `tracking within ±${maxMeanAbsError} over ${e.n} video(s)` }
}

// ---------------------------------------------------------------------------
// The bar verdict — one object the ship gate consumes.
// ---------------------------------------------------------------------------

/**
 * evaluateQualityBar({ plan, captions, sfxCueTimesSec, stillsByScene, craftScores,
 * runtimeSec }) → { pass, blocking, warnings, metrics }. Everything measurable is
 * measured here; `craftScores` come from the VLM review (per CRAFT_RUBRIC).
 */
export function evaluateQualityBar({ plan, captions = null, sfxCueTimesSec = [], stillsByScene = null, craftScores = null, runtimeSec = null } = {}, bar = QUALITY_BAR) {
  const blocking = []
  const warnings = []
  const metrics = {}

  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length === 0) {
    return { pass: false, blocking: ['no plan to evaluate'], warnings, metrics }
  }

  const cadence = validateCadence(plan, { captions, sfxCueTimesSec, bar })
  metrics.maxEventGapSec = cadence.maxGapSec
  for (const v of cadence.violations) blocking.push(`cadence: ${v.reason} at ${v.fromSec}s–${v.toSec}s`)

  const grammars = new Set(plan.scenes.map((s) => s.params?.sceneType ?? 'photo-caption'))
  metrics.distinctGrammars = grammars.size
  if (plan.scenes.length >= bar.minScenesForVariety && grammars.size < bar.minDistinctGrammars) {
    blocking.push(`grammar variety: ${grammars.size} scene grammar(s) across ${plan.scenes.length} scenes (bar: ≥${bar.minDistinctGrammars}) — a slideshow does not ship`)
  }

  const rt = runtimeSec ?? Math.max(...plan.scenes.map((s) => s.endSec ?? 0))
  metrics.sfxPerMinute = rt > 0 ? Math.round((sfxCueTimesSec.length / rt) * 600) / 10 : 0
  if (rt > 0 && metrics.sfxPerMinute < bar.minSfxPerMinute) {
    blocking.push(`sound density: ${metrics.sfxPerMinute} SFX/min (bar: ≥${bar.minSfxPerMinute}) — visual events should be heard (provisional threshold; strategy sfx-on-visual-events)`)
  }

  if (stillsByScene) {
    const { staticScenes, diffs } = detectStaticScenes(stillsByScene, { bar })
    metrics.stillDiffs = diffs
    for (const id of staticScenes) blocking.push(`static scene: "${id}" — start/mid/end stills are near-identical (maxΔ ${diffs[id]} < ${bar.staticSceneMaxDiff}); nothing on a top channel sits still`)
  } else {
    warnings.push('static-scene detection not run (no stills provided) — run it before ship')
  }

  if (craftScores) {
    const craft = scoreCraft(craftScores)
    metrics.craftScore = craft.score
    metrics.craftBreakdown = craft.breakdown
    if (craft.score < bar.minCraftScore) blocking.push(`craft: ${craft.score}/100 (bar: ≥${bar.minCraftScore}) — see rubric breakdown`)
  } else {
    blocking.push('craft rubric unscored — the bar requires the VLM review (CRAFT_RUBRIC) before ship')
  }

  return { pass: blocking.length === 0, blocking, warnings, metrics }
}

const round2 = (x) => Math.round(x * 100) / 100
