// render-cache.mjs — per-scene render identity, cache planning, and the concat plan
// (Master Doc v2 §6/§22).
//
// Retries and edits should cost ONE SCENE, not the video. A scene render's identity is
// a content hash over everything that determines its pixels+samples:
//
//   renderKey = sha256(sceneJson + brandVersion + assetHashes + rendererVersion)
//
// so a changed scene, brand bump, swapped asset, or renderer upgrade re-renders exactly
// the scenes it touches — and nothing else. Scene renders are then concatenated
// stream-copy style, which is only safe when every segment carries IDENTICAL codec
// params; the concat plan refuses mismatches instead of silently re-encoding.
//
// Uses node:crypto (builtin) — still zero npm dependencies.

import { createHash } from 'node:crypto'

/**
 * Deterministic JSON: object keys sorted at every depth, array order preserved.
 * Rejects values that would make two different inputs serialize identically
 * (NaN/Infinity → null in JSON) or that have no JSON form (function/symbol/bigint) —
 * a render key must never be ambiguous. `undefined` object values are treated as
 * absent (JSON semantics).
 */
export function canonicalJson(value) {
  return JSON.stringify(walk(value))
}

function walk(v, path = '$') {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`canonicalJson: non-finite number at ${path} — key would be ambiguous`)
    return v
  }
  if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') {
    throw new Error(`canonicalJson: ${typeof v} at ${path} has no canonical JSON form`)
  }
  if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`))
  if (typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) {
      if (v[k] === undefined) continue
      out[k] = walk(v[k], `${path}.${k}`)
    }
    return out
  }
  throw new Error(`canonicalJson: unsupported value at ${path}`)
}

/**
 * The render key for one scene (v2 §6). `assetHashes` are content hashes of the
 * scene's binary inputs (captures, images, VO wav); they're SORTED before hashing —
 * a scene's identity is the set of assets, not the order they were listed in.
 */
export function renderKey({ scene, brandVersion, rendererVersion, assetHashes = [] } = {}) {
  if (!scene || typeof scene !== 'object') throw new Error('renderKey: scene object required')
  if (!brandVersion || typeof brandVersion !== 'string') throw new Error('renderKey: brandVersion required — an unversioned brand cannot cache')
  if (!rendererVersion || typeof rendererVersion !== 'string') throw new Error('renderKey: rendererVersion required — renderer upgrades must invalidate')
  if (!Array.isArray(assetHashes) || assetHashes.some((h) => typeof h !== 'string' || !h)) {
    throw new Error('renderKey: assetHashes must be an array of non-empty strings')
  }
  const material = canonicalJson({ scene, brandVersion, rendererVersion, assetHashes: [...assetHashes].sort() })
  return 'sha256:' + createHash('sha256').update(material).digest('hex')
}

/**
 * Plan which scenes actually need rendering. `entries` = [{ id, scene, assetHashes }],
 * `cacheIndex` maps renderKey → cached artifact (anything truthy: a path, metadata).
 * Returns { jobs, toRender, fromCache } where each job is { id, renderKey, cached,
 * artifact }. Only cache MISSES render — a one-scene edit re-renders one scene.
 */
export function planSceneRenders(entries, cacheIndex = {}, { brandVersion, rendererVersion } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('planSceneRenders: entries required')
  const lookup = typeof cacheIndex.get === 'function' ? (k) => cacheIndex.get(k) : (k) => cacheIndex[k]
  const seen = new Set()
  const jobs = entries.map((e) => {
    if (!e?.id) throw new Error('planSceneRenders: every entry needs an id')
    if (seen.has(e.id)) throw new Error(`planSceneRenders: duplicate scene id "${e.id}"`)
    seen.add(e.id)
    const key = renderKey({ scene: e.scene, brandVersion, rendererVersion, assetHashes: e.assetHashes ?? [] })
    const artifact = lookup(key)
    return { id: e.id, renderKey: key, cached: !!artifact, artifact: artifact ?? null }
  })
  return {
    jobs,
    toRender: jobs.filter((j) => !j.cached).map((j) => j.id),
    fromCache: jobs.filter((j) => j.cached).map((j) => j.id),
  }
}

/**
 * Scene-scoped invalidation diff (§22): compare two job lists (by id) and report which
 * scenes went dirty (key changed or new), which are unchanged, and which were removed.
 */
export function dirtyScenes(prevJobs = [], nextJobs = []) {
  const prev = new Map(prevJobs.map((j) => [j.id, j.renderKey]))
  const dirty = []
  const unchanged = []
  for (const j of nextJobs) {
    if (prev.get(j.id) === j.renderKey) unchanged.push(j.id)
    else dirty.push(j.id)
  }
  const nextIds = new Set(nextJobs.map((j) => j.id))
  const removed = [...prev.keys()].filter((id) => !nextIds.has(id))
  return { dirty, unchanged, removed }
}

/**
 * Build the assembly concat plan from finished scene renders:
 *   [{ id, path, startMs, codecParams: {codec, width, height, fps, pixFmt, audioCodec, audioRate} }]
 * Validates every segment exists and carries IDENTICAL codec params (stream-copy
 * concat is only correct then), orders by startMs, and emits the ffmpeg concat-demuxer
 * list. Returns { valid, issues, segments, concatList }.
 */
export function concatPlan(renders) {
  const issues = []
  if (!Array.isArray(renders) || renders.length === 0) return { valid: false, issues: ['no scene renders'], segments: [], concatList: '' }

  for (const r of renders) {
    const tag = r?.id ?? '(no id)'
    if (!r?.path) issues.push(`${tag}: missing rendered file path`)
    if (!(typeof r?.startMs === 'number' && Number.isFinite(r.startMs))) issues.push(`${tag}: missing startMs (resolved timeline order)`)
    if (!r?.codecParams || typeof r.codecParams !== 'object') issues.push(`${tag}: missing codecParams`)
  }
  if (issues.length) return { valid: false, issues, segments: [], concatList: '' }

  const reference = canonicalJson(renders[0].codecParams)
  for (const r of renders.slice(1)) {
    if (canonicalJson(r.codecParams) !== reference) {
      issues.push(`${r.id}: codec params differ from "${renders[0].id}" — stream-copy concat would corrupt; re-render with identical params`)
    }
  }
  if (issues.length) return { valid: false, issues, segments: [], concatList: '' }

  const ordered = [...renders].sort((a, b) => a.startMs - b.startMs)
  const escape = (p) => p.replace(/'/g, `'\\''`)
  return {
    valid: true,
    issues: [],
    segments: ordered.map((r) => ({ id: r.id, path: r.path })),
    concatList: ordered.map((r) => `file '${escape(r.path)}'`).join('\n') + '\n',
  }
}
