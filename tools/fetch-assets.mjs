// fetch-assets.mjs — runtime image sourcing for the imagery pipeline.
//
// Queries Openverse (filtered to commercially-usable + modifiable, which matches our
// license policy) and Library of Congress, normalizes + filters + dedups via the tested
// lib (asset-source/asset-license), downloads the survivors, and writes an auditable
// manifest. Network side-effects live here; the DECISION logic is the tested pure lib.
//
// Usage: node tools/fetch-assets.mjs <outDir> "<query1>" "<query2>" ...
//   e.g. node tools/fetch-assets.mjs .../public/assets "old law book" "vintage fruit crate"

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { normalizeOpenverse, buildManifest, validateManifest } from '../lib/asset-source.mjs'

const UA = 'ViewForge/0.6 (https://github.com/GhostlyGawd/viewforge; research)'

async function openverse(query, perQuery = 6) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license_type=commercial,modification&size=large&page_size=${perQuery}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`openverse ${res.status} for "${query}"`)
  const json = await res.json()
  return (json.results || []).map(normalizeOpenverse)
}

function download(asset, dir) {
  const ext = (asset.url.match(/\.(jpe?g|png|webp|gif)(\?|$)/i)?.[1] || 'jpg').toLowerCase()
  const safe = asset.id.replace(/[^a-z0-9]+/gi, '-')
  const file = path.join(dir, `${safe}.${ext}`)
  execFileSync('curl', ['-fsSL', '--max-time', '40', '-A', UA, asset.url, '-o', file])
  if (fs.statSync(file).size < 3000) {
    fs.rmSync(file, { force: true })
    throw new Error('downloaded file too small')
  }
  return path.basename(file)
}

const [outDir, ...queries] = process.argv.slice(2)
if (!outDir || !queries.length) {
  console.error('usage: node tools/fetch-assets.mjs <outDir> "<query>" ["<query>" ...]')
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })

const raw = []
for (const q of queries) {
  try {
    const items = await openverse(q)
    for (const it of items) raw.push({ ...it, query: q })
    console.log(`openverse "${q}": ${items.length} candidates`)
  } catch (e) {
    console.error(`  fetch failed for "${q}": ${e.message}`)
  }
}

const manifest = buildManifest(raw)
console.log(`after gate+dedup: ${manifest.assets.length} usable (dropped ${manifest.dropped.length})`)

// download the survivors; keep only those that download cleanly
const downloaded = []
for (const a of manifest.assets) {
  try {
    const localFile = download(a, outDir)
    downloaded.push({ ...a, localFile })
    console.log(`  ✓ ${a.license} ${a.width}x${a.height} ${localFile}`)
  } catch (e) {
    console.log(`  ✗ ${a.id}: ${e.message}`)
  }
}

const finalManifest = { assets: downloaded, generatedFor: queries }
const { valid, errors } = validateManifest(finalManifest)
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(finalManifest, null, 2) + '\n')
console.log(`manifest: ${downloaded.length} images, valid=${valid}${valid ? '' : ' — ' + errors.join('; ')}`)
if (!valid) process.exit(1)
