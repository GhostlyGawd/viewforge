---
name: edit-assemble
description: >-
  Assemble the final cut of a ViewForge video and run the ship-or-block QA gate —
  no dull moments, healthy narration coverage, and the hard constraints (no fake
  human, no fabricated metrics, claim paid off). Approves the video for
  distribution or blocks it with reasons. Department #7.
when_to_use: >-
  When a ViewForge video has motion + narration and needs final assembly/QA — e.g.
  "edit vid-1", "assemble the final cut", "QA the video", "viewforge edit step".
argument-hint: "[channel-slug] [video-id]"
allowed-tools: >-
  Read Write Edit Glob Bash(node *) Bash(ffmpeg *) Bash(mkdir *) Bash(echo *) Bash(ls *)
---

# Edit & assemble (ViewForge — department #7)

The last gate before a video ships. Assemble the timeline (motion + narration audio)
and run the QA gate in `lib/edit-qa.mjs`.

## 1. Run the QA gate

```bash
node -e '
Promise.all([import("../../lib/edit-qa.mjs")]).then(([{runEditQa}]) => {
  const dir = process.argv[1];
  const motionPlan = JSON.parse(require("fs").readFileSync(dir+"/motion-plan.json","utf8"));
  const narrationSpec = JSON.parse(require("fs").readFileSync(dir+"/narration.json","utf8"));
  const r = runEditQa({ motionPlan, narrationSpec, plan: { metricsSource: "youtube-analytics", packaging: { claimPaidOff: true }, visualMode: "motion-graphics" } });
  console.log("passed:", r.passed, "| runtime", r.timeline.durationSec + "s coverage " + Math.round(r.timeline.coverage*100) + "%");
  if (r.blocking.length) console.log("BLOCKING:\n  " + r.blocking.join("\n  "));
  if (r.warnings.length) console.log("warnings:\n  " + r.warnings.join("\n  "));
})' "state/channels/<slug>/videos/<id>"
```

- **Blocking** issues (a hard-constraint hit) mean the video does **not** ship — fix
  the underlying plan (e.g. a fake-human visual, an unpaid-off claim) and re-run.
- **Warnings** (a possible dull moment, low coverage) should be addressed but don't
  hard-block; use judgement.

## 2. Mux audio + video

Once the motion MP4 and the narration audio exist, combine them (and any music bed):

```bash
ffmpeg -i out/<id>.mp4 -i audio/<id>.wav -c:v copy -c:a aac -shortest final/<id>.mp4
```

Tighten any flagged dull moment in the edit (trim dead air — "no dull moments").

## 3. Record the verdict

Write `edit-qa.json` and set the video's `stage` to `edit-approved` (or `blocked`
with the reason) in channel state. Only `edit-approved` videos proceed to
**distribution** (planned).

## Definition of done
- [ ] QA gate run; zero blocking issues (or the video is honestly marked `blocked`).
- [ ] Audio muxed with video into a final cut (when assets exist).
- [ ] Verdict stored; approved video handed to distribution.
