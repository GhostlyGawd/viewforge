import React from 'react'
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

// ViewForge motion template (polished). Driven entirely by ../motion-plan.json +
// ../script.json, so it works for ANY channel/brand the motion department produces —
// the tokens (colors/fonts) and per-scene params come from the plan. Polish here:
// a logo sting, paper-grain texture, an animated ink-draw margin rule per scene, a
// wax-seal stamp on the payoff, and a subtle map-morph drift on escalation.

type Tokens = { bg: string; ink: string; accent: string; displayFont: string; bodyFont: string }
type Scene = { beatId: string; startFrame: number; endFrame: number; params: Record<string, any>; tokens: Tokens }
type Plan = { fps: number; scenes: Scene[]; brandName: string }
type Script = { title: string; beats: { id: string; text: string }[] }

const firstSentence = (t: string) => (t || '').split(/(?<=[.!?])\s/)[0] || ''

// Accent any money/number clause in the parchment text (brand: single vermillion focus).
const AccentedText: React.FC<{ text: string; ink: string; accent: string }> = ({ text, ink, accent }) => (
  <>
    {text.split(/(\$?[\d,]+(?:\s?(?:million|billion|dollars|percent))?)/i).map((part, i) =>
      /\d/.test(part) ? <span key={i} style={{ color: accent }}>{part}</span> : <span key={i} style={{ color: ink }}>{part}</span>,
    )}
  </>
)

// Subtle paper-grain via an SVG turbulence data-URI — cheap, brand-appropriate texture.
const PaperGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const noise =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
    )
  return <AbsoluteFill style={{ backgroundImage: `url("${noise}")`, opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }} />
}

// Animated ink-draw margin rule: grows from 0 to full height over the first ~16 frames.
const MarginRule: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame()
  const h = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <>
      <div style={{ position: 'absolute', left: 150, top: 150, width: 3, height: `${h * 78}%`, background: accent, opacity: 0.55 }} />
      <div style={{ position: 'absolute', left: 110, top: 150, color: accent, fontSize: 40, opacity: interpolate(frame, [4, 14], [0, 1], { extrapolateRight: 'clamp' }) }}>☞</div>
    </>
  )
}

// Wax-seal stamp — springs in on the payoff beat (the "land the promise" moment).
const WaxSeal: React.FC<{ accent: string; ink: string }> = ({ accent, ink }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 12, stiffness: 120 } })
  return (
    <div style={{ position: 'absolute', right: 180, top: 160, width: 150, height: 150, borderRadius: '50%', background: accent, transform: `scale(${s}) rotate(${(1 - s) * -20}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
      <span style={{ color: ink, fontSize: 54 }}>☞</span>
    </div>
  )
}

const Sting: React.FC<{ tokens: Tokens; brandName: string }> = ({ tokens, brandName }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 100 } })
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
  return (
    <AbsoluteFill style={{ backgroundColor: tokens.bg, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <PaperGrain />
      <div style={{ transform: `scale(${0.9 + s * 0.1})`, opacity: s, textAlign: 'center' }}>
        <div style={{ color: tokens.accent, fontSize: 64 }}>☞</div>
        <div style={{ color: tokens.ink, fontFamily: tokens.displayFont, fontWeight: 700, fontSize: 96, letterSpacing: 4 }}>{brandName || 'MARGINALIA'}</div>
        <div style={{ color: tokens.ink, opacity: 0.55, fontFamily: tokens.bodyFont, fontStyle: 'italic', fontSize: 34, marginTop: 8 }}>The footnotes of history — animated.</div>
      </div>
    </AbsoluteFill>
  )
}

const SceneCard: React.FC<{ scene: Scene; text: string }> = ({ scene, text }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const dur = scene.endFrame - scene.startFrame
  const isHook = scene.beatId === 'hook'
  const isPayoff = scene.beatId === 'payoff'
  const isEscalation = scene.beatId === 'escalation'
  const inDur = Math.min(fps * (isHook ? 0.4 : 0.8), dur / 2)
  const opacity = interpolate(frame, [0, inDur, dur - fps * 0.5, dur], [0, 1, 1, 0.85], { extrapolateRight: 'clamp' })
  const rise = interpolate(frame, [0, inDur], [26, 0], { extrapolateRight: 'clamp' })
  // map-morph drift: a slow scale on the comma watermark during escalation.
  const drift = isEscalation ? interpolate(frame, [0, dur], [1, 1.18], { extrapolateRight: 'clamp' }) : 1
  const { tokens } = scene

  return (
    <AbsoluteFill style={{ backgroundColor: tokens.bg, justifyContent: 'center', padding: '0 200px' }}>
      <PaperGrain />
      <MarginRule accent={tokens.accent} />
      <div style={{ transform: `translateY(${rise}px)`, opacity }}>
        <div style={{ color: tokens.ink, opacity: 0.55, fontFamily: tokens.bodyFont, letterSpacing: 10, fontSize: 28, marginBottom: 24 }}>
          {(scene.tokens && (scene as any).brandTag) || 'MARGINALIA'} · {scene.beatId.toUpperCase()}
        </div>
        <div style={{ fontFamily: tokens.displayFont, fontWeight: 700, fontSize: isHook ? 92 : 72, lineHeight: 1.08 }}>
          <AccentedText text={text} ink={tokens.ink} accent={tokens.accent} />
        </div>
      </div>
      {isPayoff && <WaxSeal accent={tokens.accent} ink={tokens.ink} />}
      <div style={{ position: 'absolute', right: 80, bottom: -260, color: tokens.accent, opacity: 0.12, fontSize: 900, fontFamily: tokens.displayFont, fontWeight: 700, transform: `scale(${drift})` }}>,</div>
    </AbsoluteFill>
  )
}

export const MarginaliaVideo: React.FC<{ motionPlan: Plan; script: Script }> = ({ motionPlan, script }) => {
  const textByBeat = new Map(script.beats.map((b) => [b.id, b.text]))
  const bg = motionPlan.scenes[0]?.tokens.bg ?? '#000'
  const stingFrames = Math.round((motionPlan.fps || 30) * 1.4)
  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      {motionPlan.scenes.map((scene) => (
        <Sequence key={scene.beatId} from={scene.startFrame} durationInFrames={scene.endFrame - scene.startFrame}>
          <SceneCard scene={scene} text={firstSentence(textByBeat.get(scene.beatId) || '')} />
        </Sequence>
      ))}
      {/* logo sting overlays the first ~1.4s */}
      <Sequence from={0} durationInFrames={stingFrames}>
        <Sting tokens={motionPlan.scenes[0]?.tokens} brandName={motionPlan.brandName || 'MARGINALIA'} />
      </Sequence>
    </AbsoluteFill>
  )
}
