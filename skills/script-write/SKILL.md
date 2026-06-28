---
name: script-write
description: >-
  Write a retention-structured script for a locked, packaged ViewForge video.
  Builds a beat sheet from the retention strategies (first-minute over-investment,
  crazy progression, scheduled re-engagement beats, no dull moments, no abrupt
  ending), drafts the script to that shape, grounds every factual claim, and
  validates the structure before handing off to voice. Department #4.
when_to_use: >-
  When a ViewForge video has locked packaging and needs its script — e.g. "write
  the script for vid-1", "script <channel>'s next video", "viewforge script step".
argument-hint: "[channel-slug] [video-id]"
allowed-tools: >-
  Read Write Edit Glob WebSearch WebFetch Bash(node *) Bash(mkdir *) Bash(echo *) Bash(ls *)
---

# Script writing (ViewForge — department #4)

Turn a packaged promise into a script built to hold attention. The retention shape is
not vibes — it's the tested beat sheet in `lib/script-model.mjs`, which encodes the
strategies. Your prose fills that shape; the validator enforces it.

## 1. Build the beat sheet

Pick a target runtime (explainers: 6–10 min) and generate the structure:

```bash
node -e '
import("../../lib/script-model.mjs").then(({buildBeatSheet}) => {
  console.log(JSON.stringify(buildBeatSheet({ targetSeconds: 360, title: process.argv[1] }), null, 2));
})' "<the locked title>"
```

Each beat has a time window, a word budget, a purpose, and the `strategyIds` it
serves (hook → show-don't-tell → progression → reengage-1 → investment → reengage-2 →
escalation → payoff → outro).

## 2. Draft to the shape — and ground every claim

Write the script beat by beat, honoring the purpose of each:
- **hook (first ~14s):** pay off the title in the first sentence. No "hey guys."
- **progression:** compress time, escalate; show don't tell.
- **reengage-1/2:** a genuine reveal that fits the story, placed where viewers leave.
- **escalation:** the wow-factor set piece.
- **payoff:** deliver the promised claim fully (this is what makes the packaging honest).
- **outro:** hand to the next video; never signal a hard ending early.

**Ground every factual/number claim with a real source** (`WebSearch`/`WebFetch`) and
record it in the script's `sourcesGrounded`. If the locked title carries a number, the
script must tie it to a verifiable case — if it can't, flag it back to research rather
than fabricate. (That integrity catch is the point, not a detour.)

## 3. Validate the structure

```bash
node -e '
import("../../lib/script-model.mjs").then(({validateScriptStructure}) => {
  const s = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
  const r = validateScriptStructure(s);
  console.log(r.valid ? "STRUCTURE OK" : "ISSUES:\n  " + r.issues.join("\n  "));
})' "<script.json>"
```

Fix every issue (missing hook, missing re-engagement beat, dull gap, abrupt ending)
before handing off. Store the script at
`state/channels/<slug>/videos/<id>/script.json`.

## Definition of done
- [ ] Beat sheet generated for the chosen runtime.
- [ ] Script drafted to every beat's purpose; first sentence pays off the title.
- [ ] Every factual/number claim grounded with a source in `sourcesGrounded`.
- [ ] `validateScriptStructure` passes.
- [ ] Stored as `script.json`; handed off to **voice-over**.
