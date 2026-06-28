---
name: distribution-publish
description: >-
  Prepare an edit-approved ViewForge video for publishing — SEO-aware description
  with chapters and sources, a deduped tag set, end-screen plan, and the required
  synthetic-voice disclosure — then validate the package against platform rules.
  Department #8.
when_to_use: >-
  When a ViewForge video is edit-approved and needs its publish metadata — e.g.
  "publish vid-1", "prep the description and tags", "viewforge distribute step".
argument-hint: "[channel-slug] [video-id]"
allowed-tools: >-
  Read Write Edit Glob Bash(node *) Bash(mkdir *) Bash(echo *) Bash(ls *) Bash(gh *)
---

# Distribution & publish (ViewForge — department #8)

Turn the finished cut into a publish package. The engine (`lib/distribution.mjs`)
builds it from the script + packaging + brand and validates it.

## 1. Build + validate the publish package

```bash
node -e '
import("../../lib/distribution.mjs").then(({buildPublishPackage, validatePublishPackage}) => {
  const fs = require("fs"); const dir = process.argv[1];
  const script = JSON.parse(fs.readFileSync(dir+"/script.json","utf8"));
  const narration = JSON.parse(fs.readFileSync(dir+"/narration.json","utf8"));
  const pkg = buildPublishPackage({
    video:{title:script.title}, script, niche:process.argv[2], format:process.argv[3],
    brand:{name:process.argv[4]}, narrationDisclosureRequired: narration.disclosureRequired });
  const v = validatePublishPackage(pkg, { requireDisclosure: narration.disclosureRequired });
  fs.writeFileSync(dir+"/publish.json", JSON.stringify(pkg,null,2)+"\n");
  console.log(v.valid ? "PUBLISH PACKAGE OK" : "ISSUES: "+v.issues.join("; "));
  console.log(pkg.description);
})' "state/channels/<slug>/videos/<id>" "<niche>" "<format>" "<brand-name>"
```

The description leads with the hook, lists chapters (first at 00:00), cites the
script's grounded **sources** (trust + SEO), and carries the **synthetic-voice
disclosure** when required. Tags are deduped and within budget.

## 2. Publish (human-in-the-loop)

Uploading to YouTube is an outward-facing action — **don't auto-publish.** Hand the
validated package + the final MP4 to the operator (or the YouTube API once
credentials + consent exist). Schedule for the channel's best slot; set the
end-screen per the plan; apply the disclosure toggle in Studio.

## 3. Hand off to analytics
Once live, the video's real metrics become the input to the **analytics** department,
which attributes them to the strategies/experiments that produced the video and runs
the promotion gate. Record the publish in channel state (video stage → `published`).

## Definition of done
- [ ] Publish package built + `validatePublishPackage` passes (chapters, tags, disclosure).
- [ ] Sources cited in the description; disclosure present if synthetic voice.
- [ ] Package + MP4 handed to the operator (not auto-published).
- [ ] Video marked `published`; handed to analytics.
