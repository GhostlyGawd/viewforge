# ViewForge — Remotion render template

The **motion department's** reusable render project. It is **brand-agnostic**: the
composition reads `../motion-plan.json` (parameterized scene timeline + brand tokens)
and `../script.json` (beat text), so the same template renders any channel's videos —
the look comes entirely from the plan the motion engine produced.

## How the motion-graphics skill uses it

1. Build the plan: `node lib/motion-plan.mjs`-driven → `videos/<id>/motion-plan.json`.
2. Copy this template's `src/`, `package.json`, `remotion.config.ts`, `tsconfig.json`
   into `videos/<id>/remotion/` (so `../motion-plan.json` resolves to the video's plan).
3. `cd videos/<id>/remotion && npm install`
4. Preview: `npm start` (Remotion Studio) · Render: `npm run render` → `out/video.mp4`
5. Still frame (fast check): `npx remotion still MarginaliaVideo out/frame.png --frame=30`

## What's in the polish

- **Logo sting** (first ~1.4s): brand wordmark + manicule + tagline, spring scale-in.
- **Paper grain**: subtle SVG-turbulence texture overlay on every scene.
- **Ink-draw margin rule**: the vermillion margin line animates in per scene + manicule.
- **Wax-seal stamp**: springs in on the payoff beat (the "land the promise" moment).
- **Map-morph drift**: slow scale on the comma artifact during the escalation beat.
- **Number accenting**: money/number clauses auto-render in the brand accent.
- **Pace from the plan**: faster entrances on the hook (serves first-minute retention).

All of it is parameter-driven, so A/B variants are different `motion-plan.json`s — no
code edits. Brand colors/fonts are sanitized to valid CSS by the motion engine
(`extractCssColor` / `extractFontFamily`) before they reach here.

## Audio

The narration spec (`../narration.json`, Piper TTS) renders to audio separately and is
muxed in at the edit step (`ffmpeg -i out/video.mp4 -i audio.wav -c:v copy -c:a aac …`).
ViewForge never renders a synthetic human — the voice is audio only.
