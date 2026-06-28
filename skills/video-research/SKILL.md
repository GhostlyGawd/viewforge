---
name: video-research
description: >-
  Research and lock the next slate of videos for a ViewForge channel —
  brainstorm ideas in the channel's niche/brand, ground demand, lock the
  packaged promise (title + thumbnail concept) BEFORE production, score and rank
  ideas with the engine (packaging extremity, demand, motion-graphics fit,
  format novelty), reject deceptive/unpaid-off clickbait, and add the winners to
  the channel as videos. The third department of the ViewForge factory.
when_to_use: >-
  When a ViewForge channel has a brand and needs video ideas chosen and packaged
  — e.g. "find the next videos for <channel>", "what should <channel> make",
  "research and package the slate", "viewforge research step".
argument-hint: "[channel-slug] [count]"
allowed-tools: >-
  Read Write Edit Glob AskUserQuestion WebSearch WebFetch
  Bash(node *) Bash(mkdir *) Bash(echo *) Bash(ls *)
---

# Video research (ViewForge — department #3)

Pick what to make and **lock the packaging before production** — the `title +
thumbnail` is the promise the whole video is built to pay off
(`package-before-you-produce`). Every idea is scored by the tested engine in
`lib/video-idea.mjs`, which encodes the packaging and format-novelty strategies and
**hard-blocks** any idea whose claim the content won't deliver.

## 1. Load context

Load the channel; confirm it has a `brand` (run brand-suite first if not). Pull the
formats of the channel's most recent videos (most-recent-first) — the engine uses them
to reward format novelty:

```bash
node -e '
import("../../lib/state.mjs").then(({loadChannel}) => {
  const c = loadChannel(process.env.VF_STATE_ROOT || "state", process.argv[1]);
  const recent = [...c.videos].reverse().map(v => v.format).filter(Boolean);
  console.log(JSON.stringify({ niche: c.niche?.name, brand: c.brand?.name, recentFormats: recent }));
})' "<channel-slug>"
```

## 2. Pull the relevant strategies

Load the **validated** (and, labeled as such, `documented`) strategies that inform
research/packaging, so the brainstorm is strategy-driven:

```bash
node -e '
Promise.all([import("../../lib/strategy-registry.mjs")]).then(([{loadStrategies, queryStrategies}]) => {
  const {fileURLToPath} = require("url");
  const dir = fileURLToPath(new URL("../../strategy-library/strategies/", "file://" + process.cwd() + "/"));
  const {strategies} = loadStrategies("strategy-library/strategies");
  const relevant = queryStrategies(strategies, { appliesTo: "research" })
    .concat(queryStrategies(strategies, { appliesTo: "title" }));
  for (const s of relevant) console.log(`[${s.status}] ${s.id}: ${s.rule || s.principle}`);
})'
```

Lead with `package-before-you-produce`, `thumbnail-title-extremity`, `format-novelty`,
and `wow-factor`. Treat `documented` ones as hypotheses, not gospel.

## 3. Brainstorm + ground

Generate **count × 2** candidate ideas (default count = 3, so ~6 candidates) in the
niche. For each, draft: a working **title**, a **thumbnailConcept**, the **format**,
and — honestly — whether the content will **pay off the claim** (`claimPaidOff`). Use
`WebSearch` to ground `demand` (is anyone searching for / watching this?) and to check
the angle isn't already saturated. Rate `productionFit` for motion graphics (no fake
humans). Record where demand evidence came from.

**Do not inflate packaging you can't honestly deliver.** An idea you'd have to lie to
sell is blocked by the engine — that's the point.

## 4. Score, rank, and cut

Write the candidates to JSON and rank them:

```bash
node -e '
import("../../lib/video-idea.mjs").then(({rankVideoIdeas}) => {
  const fs = require("fs");
  const ideas = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const recentFormats = JSON.parse(process.argv[2] || "[]");
  const ranked = rankVideoIdeas(ideas, { recentFormats });
  for (const r of ranked) console.log(
    (r.blocked ? "BLOCKED" : String(r.score).padStart(6)) + "  " + r.title + (r.blocked ? "  ← " + r.blockReason : ""));
})' candidates.json '["explainer","countdown"]'
```

Blocked ideas (unpaid-off claims) are dropped, not reworked into something dishonest.
Keep the top `count`.

## 5. Lock the slate into the channel

Add each chosen idea as a video (packaging is locked now, before any production):

```bash
node -e '
import("../../lib/state.mjs").then(({addVideo, advanceStage}) => {
  const fs = require("fs");
  const root = process.env.VF_STATE_ROOT || "state", slug = process.argv[1];
  const chosen = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));  // array of {title, thumbnailConcept, format, score, demandSource, claimPaidOff:true}
  for (const v of chosen) addVideo(root, slug, { ...v, stage: "idea" });
  advanceStage(root, slug, "research");
  console.log("locked", chosen.length, "videos; channel at research stage");
})' "<channel-slug>" chosen.json
```

## 6. Report + hand off

Give the user the ranked slate: each chosen title, its score, the packaged promise,
the demand evidence, and the format (noting novelty vs recent uploads). Flag anything
that was blocked and why. Next department: **script** (planned in `ROADMAP.md`).

## Definition of done

- [ ] Channel loaded; has a brand; recent formats pulled.
- [ ] Research strategies pulled and led the brainstorm (packaging-first).
- [ ] ~2× candidates generated; demand grounded with sources; `claimPaidOff` set
      honestly; motion-graphics fit rated.
- [ ] Ranked via the engine; deceptive/unpaid-off ideas blocked and dropped.
- [ ] Top `count` added to the channel as videos with locked packaging; stage advanced.
- [ ] Slate reported with scores, promises, and demand evidence.
