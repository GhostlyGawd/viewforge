#!/usr/bin/env node
// Refetch the reference pack from assets/reference-pack/manifest.json.
// Frames are research-only (unpublishable by the asset-source gate) and are NOT
// committed — this script makes the pack reproducible on any machine.
//
//   node tools/fetch-reference-pack.mjs           # thumbnails (works anywhere)
//   node tools/fetch-reference-pack.mjs --frames  # mid-video frames via yt-dlp+ffmpeg
//                                                 # (needs a residential IP; YouTube
//                                                 #  PO-token-walls datacenter IPs)
//
// --frames prints the yt-dlp commands per manifest entry instead of running them,
// so the operator chooses the timestamps — a good anchor frame is a curatorial
// decision, not an automated one.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packDir = join(root, 'assets', 'reference-pack')
const manifest = JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf8'))

if (process.argv.includes('--frames')) {
  console.log('# Run these where YouTube is reachable; then update manifest.json (file, sha256, timestamp):')
  for (const f of manifest.frames) {
    console.log(`yt-dlp "${f.sourceUrl}" --download-sections "*MM:SS-MM:SS" -f "bv*[height<=1080]" -o - | ffmpeg -i - -frames:v 1 "${f.file.replace(/\.jpg$/, '-frame.png')}"  # ${f.channel} — ${f.video}`)
  }
  process.exit(0)
}

let failures = 0
for (const f of manifest.frames) {
  const dest = join(packDir, f.file)
  mkdirSync(dirname(dest), { recursive: true })
  try {
    const res = await fetch(f.fetchUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const sha = createHash('sha256').update(buf).digest('hex')
    if (f.sha256 && sha !== f.sha256) {
      console.warn(`CHANGED upstream: ${f.file} (sha ${sha.slice(0, 12)}… ≠ manifest ${f.sha256.slice(0, 12)}…) — inspect before judging against it`)
    }
    writeFileSync(dest, buf)
    console.log(`ok  ${f.file} (${buf.length} bytes)`)
  } catch (err) {
    failures++
    console.error(`FAIL ${f.file}: ${err.message}`)
  }
}
process.exit(failures ? 1 : 0)
