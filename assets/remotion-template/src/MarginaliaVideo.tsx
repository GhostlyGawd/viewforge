import React from 'react'
import { AbsoluteFill, Audio, Sequence, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

// Marginalia EP.01 — upgraded for ENERGY: living background, kinetic headlines that
// slam in, a money counter that ticks to $40M, and a comma-split set piece that shows
// the actual mechanism. Driven by ../motion-plan.json + ../script.json; audio only
// (never a fake human).

type Tokens = { bg: string; ink: string; accent: string; displayFont: string; bodyFont: string }
type Scene = { beatId: string; startFrame: number; endFrame: number; params: Record<string, any>; tokens: Tokens }
type Plan = { fps: number; scenes: Scene[]; brandName: string; audioFile?: string | null }
type Script = { title: string; beats: { id: string; text: string }[] }

const firstSentence = (t: string) => (t || '').split(/(?<=[.!?])\s/)[0] || ''

// Living background: a slow-drifting accent glow + paper grain, so frames are never dead flat.
const LivingBg: React.FC<{ tokens: Tokens; energy?: number }> = ({ tokens, energy = 1 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps
  const x = 50 + Math.sin(t * 0.4) * 18 * energy
  const y = 42 + Math.cos(t * 0.3) * 14 * energy
  const noise =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
    )
  return (
    <AbsoluteFill style={{ backgroundColor: tokens.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(closest-side at ${x}% ${y}%, ${tokens.accent}22, transparent 70%)` }} />
      <AbsoluteFill style={{ backgroundImage: `url("${noise}")`, opacity: 0.05, mixBlendMode: 'overlay' }} />
    </AbsoluteFill>
  )
}

const MarginRule: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame()
  const h = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' })
  return (
    <>
      <div style={{ position: 'absolute', left: 130, top: 130, width: 3, height: `${h * 80}%`, background: accent, opacity: 0.55 }} />
      <div style={{ position: 'absolute', left: 92, top: 130, color: accent, fontSize: 38, opacity: interpolate(frame, [4, 14], [0, 1], { extrapolateRight: 'clamp' }) }}>☞</div>
    </>
  )
}

// Kinetic headline: each word springs up in sequence; number/emphasis words scale + accent.
const Kinetic: React.FC<{ text: string; tokens: Tokens; size: number }> = ({ text, tokens, size }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const words = text.split(' ')
  return (
    <div style={{ fontFamily: tokens.displayFont, fontWeight: 700, fontSize: size, lineHeight: 1.06, display: 'flex', flexWrap: 'wrap', gap: '0 0.28em', maxWidth: 1400 }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - i * 3, fps, config: { damping: 16, stiffness: 140 } })
        const isNum = /\d/.test(w) || /million|dollars/i.test(w)
        return (
          <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - s) * 28}px) scale(${0.96 + s * 0.04})`, opacity: s, color: isNum ? tokens.accent : tokens.ink }}>
            {w}
          </span>
        )
      })}
    </div>
  )
}

// Money counter: ticks $0 → target, odometer feel, with a pulse on settle.
const MoneyCounter: React.FC<{ target: number; tokens: Tokens; startFrame?: number; runFrames?: number }> = ({ target, tokens, startFrame = 0, runFrames = 60 }) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [startFrame, startFrame + runFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  const val = Math.round(target * p)
  const pulse = interpolate(frame, [startFrame + runFrames, startFrame + runFrames + 8, startFrame + runFrames + 18], [1, 1.08, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ fontFamily: tokens.displayFont, fontWeight: 700, fontSize: 200, color: tokens.accent, transform: `scale(${pulse})`, letterSpacing: -4, textShadow: `0 0 60px ${tokens.accent}55` }}>
      ${val.toLocaleString('en-US')}
    </div>
  )
}

// Comma-split set piece: "fruit plants" → comma slams in → splits into two meanings.
const CommaSplit: React.FC<{ tokens: Tokens }> = ({ tokens }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const slam = spring({ frame: frame - 18, fps, config: { damping: 9, stiffness: 200 } })
  const split = interpolate(frame, [40, 75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
  const dx = split * 230
  return (
    <div style={{ position: 'relative', fontFamily: tokens.displayFont, fontWeight: 700, fontSize: 150, color: tokens.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
      <span style={{ transform: `translateX(${-dx}px)` }}>fruit</span>
      <span style={{ display: 'inline-block', width: 60, textAlign: 'center', color: tokens.accent, transform: `scale(${slam}) translateY(${(1 - slam) * -120}px)`, opacity: slam }}>,</span>
      <span style={{ transform: `translateX(${dx}px)` }}>plants</span>
      {split > 0.5 && (
        <div style={{ position: 'absolute', bottom: -70, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 240px', opacity: interpolate(frame, [70, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), fontSize: 34, fontFamily: tokens.bodyFont, color: tokens.ink }}>
          <span style={{ opacity: 0.7 }}>= cheap seedlings</span>
          <span style={{ color: tokens.accent }}>= ALL imported fruit, tax-free</span>
        </div>
      )}
    </div>
  )
}

const TimelineSweep: React.FC<{ accent: string; ink: string; durationInFrames: number }> = ({ accent, ink, durationInFrames }) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' })
  const year = Math.round(1872 + p * 4)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <div style={{ position: 'absolute', left: 200, right: 200, bottom: 200, height: 80, opacity: 0.9 }}>
      <div style={{ position: 'absolute', top: 40, left: 0, right: 0, height: 2, background: ink, opacity: 0.3 }} />
      <div style={{ position: 'absolute', top: 40, left: 0, width: `${p * 100}%`, height: 2, background: accent }} />
      {ticks.map((t, i) => (
        <div key={i} style={{ position: 'absolute', top: 32, left: `${t * 100}%`, width: 2, height: 18, background: t <= p ? accent : ink, opacity: t <= p ? 1 : 0.3 }} />
      ))}
      <div style={{ position: 'absolute', top: 0, left: `${p * 100}%`, transform: 'translateX(-50%)', color: accent, fontWeight: 700, fontSize: 34 }}>{year}</div>
    </div>
  )
}

// Bar race of the famous comma cases (escalation beat).
const CaseBars: React.FC<{ tokens: Tokens; durationInFrames: number }> = ({ tokens, durationInFrames }) => {
  const frame = useCurrentFrame()
  const cases = [
    { label: 'Rogers', v: 2.13 },
    { label: 'Oakhurst', v: 5 },
    { label: '1872 Tariff', v: 40 },
    { label: 'Lockheed', v: 70 },
  ]
  const max = 70
  return (
    <div style={{ position: 'absolute', right: 160, bottom: 200, display: 'flex', gap: 28, alignItems: 'flex-end', height: 360 }}>
      {cases.map((c, i) => {
        const g = interpolate(frame, [i * 8, i * 8 + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
        const h = (c.v / max) * 320 * g
        return (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ color: tokens.ink, fontSize: 22, opacity: 0.8, marginBottom: 8 }}>${c.v}M</div>
            <div style={{ width: 70, height: h, background: c.label === '1872 Tariff' ? tokens.accent : tokens.ink, opacity: c.label === '1872 Tariff' ? 1 : 0.4, borderRadius: 4 }} />
            <div style={{ color: tokens.ink, fontSize: 18, opacity: 0.6, marginTop: 8 }}>{c.label}</div>
          </div>
        )
      })}
    </div>
  )
}

const WaxSeal: React.FC<{ accent: string; ink: string }> = ({ accent, ink }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 11, stiffness: 130 } })
  return (
    <div style={{ position: 'absolute', right: 200, top: 150, width: 160, height: 160, borderRadius: '50%', background: accent, transform: `scale(${s}) rotate(${(1 - s) * -25}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
      <span style={{ color: ink, fontSize: 60 }}>☞</span>
    </div>
  )
}

const Sting: React.FC<{ tokens: Tokens; brandName: string }> = ({ tokens, brandName }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const s = spring({ frame, fps, config: { damping: 13, stiffness: 110 } })
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <LivingBg tokens={tokens} energy={0.4} />
      <div style={{ transform: `scale(${0.88 + s * 0.12})`, opacity: s, textAlign: 'center' }}>
        <div style={{ color: tokens.accent, fontSize: 70 }}>☞</div>
        <div style={{ color: tokens.ink, fontFamily: tokens.displayFont, fontWeight: 700, fontSize: 100, letterSpacing: 4 }}>{brandName || 'MARGINALIA'}</div>
        <div style={{ color: tokens.ink, opacity: 0.55, fontFamily: tokens.bodyFont, fontStyle: 'italic', fontSize: 34, marginTop: 8 }}>The footnotes of history — animated.</div>
      </div>
    </AbsoluteFill>
  )
}

const SceneCard: React.FC<{ scene: Scene; text: string }> = ({ scene, text }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const dur = scene.endFrame - scene.startFrame
  const { tokens, beatId } = scene
  const headSize = beatId === 'hook' ? 96 : 70
  const fade = interpolate(frame, [dur - 12, dur], [1, 0.7], { extrapolateLeft: 'clamp' })

  // money counter only after the headline lands, in the hook
  const showMoney = beatId === 'hook'

  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 170px', opacity: fade }}>
      <LivingBg tokens={tokens} energy={beatId === 'hook' || beatId === 'escalation' ? 1.2 : 0.7} />
      {beatId === 'escalation' && <CaseBars tokens={tokens} durationInFrames={durationInFrames} />}
      <MarginRule accent={tokens.accent} />
      <div style={{ color: tokens.ink, opacity: 0.5, fontFamily: tokens.bodyFont, letterSpacing: 10, fontSize: 26, marginBottom: 22 }}>
        MARGINALIA · {beatId.toUpperCase()}
      </div>
      {beatId === 'show-dont-tell' ? (
        <CommaSplit tokens={tokens} />
      ) : (
        <Kinetic text={text} tokens={tokens} size={headSize} />
      )}
      {showMoney && (
        <div style={{ marginTop: 40, opacity: interpolate(frame, [70, 95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <MoneyCounter target={40000000} tokens={tokens} startFrame={75} runFrames={120} />
        </div>
      )}
      {beatId === 'progression' && <TimelineSweep accent={tokens.accent} ink={tokens.ink} durationInFrames={durationInFrames} />}
      {beatId === 'payoff' && <WaxSeal accent={tokens.accent} ink={tokens.ink} />}
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
      {audio ? (
        <Sequence from={stingFrames}>
          <Audio src={staticFile(audio)} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  )
}
