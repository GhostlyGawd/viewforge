import React from 'react'
import { AbsoluteFill, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

// overlay.tsx — the Tier-1 overlay-on-capture components (Master Doc v2 §20).
//
// Capture-first demos: Playwright records the REAL product; these components draw the
// branded presentation layer on top — cursor, click ripples, focus rings, callouts,
// zoom moves. The cursor track is DETERMINISTIC (generated from the scripted steps by
// lib/capture-plan.mjs, positions resolved at capture time), so everything here is a
// pure function of (track, frame, tokens). Captures record at 2x device scale, which
// is what gives ZoomPan its crispness headroom.
//
// Nothing here is registered as a composition — the template must build without
// capture assets. Compose these in a per-video CaptureScene when a capture exists.

type Tokens = { bg: string; ink: string; accent: string; displayFont: string; bodyFont: string }
export type CursorPoint = { tMs: number; x: number; y: number; event: 'move' | 'dwell' | 'click' | 'type' | 'hover'; label?: string }

/** Cursor position at `tMs`: linear interpolation between the surrounding track
 *  points (the track itself already carries the smoothstep easing). */
export function cursorAt(track: CursorPoint[], tMs: number): { x: number; y: number } {
  if (track.length === 0) return { x: 0, y: 0 }
  if (tMs <= track[0].tMs) return { x: track[0].x, y: track[0].y }
  for (let i = 1; i < track.length; i++) {
    if (tMs <= track[i].tMs) {
      const a = track[i - 1]
      const b = track[i]
      const f = b.tMs === a.tMs ? 1 : (tMs - a.tMs) / (b.tMs - a.tMs)
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
    }
  }
  const last = track[track.length - 1]
  return { x: last.x, y: last.y }
}

/** The branded cursor, driven by the deterministic track. */
export const CursorOverlay: React.FC<{ track: CursorPoint[]; tokens: Tokens; sizePx?: number }> = ({ track, tokens, sizePx = 26 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { x, y } = cursorAt(track, (frame / fps) * 1000)
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-30%, -20%)', pointerEvents: 'none' }}>
      <svg width={sizePx} height={sizePx} viewBox="0 0 24 24">
        <path d="M4 2 L20 12 L12.5 13.5 L9 21 Z" fill={tokens.ink} stroke={tokens.bg} strokeWidth={1.4} />
        <path d="M4 2 L20 12 L12.5 13.5 L9 21 Z" fill="none" stroke={tokens.accent} strokeWidth={0.8} />
      </svg>
    </div>
  )
}

/** Expanding ripple at every click event in the track (the §20 ClickRipple). */
export const ClickRipple: React.FC<{ track: CursorPoint[]; tokens: Tokens; durMs?: number }> = ({ track, tokens, durMs = 550 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const tMs = (frame / fps) * 1000
  return (
    <>
      {track
        .filter((p) => p.event === 'click' && tMs >= p.tMs && tMs < p.tMs + durMs)
        .map((p, i) => {
          const f = (tMs - p.tMs) / durMs
          const r = 12 + f * 46
          return (
            <div
              key={`${p.tMs}-${i}`}
              style={{
                position: 'absolute',
                left: p.x - r,
                top: p.y - r,
                width: r * 2,
                height: r * 2,
                borderRadius: '50%',
                border: `3px solid ${tokens.accent}`,
                opacity: 1 - f,
                pointerEvents: 'none',
              }}
            />
          )
        })}
    </>
  )
}

/** Pulsing ring around the element a scene says it targets (the QC target-focus). */
export const FocusRing: React.FC<{ rect: { x: number; y: number; w: number; h: number }; tokens: Tokens; padPx?: number }> = ({ rect, tokens, padPx = 8 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pulse = 1 + Math.sin((frame / fps) * Math.PI * 2) * 0.02
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x - padPx,
        top: rect.y - padPx,
        width: rect.w + padPx * 2,
        height: rect.h + padPx * 2,
        border: `3px solid ${tokens.accent}`,
        borderRadius: 10,
        transform: `scale(${pulse})`,
        boxShadow: `0 0 0 4px ${tokens.accent}22`,
        pointerEvents: 'none',
      }}
    />
  )
}

/** A labeled callout anchored to a point, springing in. */
export const CalloutLabel: React.FC<{ at: { x: number; y: number }; text: string; tokens: Tokens; side?: 'right' | 'left' }> = ({ at, text, tokens, side = 'right' }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 160 } })
  const dx = side === 'right' ? 36 : -36
  return (
    <div style={{ position: 'absolute', left: at.x, top: at.y, pointerEvents: 'none', opacity: pop }}>
      <svg width={Math.abs(dx)} height={2} style={{ position: 'absolute', left: side === 'right' ? 0 : dx, top: 0 }}>
        <line x1={0} y1={1} x2={Math.abs(dx)} y2={1} stroke={tokens.accent} strokeWidth={2} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: side === 'right' ? dx : undefined,
          right: side === 'left' ? -dx : undefined,
          top: -18,
          transform: `scale(${0.9 + pop * 0.1})`,
          background: tokens.bg,
          color: tokens.ink,
          border: `1.5px solid ${tokens.accent}`,
          borderRadius: 8,
          padding: '8px 14px',
          fontFamily: tokens.bodyFont,
          fontSize: 24,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </div>
  )
}

/** Zoom/pan toward a focus point — crisp because captures record at 2x (§7/§9).
 *  `zoom` ≤ deviceScale keeps the result at-or-above native resolution. */
export const ZoomPan: React.FC<{ focus: { x: number; y: number }; zoom: number; startFrame?: number; durFrames?: number; children: React.ReactNode }> = ({ focus, zoom, startFrame = 0, durFrames = 20, children }) => {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const f = interpolate(frame, [startFrame, startFrame + durFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const ease = f * f * (3 - 2 * f)
  const scale = 1 + (zoom - 1) * ease
  const tx = (width / 2 - focus.x) * ease
  const ty = (height / 2 - focus.y) * ease
  return <AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: `${focus.x}px ${focus.y}px` }}>{children}</AbsoluteFill>
}

/** Minimal branded browser chrome wrapping a capture. */
export const BrowserFrame: React.FC<{ url: string; tokens: Tokens; children: React.ReactNode }> = ({ url, tokens, children }) => (
  <AbsoluteFill style={{ padding: 28, background: tokens.bg }}>
    <div style={{ width: '100%', height: '100%', borderRadius: 14, overflow: 'hidden', border: `1px solid ${tokens.ink}22`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, background: `${tokens.ink}0d`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', fontFamily: tokens.bodyFont }}>
        {['#f26d5b', '#f2c14e', '#69b578'].map((c) => (
          <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c, opacity: 0.85 }} />
        ))}
        <div style={{ marginLeft: 12, flex: 1, background: `${tokens.ink}14`, borderRadius: 8, padding: '5px 12px', color: tokens.ink, opacity: 0.75, fontSize: 16 }}>{url}</div>
      </div>
      <div style={{ position: 'relative', flex: 1 }}>{children}</div>
    </div>
  </AbsoluteFill>
)

/**
 * The composed capture scene: real footage + branded overlay. `videoFile` is the
 * Playwright recording staged under public/, `track` the deterministic cursor track.
 */
export const CaptureScene: React.FC<{ videoFile: string; url: string; track: CursorPoint[]; tokens: Tokens; zoom?: { focus: { x: number; y: number }; level: number; startFrame?: number } }> = ({ videoFile, url, track, tokens, zoom }) => {
  const inner = (
    <>
      <OffthreadVideo src={staticFile(videoFile)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
      <CursorOverlay track={track} tokens={tokens} />
      <ClickRipple track={track} tokens={tokens} />
    </>
  )
  return (
    <BrowserFrame url={url} tokens={tokens}>
      {zoom ? (
        <ZoomPan focus={zoom.focus} zoom={zoom.level} startFrame={zoom.startFrame ?? 0}>
          {inner}
        </ZoomPan>
      ) : (
        inner
      )}
    </BrowserFrame>
  )
}
