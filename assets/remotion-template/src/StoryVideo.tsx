import React from 'react'
import { AbsoluteFill, Audio, Img, Sequence, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { LivingBg, MarginRule, MoneyCounter, CommaSplit, TimelineSweep, CaseBars, WaxSeal, Sting } from './MarginaliaVideo'

// StoryVideo — the COMPOSED cut (Master Doc v2 §5/§19/§20): audio-first timing +
// word-synced captions (CaptionVideo's strengths) woven with the set-piece library
// (MarginaliaVideo's strengths), driven by each scene's `params.sceneType` from the
// motion plan. One grammar repeated is a slideshow; a grammar PER BEAT — kinetic
// open, mechanism, timeline, reveal, counter, chart, payoff — is a video. Beats also
// cut WITHIN themselves (params.cutsPerScene finally drives real cuts across
// scene.assets[]), so no shot outstays its welcome.

type Tokens = { bg: string; ink: string; accent: string; displayFont: string; bodyFont: string }
type AssetT = { id?: string; localFile: string; credit?: string }
type BeatT = { beatId: string; startSec: number; durSec: number; words: string[]; revealSec?: number[] }
type Captions = { totalSec: number; voice: string; beats: BeatT[] }
type Scene = { beatId: string; startSec: number; endSec: number; params: Record<string, any>; tokens: Tokens; assets?: AssetT[] }
type Plan = { fps: number; scenes: Scene[]; brandName: string; audioFile?: string | null }

export const STORY_STING_SEC = 1.2
const EMPH = /\d|million|dollars|comma|free/i

// ---- word-sync primitives (lib/caption-timing.mjs is the tested spec) ----

const revealTimes = (beat: BeatT, durSec: number) =>
  beat.revealSec && beat.revealSec.length === beat.words.length ? beat.revealSec : beat.words.map((_, i) => (i / beat.words.length) * durSec)

const revealedAt = (times: number[], tSec: number) => {
  let idx = -1
  for (let i = 0; i < times.length; i++) {
    if (times[i] <= tSec + 1e-9) idx = i
    else break
  }
  return idx
}

// Bottom captions, word-synced, parameterized so scene types can restyle them.
const WordCaptions: React.FC<{ beat: BeatT; tokens: Tokens; size?: number; bottom?: number; right?: number }> = ({ beat, tokens, size = 72, bottom = 170, right = 150 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const times = revealTimes(beat, beat.durSec)
  const revealed = revealedAt(times, frame / fps)
  if (revealed < 0) return null
  const start = Math.max(0, revealed - 11)
  return (
    <div style={{ position: 'absolute', left: 150, right, bottom, fontFamily: tokens.displayFont, fontWeight: 700, fontSize: size, lineHeight: 1.12, display: 'flex', flexWrap: 'wrap', gap: '0 0.26em' }}>
      {beat.words.slice(start, revealed + 1).map((w, i) => {
        const gi = start + i
        const isCurrent = gi === revealed
        const pop = isCurrent ? spring({ frame: frame - Math.round(times[gi] * fps), fps, config: { damping: 12, stiffness: 200 } }) : 1
        return (
          <span key={gi} style={{ display: 'inline-block', transform: `scale(${isCurrent ? 0.9 + pop * 0.12 : 1})`, color: isCurrent || EMPH.test(w) ? tokens.accent : tokens.ink, opacity: Math.max(0.34, 1 - (revealed - gi) * 0.06), textShadow: `0 2px 18px ${tokens.bg}` }}>
            {w}
          </span>
        )
      })}
    </div>
  )
}

// Center-stage kinetic type, each word springing in AS IT IS SPOKEN (revealSec).
const KineticSync: React.FC<{ beat: BeatT; tokens: Tokens; size?: number }> = ({ beat, tokens, size = 92 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const times = revealTimes(beat, beat.durSec)
  return (
    <div style={{ position: 'absolute', left: 170, right: 170, top: '30%', fontFamily: tokens.displayFont, fontWeight: 700, fontSize: size, lineHeight: 1.1, display: 'flex', flexWrap: 'wrap', gap: '0 0.28em' }}>
      {beat.words.map((w, i) => {
        const s = spring({ frame: frame - Math.round(times[i] * fps), fps, config: { damping: 13, stiffness: 170 } })
        const isNum = EMPH.test(w)
        return (
          <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - s) * 34}px) scale(${isNum ? 0.9 + s * 0.22 : 0.96 + s * 0.04})`, opacity: s, color: isNum ? tokens.accent : tokens.ink, textShadow: `0 2px 24px ${tokens.bg}` }}>
            {w}
          </span>
        )
      })}
    </div>
  )
}

// Hard cuts across the beat's bound images — cutsPerScene drives REAL cuts, each
// segment with an alternating Ken-Burns direction so nothing sits still.
const PhotoCuts: React.FC<{ assets: AssetT[]; tokens: Tokens; durationInFrames: number; cuts?: number; dim?: number }> = ({ assets, tokens, durationInFrames, cuts = 4, dim = 0.55 }) => {
  const frame = useCurrentFrame()
  if (!assets.length) return <LivingBg tokens={tokens} energy={1} />
  const n = Math.max(1, Math.min(cuts, assets.length * 3))
  const segLen = durationInFrames / n
  const seg = Math.min(n - 1, Math.floor(frame / segLen))
  const local = frame - seg * segLen
  const p = local / segLen
  const dir = seg % 2 === 0 ? 1 : -1
  const scale = seg % 3 === 2 ? 1.24 - 0.14 * p : 1.06 + 0.16 * p // every third segment pulls OUT
  const x = dir * (16 - 32 * p)
  const a = assets[seg % assets.length]
  const fadeIn = seg === 0 ? interpolate(local, [0, 10], [0, 1], { extrapolateRight: 'clamp' }) : 1
  // fake-3D depth (Kurzgesagt school; quality-bar craft "depth-layering"): a
  // foreground vignette + accent air that PARALLAXES against the photo's pan, so
  // the frame reads as layered space rather than a flat card.
  const fgx = -dir * (10 - 20 * p)
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Img src={staticFile('assets/' + a.localFile)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale}) translateX(${x}px)`, filter: 'saturate(0.84) contrast(1.04)' }} />
      <AbsoluteFill style={{ background: `linear-gradient(0deg, ${tokens.bg} 5%, ${tokens.bg}b8 36%, ${tokens.bg}${Math.round(dim * 255).toString(16).padStart(2, '0')} 70%, ${tokens.bg}26 100%)` }} />
      <AbsoluteFill style={{ transform: `translateX(${fgx}px)`, background: `radial-gradient(120% 90% at ${dir > 0 ? 8 : 92}% 110%, ${tokens.accent}1f, transparent 55%)` }} />
      <AbsoluteFill style={{ boxShadow: `inset 0 0 220px 40px ${tokens.bg}e6`, pointerEvents: 'none' }} />
      {a.credit ? <div style={{ position: 'absolute', right: 22, top: 16, fontSize: 15, color: tokens.ink, opacity: 0.42, fontFamily: tokens.bodyFont }}>{a.credit}</div> : null}
    </AbsoluteFill>
  )
}

// Fast push-in reveal with a 3-frame accent flash — the re-engagement spike.
const RevealPush: React.FC<{ asset?: AssetT; tokens: Tokens; durationInFrames: number }> = ({ asset, tokens, durationInFrames }) => {
  const frame = useCurrentFrame()
  const scale = interpolate(frame, [0, 14, durationInFrames], [1.3, 1.12, 1.2], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' })
  const flash = interpolate(frame, [0, 3, 9], [0.55, 0.3, 0], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      {asset ? (
        <>
          <Img src={staticFile('assets/' + asset.localFile)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`, filter: 'saturate(0.84) contrast(1.05)' }} />
          <AbsoluteFill style={{ background: `linear-gradient(0deg, ${tokens.bg} 5%, ${tokens.bg}a6 40%, ${tokens.bg}33 100%)` }} />
          {asset.credit ? <div style={{ position: 'absolute', right: 22, top: 16, fontSize: 15, color: tokens.ink, opacity: 0.42, fontFamily: tokens.bodyFont }}>{asset.credit}</div> : null}
        </>
      ) : (
        <LivingBg tokens={tokens} energy={1.2} />
      )}
      <AbsoluteFill style={{ background: tokens.accent, opacity: flash, mixBlendMode: 'screen' }} />
    </AbsoluteFill>
  )
}

// End card: soft hand-off, brand mark, no hard stop.
const EndCard: React.FC<{ tokens: Tokens; brandName: string; durationInFrames: number }> = ({ tokens, brandName, durationInFrames }) => {
  const frame = useCurrentFrame()
  const inAt = durationInFrames - 40
  const o = interpolate(frame, [inAt, inAt + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: o, background: `${tokens.bg}cc` }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: tokens.accent, fontSize: 56 }}>☞</div>
        <div style={{ color: tokens.ink, fontFamily: tokens.displayFont, fontWeight: 700, fontSize: 72, letterSpacing: 3 }}>{brandName}</div>
        <div style={{ color: tokens.ink, opacity: 0.6, fontFamily: tokens.bodyFont, fontStyle: 'italic', fontSize: 28, marginTop: 6 }}>The footnotes of history — animated.</div>
      </div>
    </AbsoluteFill>
  )
}

// ---- the scene grammar: params.sceneType → treatment ----

const StoryScene: React.FC<{ scene: Scene; beat: BeatT; brandName: string; durationInFrames: number }> = ({ scene, beat, brandName, durationInFrames }) => {
  const frame = useCurrentFrame()
  const { tokens, params } = scene
  const assets = scene.assets || []
  const type = params?.sceneType || 'photo-caption'
  const cuts = params?.cutsPerScene ?? 4
  const chip = (
    <div style={{ position: 'absolute', left: 152, top: 96, color: tokens.ink, opacity: 0.5, letterSpacing: 8, fontSize: 22, fontFamily: tokens.bodyFont }}>
      {brandName.toUpperCase()} · {scene.beatId.toUpperCase()}
    </div>
  )

  switch (type) {
    case 'kinetic-open':
      return (
        <AbsoluteFill>
          <PhotoCuts assets={assets} tokens={tokens} durationInFrames={durationInFrames} cuts={cuts} dim={0.72} />
          {chip}
          <MarginRule accent={tokens.accent} />
          <KineticSync beat={beat} tokens={tokens} size={96} />
        </AbsoluteFill>
      )
    case 'mechanism':
      return (
        <AbsoluteFill>
          <PhotoCuts assets={assets} tokens={tokens} durationInFrames={durationInFrames} cuts={1} dim={0.85} />
          {chip}
          <AbsoluteFill style={{ justifyContent: 'center' }}>
            <CommaSplit tokens={tokens} />
          </AbsoluteFill>
          <WordCaptions beat={beat} tokens={tokens} size={44} bottom={110} />
        </AbsoluteFill>
      )
    case 'timeline':
      return (
        <AbsoluteFill>
          <PhotoCuts assets={assets} tokens={tokens} durationInFrames={durationInFrames} cuts={cuts} />
          {chip}
          <TimelineSweep accent={tokens.accent} ink={tokens.ink} durationInFrames={durationInFrames} />
          <WordCaptions beat={beat} tokens={tokens} size={64} bottom={310} />
        </AbsoluteFill>
      )
    case 'reveal':
      return (
        <AbsoluteFill>
          <RevealPush asset={assets[0]} tokens={tokens} durationInFrames={durationInFrames} />
          {chip}
          <WordCaptions beat={beat} tokens={tokens} size={76} />
        </AbsoluteFill>
      )
    case 'counter':
      return (
        <AbsoluteFill>
          <PhotoCuts assets={assets} tokens={tokens} durationInFrames={durationInFrames} cuts={2} dim={0.7} />
          {chip}
          <div style={{ position: 'absolute', right: 150, top: 130, transform: 'scale(0.55)', transformOrigin: 'top right' }}>
            <MoneyCounter target={40000000} tokens={tokens} startFrame={0} runFrames={durationInFrames} />
          </div>
          <WordCaptions beat={beat} tokens={tokens} size={68} />
        </AbsoluteFill>
      )
    case 'chart':
      return (
        <AbsoluteFill>
          <PhotoCuts assets={assets} tokens={tokens} durationInFrames={durationInFrames} cuts={2} dim={0.8} />
          {chip}
          <CaseBars tokens={tokens} durationInFrames={durationInFrames} />
          <WordCaptions beat={beat} tokens={tokens} size={56} bottom={170} right={900} />
        </AbsoluteFill>
      )
    case 'money-payoff': {
      const settle = Math.round(durationInFrames * 0.55)
      return (
        <AbsoluteFill>
          <PhotoCuts assets={assets} tokens={tokens} durationInFrames={durationInFrames} cuts={1} dim={0.85} />
          {chip}
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
            <MoneyCounter target={40000000} tokens={tokens} startFrame={6} runFrames={settle} />
          </AbsoluteFill>
          {frame > settle + 8 ? <WaxSeal accent={tokens.accent} ink={tokens.ink} /> : null}
          <WordCaptions beat={beat} tokens={tokens} size={44} bottom={110} />
        </AbsoluteFill>
      )
    }
    case 'recap':
      return (
        <AbsoluteFill>
          <PhotoCuts assets={assets} tokens={tokens} durationInFrames={durationInFrames} cuts={1} />
          {chip}
          <WordCaptions beat={beat} tokens={tokens} size={64} />
          <EndCard tokens={tokens} brandName={brandName} durationInFrames={durationInFrames} />
        </AbsoluteFill>
      )
    default:
      return (
        <AbsoluteFill>
          <PhotoCuts assets={assets} tokens={tokens} durationInFrames={durationInFrames} cuts={cuts} />
          {chip}
          <MarginRule accent={tokens.accent} />
          <WordCaptions beat={beat} tokens={tokens} size={76} />
        </AbsoluteFill>
      )
  }
}

export const StoryVideo: React.FC<{ captions: Captions; plan: Plan }> = ({ captions, plan }) => {
  const fps = plan.fps || 30
  const stingFrames = Math.round(STORY_STING_SEC * fps)
  const sceneByBeat = new Map(plan.scenes.map((s) => [s.beatId, s]))
  const tokens = plan.scenes[0]?.tokens
  const brandName = plan.brandName || 'MARGINALIA'
  // duck the bed 13dB under narration (v2 §6 window; lib/audio-mix.mjs is the spec)
  const segs = captions.beats.map((b) => ({ s: b.startSec + STORY_STING_SEC, e: b.startSec + b.durSec + STORY_STING_SEC }))
  const bedVolume = (f: number) => {
    const t = f / fps
    return segs.some((x) => t >= x.s && t < x.e) ? 0.22 : 0.24
  }
  const payoff = captions.beats.find((b) => b.beatId === 'payoff')
  const mech = captions.beats.find((b) => sceneByBeat.get(b.beatId)?.params?.sceneType === 'mechanism')
  return (
    <AbsoluteFill style={{ backgroundColor: tokens?.bg ?? '#000' }}>
      <Sequence from={0} durationInFrames={stingFrames}>
        <Sting tokens={tokens} brandName={brandName} />
      </Sequence>
      {captions.beats.map((b) => {
        const scene = sceneByBeat.get(b.beatId)
        if (!scene) return null
        const from = stingFrames + Math.round(b.startSec * fps)
        const dur = Math.round((b.durSec + 0.32) * fps) // hold through the inter-beat gap: no dead frames
        return (
          <Sequence key={b.beatId} from={from} durationInFrames={dur}>
            <StoryScene scene={scene} beat={b} brandName={brandName} durationInFrames={dur} />
          </Sequence>
        )
      })}
      {/* SFX: every scene change breathes (whoosh — sfx-on-visual-events strategy;
          the quality bar wants visual events heard) */}
      {captions.beats.map((b, i) => (
        <Sequence key={'wh-' + b.beatId} from={Math.max(0, stingFrames + Math.round(b.startSec * fps) - 4)} durationInFrames={Math.round(fps * 0.55)}>
          <Audio src={staticFile('audio/whoosh.wav')} volume={i === 0 ? 0.4 : 0.3} />
        </Sequence>
      ))}
      {/* the comma slam lands with the mechanism; a second hit when the payoff counter settles */}
      {mech ? (
        <Sequence from={stingFrames + Math.round(mech.startSec * fps) + 18} durationInFrames={Math.round(fps * 0.6)}>
          <Audio src={staticFile('audio/slam.wav')} volume={0.55} />
        </Sequence>
      ) : null}
      {payoff ? (
        <Sequence from={stingFrames + Math.round((payoff.startSec + payoff.durSec * 0.55) * fps)} durationInFrames={Math.round(fps * 0.6)}>
          <Audio src={staticFile('audio/slam.wav')} volume={0.5} />
        </Sequence>
      ) : null}
      <Audio src={staticFile('audio/bed.wav')} volume={bedVolume} loop />
      <Sequence from={stingFrames}>
        <Audio src={staticFile('narration_v2.wav')} />
      </Sequence>
    </AbsoluteFill>
  )
}
