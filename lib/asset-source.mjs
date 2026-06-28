// asset-source.mjs — normalize image-API results into a common Asset shape, filter to
// rights-clean + high-enough resolution, dedup, and build an auditable provenance
// manifest. The network fetch lives in tools/fetch-assets.mjs; the decision logic here
// is pure so it's property/BDD-testable.

import { describeLicense, isUsable } from './asset-license.mjs'

export const MIN_LONG_EDGE = 1280 // a 1080p frame; smaller images look soft full-screen

/** Common Asset shape: { id, title, url, thumbnail, source, sourceUrl, license,
 *  attribution, width, height, beatId? } */

/** Normalize an Openverse API item. */
export function normalizeOpenverse(item) {
  return {
    id: `openverse:${item.id}`,
    title: item.title || 'untitled',
    url: item.url,
    thumbnail: item.thumbnail || item.url,
    source: 'openverse',
    sourceUrl: item.foreign_landing_url || item.url,
    license: [item.license, item.license_version].filter(Boolean).join('-'),
    attribution: item.attribution || item.creator || null,
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
  }
}

/** Normalize a Library of Congress item (rights vary; map their rights field). */
export function normalizeLoc(item) {
  const img = (item.image_url && item.image_url[item.image_url.length - 1]) || item.url
  return {
    id: `loc:${item.id || item.url}`,
    title: (Array.isArray(item.title) ? item.title[0] : item.title) || 'untitled',
    url: img,
    thumbnail: (item.image_url && item.image_url[0]) || img,
    source: 'loc',
    sourceUrl: item.url || item.id,
    license: item.rights || item.rights_advisory || 'no known restrictions',
    attribution: 'Library of Congress',
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
  }
}

const longEdge = (a) => Math.max(Number(a.width) || 0, Number(a.height) || 0)

/** Keep only assets that pass the license gate AND meet the resolution floor. */
export function filterUsable(assets, { minLongEdge = MIN_LONG_EDGE } = {}) {
  const kept = []
  const dropped = []
  for (const a of assets) {
    if (!a || !a.url) {
      dropped.push({ asset: a, reason: 'missing url' })
      continue
    }
    if (!a.source || !a.sourceUrl) {
      dropped.push({ asset: a, reason: 'missing provenance (source/sourceUrl)' })
      continue
    }
    if (!isUsable(a.license, { attribution: a.attribution })) {
      dropped.push({ asset: a, reason: `license not usable: ${describeLicense(a.license).id}${describeLicense(a.license).requiresAttribution && !a.attribution ? ' (attribution missing)' : ''}` })
      continue
    }
    if (longEdge(a) < minLongEdge) {
      dropped.push({ asset: a, reason: `resolution ${a.width}x${a.height} below ${minLongEdge}px` })
      continue
    }
    kept.push(a)
  }
  return { kept, dropped }
}

/** Dedup by id, then by url (first occurrence wins). */
export function dedupeAssets(assets) {
  const seenId = new Set()
  const seenUrl = new Set()
  const out = []
  for (const a of assets) {
    if (seenId.has(a.id) || seenUrl.has(a.url)) continue
    seenId.add(a.id)
    seenUrl.add(a.url)
    out.push(a)
  }
  return out
}

/**
 * Build a manifest from raw normalized assets: filter to usable+resolution, dedup, and
 * return { assets, dropped, count }. Every asset in `assets` is rights-clean + auditable.
 */
export function buildManifest(assets, opts = {}) {
  const { kept, dropped } = filterUsable(assets, opts)
  const deduped = dedupeAssets(kept)
  return { assets: deduped, dropped, count: deduped.length }
}

/**
 * Validate a manifest (or its assets): every asset must be usable-licensed, carry
 * source + sourceUrl + license, attribution when the license requires it, and meet the
 * resolution floor. Returns { valid, errors }.
 */
export function validateManifest(manifest, { minLongEdge = MIN_LONG_EDGE } = {}) {
  const errors = []
  const assets = Array.isArray(manifest) ? manifest : manifest?.assets
  if (!Array.isArray(assets)) return { valid: false, errors: ['manifest has no assets array'] }
  const ids = new Set()
  for (const a of assets) {
    const tag = a?.id || a?.url || '(no id)'
    if (!a?.source || !a?.sourceUrl) errors.push(`${tag}: missing source/sourceUrl (not auditable)`)
    if (!a?.license) errors.push(`${tag}: missing license`)
    const d = describeLicense(a?.license)
    if (!d.usable) errors.push(`${tag}: license ${d.id} not usable`)
    if (d.requiresAttribution && !(a?.attribution && String(a.attribution).trim())) errors.push(`${tag}: ${d.id} requires attribution`)
    if (longEdge(a || {}) < minLongEdge) errors.push(`${tag}: below resolution floor`)
    if (ids.has(a?.id)) errors.push(`${tag}: duplicate id`)
    ids.add(a?.id)
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Bind manifest assets to a motion plan's scenes (immutably). `bindings` maps a beatId
 * to an array of asset ids. THROWS if a binding references an id not in the manifest —
 * a scene can never point at an asset that didn't pass the gate. Returns a new plan.
 */
export function bindAssetsToPlan(plan, manifest, bindings = {}) {
  const ids = new Set((manifest?.assets || []).map((a) => a.id))
  for (const [beatId, list] of Object.entries(bindings)) {
    for (const id of list) if (!ids.has(id)) throw new Error(`bindAssetsToPlan: scene "${beatId}" references asset "${id}" not in the manifest`)
  }
  return {
    ...plan,
    scenes: (plan.scenes || []).map((s) => (bindings[s.beatId] ? { ...s, assets: [...bindings[s.beatId]] } : s)),
  }
}

/**
 * Validate that every asset a plan's scenes reference exists in the manifest.
 * Returns { valid, errors }. (A3.)
 */
export function validatePlanAssets(plan, manifest) {
  const errors = []
  const ids = new Set((manifest?.assets || []).map((a) => a.id))
  for (const s of plan?.scenes || []) {
    // a scene asset may be a bare id string or an object carrying { id, localFile, ... }
    for (const a of s.assets || []) {
      const id = typeof a === 'string' ? a : a?.id
      if (!ids.has(id)) errors.push(`scene "${s.beatId}" references unlisted asset "${id}"`)
    }
  }
  return { valid: errors.length === 0, errors }
}

export { longEdge }
