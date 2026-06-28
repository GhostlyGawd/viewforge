import React from 'react'
import { AbsoluteFill, Audio, Img, Sequence, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

// Audio-DRIVEN composition: timing comes from captions.json (real per-beat narration
// durations), so word-synced captions and visuals move WITH the voice — continuous
// rhythm instead of static cards. Background is a continuously-moving period photo;
// the current spoken word pops. Music bed ducks under the narration.

type Tokens = { bg: string; ink: string; accent: string; displayFont: string; bodyFont: string }
type BeatT = { beatId: string; startSec: number; durSec: number; words: string[] }
type Captions = { totalSec: number; voice: string; beats: BeatT[] }
type Scene = { beatId: string; tokens: Tokens; assets?: { localFile: string; credit?: string }[] }
type Plan = { fps: number; scenes: Scene[]; brandName: string }

const Grain: React.FC = () => {
  const noise =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)
  return <AbsoluteFill style={{ backgroundImage: `url("${noise}")`, opacity: 0.05, mixBlendMode: 'overlay', pointerEvents: 'none' }} />
}

// Continuously moving background: a period photo with a perpetual Ken-Burns drift, or a
// drifting accent glow when no image is bound. Never static.
const MovingBg: React.FC<{ tokens: Tokens; asset?: { localFile: string; credit?: string }; durationInFrames: number }> = ({ tokens, asset, durationInFrames }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const scale = interpolate(frame, [0, durationInFrames], [1.05, 1.22], { extrapolateRight: 'clamp' })
  const x = interpolate(frame, [0, durationInFrames], [10, -24], { extrapolateRight: 'clamp' })
  const y = interpolate(frame, [0, durationInFrames], [0, -14], { extrapolateRight: 'clamp' })
  const fade = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  if (asset) {
    return (
      <AbsoluteFill style={{ opacity: fade }}>
        <Img src={staticFile('assets/' + asset.localFile)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale}) translate(${x}px,${y}px)`, filter: 'saturate(0.82) contrast(1.04)' }} />
        <AbsoluteFill style={{ background: `linear-gradient(0deg, ${tokens.bg} 4%, ${tokens.bg}b3 38%, ${tokens.bg}59 70%, ${tokens.bg}1a 100%)` }} />
        <Grain />
        {asset.credit ? <div style={{ position: 'absolute', right: 22, top: 16, fontSize: 15, color: tokens.ink, opacity: 0.4, fontFamily: tokens.bodyFont }}>{asset.credit}</div> : null}
      </AbsoluteFill>
    )
  }
  const t = frame / fps
  const gx = 50 + Math.sin(t * 0.5) * 22
  const gy = 45 + Math.cos(t * 0.4) * 16
  return (
    <AbsoluteFill style={{ backgroundColor: tokens.bg, opacity: fade }}>
      <AbsoluteFill style={{ background: `radial-gradient(closest-side at ${gx}% ${gy}%, ${tokens.accent}26, transparent 68%)` }} />
      <Grain />
    </AbsoluteFill>
  )
}

// Word-synced caption: reveals words across the beat in time with the voice; the most
// recent word pops in accent. A rolling window keeps it readable on long beats.
const Captions: React.FC<{ beat: BeatT; tokens: Tokens; durationInFrames: number }> = ({ beat, tokens, durationInFrames }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
  const total = beat.words.length
  const revealed = Math.min(total - 1, Math.floor(progress * total))
  const WINDOW = 12
  const start = Math.max(0, revealed - WINDOW + 1)
  const visible = beat.words.slice(start, revealed + 1)
  return (
    <div style={{ position: 'absolute', left: 150, right: 150, bottom: 180, fontFamily: tokens.displayFont, fontWeight: 700, fontSize: 76, lineHeight: 1.12, display: 'flex', flexWrap: 'wrap', gap: '0 0.26em' }}>
      {visible.map((w, i) => {
        const globalIdx = start + i
        const isCurrent = globalIdx === revealed
        const age = revealed - globalIdx
        const pop = isCurrent ? spring({ frame: frame - (globalIdx / total) * durationInFrames, fps, config: { damping: 12, stiffness: 200 } }) : 1
        const isNum = /\d/.test(w) || /million|dollars/i.test(w)
        return (
          <span key={globalIdx} style={{ display: 'inline-block', transform: `scale(${isCurrent ? 0.9 + pop * 0.12 : 1})`, color: isCurrent || isNum ? tokens.accent : tokens.ink, opacity: Math.max(0.32, 1 - age * 0.06) }}>
            {w}
          </span>
        )
      })}
    </div>
  )
}

export const CaptionVideo: React.FC<{ captions: Captions; plan: Plan }> = ({ captions, plan }) => {
  const fps = plan.fps || 30
  const sceneByBeat = new Map(plan.scenes.map((s) => [s.beatId, s]))
  const tokens = plan.scenes[0]?.tokens
  // bed ducks: narration is ~continuous here, so the bed mostly sits at duck level.
  const segs = captions.beats.map((b) => ({ s: b.startSec, e: b.startSec + b.durSec }))
  const bedVolume = (f: number) => {
    const t = f / fps
    return segs.some((x) => t >= x.s && t < x.e) ? 0.05 : 0.24
  }
  return (
    <AbsoluteFill style={{ backgroundColor: tokens?.bg ?? '#000' }}>
      {captions.beats.map((b) => {
        const scene = sceneByBeat.get(b.beatId)
        const from = Math.round(b.startSec * fps)
        const dur = Math.round(b.durSec * fps)
        return (
          <Sequence key={b.beatId} from={from} durationInFrames={dur}>
            <AbsoluteFill>
              <MovingBg tokens={scene?.tokens ?? tokens} asset={scene?.assets?.[0]} durationInFrames={dur} />
              <div style={{ position: 'absolute', left: 110, top: 90, color: (scene?.tokens ?? tokens).accent, fontSize: 34 }}>☞</div>
              <div style={{ position: 'absolute', left: 152, top: 96, color: (scene?.tokens ?? tokens).ink, opacity: 0.5, letterSpacing: 8, fontSize: 22, fontFamily: (scene?.tokens ?? tokens).bodyFont }}>
                MARGINALIA · {b.beatId.toUpperCase()}
              </div>
              <Captions beat={b} tokens={scene?.tokens ?? tokens} durationInFrames={dur} />
            </AbsoluteFill>
          </Sequence>
        )
      })}
      <Audio src={staticFile('audio/bed.wav')} volume={bedVolume} loop />
      <Audio src={staticFile('narration_v2.wav')} />
    </AbsoluteFill>
  )
}
