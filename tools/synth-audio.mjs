// synth-audio.mjs — generate a rights-clean ambient music bed + SFX in pure Node.
//
// Generated audio is original work ⇒ CC0, so there is no licensing risk and no API key.
// (The brief's "if you can't find a free one, create it.") The mix levels/ducking are
// applied at render time via lib/audio-mix.mjs; here we just produce clean source WAVs.
//
// Usage: node tools/synth-audio.mjs <outDir> [durationSec]

import fs from 'node:fs'
import path from 'node:path'

const SR = 44100

function writeWav(file, samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2)
  }
  fs.writeFileSync(file, buf)
}

// Calm ambient pad: an open-fifth drone chord with slow tremolo + global fade.
function generateBed(durationSec) {
  const n = Math.floor(durationSec * SR)
  const out = new Float32Array(n)
  const voices = [
    { f: 98.0, a: 0.5 }, // G2
    { f: 146.83, a: 0.4 }, // D3
    { f: 196.0, a: 0.32 }, // G3
    { f: 293.66, a: 0.16 }, // D4 (air)
  ]
  for (let i = 0; i < n; i++) {
    const t = i / SR
    let s = 0
    for (const v of voices) {
      const tremolo = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.08 * t + v.f) // slow shimmer
      const detune = Math.sin(2 * Math.PI * (v.f * 1.003) * t) * 0.15 // gentle chorus
      s += v.a * tremolo * (Math.sin(2 * Math.PI * v.f * t) + detune)
    }
    // global fade in/out
    const fade = Math.min(1, t / 1.5, (durationSec - t) / 1.5)
    out[i] = s * 0.22 * Math.max(0, fade)
  }
  return out
}

// Percussive "comma slam": a low body with fast exponential decay + a short click.
function generateSlam() {
  const dur = 0.4
  const n = Math.floor(dur * SR)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const env = Math.exp(-t * 14)
    const body = Math.sin(2 * Math.PI * 72 * t) // low thud
    const click = i < SR * 0.01 ? (Math.random() * 2 - 1) * 0.6 : 0 // transient
    out[i] = Math.max(-1, Math.min(1, (body * env + click) * 0.9))
  }
  return out
}

const [outDir, durStr] = process.argv.slice(2)
if (!outDir) {
  console.error('usage: node tools/synth-audio.mjs <outDir> [durationSec]')
  process.exit(1)
}
const duration = Number(durStr) || 30
fs.mkdirSync(outDir, { recursive: true })
writeWav(path.join(outDir, 'bed.wav'), generateBed(duration))
writeWav(path.join(outDir, 'slam.wav'), generateSlam())

const manifest = {
  assets: [
    { id: 'bed', localFile: 'bed.wav', kind: 'music', license: 'cc0', source: 'synthesized', sourceUrl: 'viewforge:tools/synth-audio.mjs', attribution: 'ViewForge (generated)' },
    { id: 'slam', localFile: 'slam.wav', kind: 'sfx', license: 'cc0', source: 'synthesized', sourceUrl: 'viewforge:tools/synth-audio.mjs', attribution: 'ViewForge (generated)' },
  ],
}
fs.writeFileSync(path.join(outDir, 'audio-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`synth-audio: wrote bed.wav (${duration}s) + slam.wav + audio-manifest.json (CC0) to ${outDir}`)
