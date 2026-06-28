---
name: brand-suite
description: >-
  Build a channel's full brand suite & guide from its chosen niche — name,
  palette, typography, logo, voice/tone guide, thumbnail template, and a
  signature motion identity — by briefing and running the brand-studio plugin,
  then validating and persisting the brand onto the ViewForge channel. The
  second department of the ViewForge factory. Never an on-camera / fake-human
  identity; the look is motion-graphics first.
when_to_use: >-
  When a ViewForge channel has a niche and needs its brand built or revised —
  e.g. "build the brand for <channel>", "do the branding", "viewforge brand
  step", "create the channel's visual identity and guide".
argument-hint: "[channel-slug]"
allowed-tools: >-
  Read Write Edit Glob AskUserQuestion WebSearch WebFetch SendUserFile
  Bash(node *) Bash(mkdir *) Bash(echo *) Bash(ls *)
---

# Brand suite (ViewForge — department #2)

Turn a chosen niche into a complete, usable brand. The creative generation is
delegated to the **brand-studio** plugin (the firm-grade branding engine in this
repo); this department's job is to **brief it consistently, validate what comes back,
and persist it** so the channel can't move to production with a half-built identity.
The identity is motion-graphics / illustration first — **never a fake human**.

## 1. Load the channel + derive the brief

Load the channel state and confirm it has a niche and is at (or past) the `niche`
stage. Derive the structured brand brief deterministically from the niche:

```bash
node -e '
import("../../lib/state.mjs").then(async ({loadChannel}) => {
  const {deriveBrandBrief} = await import("../../lib/brand-brief.mjs");
  const c = loadChannel(process.env.VF_STATE_ROOT || "state", process.argv[1]);
  if (!c.niche) throw new Error("channel has no niche yet — run niche-select first");
  console.log(JSON.stringify(deriveBrandBrief(c.niche), null, 2));
})' "<channel-slug>"
```

The brief carries the niche concept, positioning, the fixed `motion-graphics /
noFakeHuman` visual direction, the seven required deliverables, and `openQuestions`
for anything ungrounded.

## 2. Close the open questions (don't invent them)

For each `openQuestions` entry (target viewer, the channel-level wow factor, three
tone words), get a real answer — from the user via `AskUserQuestion`, or from light
research. These are the inputs that make a brand specific instead of generic; don't
paper over them.

## 3. Run brand-studio with the brief

Hand the completed brief to the **brand-studio** plugin to generate the suite (its
`brand.json` keystone + token/asset/validator outputs). Produce all seven
deliverables: `name`, `palette`, `typography`, `logo`, `voiceGuide`,
`thumbnailTemplate`, `motionIdentity`. The thumbnail template and motion identity
matter as much as the logo here — they're what make every future video consistent and
on-brand (and the thumbnail template is a CTR lever the research/package departments
will reuse).

If brand-studio is unavailable, build the suite directly to the same seven-deliverable
shape — the validator below is the contract either way.

## 4. Validate before you store (the "no mistakes" gate)

A channel may not advance past the brand stage with an incomplete identity. Validate
the assembled record and store it only if valid:

```bash
node -e '
import("../../lib/brand-brief.mjs").then(async ({validateBrandRecord}) => {
  const {setBrand, advanceStage} = await import("../../lib/state.mjs");
  const fs = require("fs");
  const brand = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const {valid, errors} = validateBrandRecord(brand);
  if (!valid) { console.error("brand incomplete:", errors.join("; ")); process.exit(1); }
  const root = process.env.VF_STATE_ROOT || "state";
  setBrand(root, process.argv[1], brand);
  advanceStage(root, process.argv[1], "brand");
  console.log("brand stored + channel advanced to brand stage");
})' "<channel-slug>" "<brand.json path>"
```

## 5. Report + hand off

Show the user the brand at a glance (name, palette, the wow factor, the thumbnail +
motion identity), surface a couple of the strongest assets with `SendUserFile` if they
were rendered, and note the next department is **research** (`/viewforge <slug> next`).

## Definition of done

- [ ] Channel loaded; has a niche; brief derived from it.
- [ ] Open questions answered with real input (audience, wow factor, tone) — not faked.
- [ ] All seven deliverables produced (name, palette, typography, logo, voiceGuide,
      thumbnailTemplate, motionIdentity); identity is motion-graphics, no fake human.
- [ ] `validateBrandRecord` passes; brand stored via `setBrand`; channel advanced.
- [ ] Brand reported to the user; handed off to research.
