// Brand typography, actually loaded (quality-bar craft: "polish" — no default-font
// tells). The plan's tokens name Fraunces/Inter; without loading them the renderer
// silently falls back to a system serif, which reads as template output.
//
// The faces are EMBEDDED (base64 latin subsets, fonts-data.ts) and constructed as
// buffer-backed FontFace objects, which parse synchronously — no network, no
// promises, no delayRender. Async font loading hangs under Remotion's frozen render
// clock (learned the hard way, 2026-07-12); synchronous loading cannot.
import { FONT_FACES } from './fonts-data'

if (typeof document !== 'undefined' && typeof FontFace !== 'undefined') {
  for (const [family, weight, base64] of FONT_FACES) {
    try {
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const face = new FontFace(family, bytes.buffer, { weight, style: 'normal' })
      document.fonts.add(face)
    } catch (e) {
      console.warn(`brand font ${family} ${weight} failed to load — falling back:`, e)
    }
  }
}
