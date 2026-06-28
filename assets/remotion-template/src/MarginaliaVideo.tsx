import React from 'react'
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

// ViewForge motion template (polished + audio-aware + set pieces). Driven entirely by
// ../motion-plan.json + ../script.json, so it renders ANY channel/brand the motion
// department produces. Polish: logo sting, paper grain, animated ink-draw margin rule,
// wax-seal stamp on the payoff, number accenting. Set pieces: a timeline sweep on the
// progression beat and a map-morph border-draw on escalation. Narration (Audio) is
// rendered only when the plan carries an audioFile (no fake human — audio only).

type Tokens = { bg: string; ink: string; accent: string; displayFont: string; bodyFont: string }
type Scene = { beatId: string; startFrame: number; endFrame: number; params: Record<string, any>; tokens: Tokens }
type Plan = { fps: number; scenes: Scene[]; brandName: string; audioFile?: string | null }
type Script = { title: string; beats: { id: string; text: string }[] }

const firstSentence = (t: string) => (t || '').split(/(?<=[.!?])\s/)[0] || ''

const AccentedText: React.FC<{ text: string; ink: string; accent: string }> = ({ text, ink, accent }) => (
  <>
    {text.split(/(\$?[\d,]+(?:\s?(?:million|billion|dollars|percent))?)/i).map((part, i) =>
      /\d/.test(part) ? <span key={i} style={{ color: accent }}>{part}</span> : <span key={i} style={{ color: ink }}>{part}</span>,
    )}
  </>
)

const PaperGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const noise =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
    )
  return <AbsoluteFill style={{ backgroundImage: `url("${noise}")`, opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }} />
}

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

// SET PIECE: a timeline that sweeps across the progression beat with ticking years —
// the visual form of "crazy progression / compress time".
const TimelineSweep: React.FC<{ accent: string; ink: string; durationInFrames: number }> = ({ accent, ink, durationInFrames }) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
  const year = Math.round(1872 + p * 4) // 1872 → ~1876, the two-year loophole window
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <div style={{ position: 'absolute', left: 200, right: 200, bottom: 220, height: 80, opacity: 0.85 }}>
      <div style={{ position: 'absolute', top: 40, left: 0, right: 0, height: 2, background: ink, opacity: 0.3 }} />
      <div style={{ position: 'absolute', top: 40, left: 0, width: `${p * 100}%`, height: 2, background: accent }} />
      {ticks.map((t, i) => (
        <div key={i} style={{ position: 'absolute', top: 32, left: `${t * 100}%`, width: 2, height: 18, background: t <= p ? accent : ink, opacity: t <= p ? 1 : 0.3 }} />
      ))}
      <div style={{ position: 'absolute', top: 0, left: `${p * 100}%`, transform: 'translateX(-50%)', color: accent, fontWeight: 700, fontSize: 34 }}>{year}</div>
    </div>
  )
}

// SET PIECE: a border line that draws itself across the escalation beat (stroke-dash) —
// a cheap, brand-right "map morph" the wow-factor beat can own.
const MapMorph: React.FC<{ accent: string; durationInFrames: number }> = ({ accent, durationInFrames }) => {
  const frame = useCurrentFrame()
  const draw = interpolate(frame, [0, durationInFrames * 0.8], [1, 0], { extrapolateRight: 'clamp' })
  const len = 1400
  return (
    <svg viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
      <path d="M 300 820 C 600 700, 700 900, 1000 760 S 1500 820, 1650 680" fill="none" stroke={accent} strokeWidth={4} strokeDasharray={len} strokeDashoffset={draw * len} />
    </svg>
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
  const { fps, durationInFrames } = useVideoConfig()
  const dur = scene.endFrame - scene.startFrame
  const isHook = scene.beatId === 'hook'
  const isPayoff = scene.beatId === 'payoff'
  const inDur = Math.min(fps * (isHook ? 0.4 : 0.8), dur / 2)
  const opacity = interpolate(frame, [0, inDur, dur - fps * 0.5, dur], [0, 1, 1, 0.85], { extrapolateRight: 'clamp' })
  const rise = interpolate(frame, [0, inDur], [26, 0], { extrapolateRight: 'clamp' })
  const { tokens } = scene

  return (
    <AbsoluteFill style={{ backgroundColor: tokens.bg, justifyContent: 'center', padding: '0 200px' }}>
      <PaperGrain />
      {scene.beatId === 'escalation' && <MapMorph accent={tokens.accent} durationInFrames={durationInFrames} />}
      <MarginRule accent={tokens.accent} />
      <div style={{ transform: `translateY(${rise}px)`, opacity }}>
        <div style={{ color: tokens.ink, opacity: 0.55, fontFamily: tokens.bodyFont, letterSpacing: 10, fontSize: 28, marginBottom: 24 }}>
          {(scene.params && scene.params.brandTag) || 'MARGINALIA'} · {scene.beatId.toUpperCase()}
        </div>
        <div style={{ fontFamily: tokens.displayFont, fontWeight: 700, fontSize: isHook ? 92 : 72, lineHeight: 1.08 }}>
          <AccentedText text={text} ink={tokens.ink} accent={tokens.accent} />
        </div>
      </div>
      {scene.beatId === 'progression' && <TimelineSweep accent={tokens.accent} ink={tokens.ink} durationInFrames={durationInFrames} />}
      {isPayoff && <WaxSeal accent={tokens.accent} ink={tokens.ink} />}
      <div style={{ position: 'absolute', right: 80, bottom: -260, color: tokens.accent, opacity: 0.12, fontSize: 900, fontFamily: tokens.displayFont, fontWeight: 700 }}>,</div>
    </AbsoluteFill>
  )
}

export const MarginaliaVideo: React.FC<{ motionPlan: Plan; script: Script; audioFile?: string | null }> = ({ motionPlan, script, audioFile }) => {
  const textByBeat = new Map(script.beats.map((b) => [b.id, b.text]))
  const bg = motionPlan.scenes[0]?.tokens.bg ?? '#000'
  const stingFrames = Math.round((motionPlan.fps || 30) * 1.4)
  const audio = audioFile ?? motionPlan.audioFile ?? null
  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      {motionPlan.scenes.map((scene) => (
        <Sequence key={scene.beatId} from={scene.startFrame} durationInFrames={scene.endFrame - scene.startFrame}>
          <SceneCard scene={scene} text={firstSentence(textByBeat.get(scene.beatId) || '')} />
        </Sequence>
      ))}
      <Sequence from={0} durationInFrames={stingFrames}>
        <Sting tokens={motionPlan.scenes[0]?.tokens} brandName={motionPlan.brandName || 'MARGINALIA'} />
      </Sequence>
      {/* narration: rendered only when the plan/props supply an audio file (audio only — never a fake human) */}
      {audio ? (
        <Sequence from={stingFrames}>
          <Audio src={staticFile(audio)} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  )
}
