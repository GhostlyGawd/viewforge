---
description: Run the ViewForge YouTube channel factory — pick a niche, build a brand, then research → script → produce → edit → distribute optimized motion-graphics videos (no fake humans), driven by a sourced, test-over-time strategy library
argument-hint: "[goal / niche / channel-slug / stage]"
allowed-tools: >-
  Read Write Edit Glob AskUserQuestion WebSearch WebFetch SendUserFile
  Bash(node *) Bash(mkdir *) Bash(echo *) Bash(ls *) Bash(git *)
---

# /viewforge

ViewForge is a self-improving YouTube channel factory. It runs as a set of
**departments** (stages), optimized by a **strategy library** that is sourced,
tested over time, and guarded against reward-hacking and overfitting. The visual
language is motion graphics / illustration / real footage — **never a fake human
avatar**. Read `ARCHITECTURE.md` once before a first run.

The user's input is in `$ARGUMENTS`. Route on it:

1. **No channel yet, or "start" / a goal / a niche idea** → run the **niche-select**
   skill (`skills/niche-select/SKILL.md`) to pick a niche and create the channel
   project. This is department #1 and the entry point of the factory.

2. **An existing channel slug, or "next" / a stage name** → load the channel from
   `state/channels/<slug>/channel.json` (via `lib/state.mjs`), report its current
   `stage`, and run the next department:
   - `niche` done → run **brand-suite** (`skills/brand-suite/SKILL.md`).
   - `brand` done → run **video-research** (`skills/video-research/SKILL.md`).
   - `research` done → **script** and beyond are planned (`ROADMAP.md`) — say what's
     coming rather than faking output.
   The department order and maturity are in `departments/README.md`. As of v0.2.0,
   niche → brand → research are L2 (real engines); later stages are L0.

3. **"strategies" / "what works"** → load the strategy library
   (`lib/strategy-registry.mjs` + `strategy-library/strategies/`) and report the
   relevant strategies for the stage in question, clearly labeling `documented`
   (sourced but unproven on our channels) vs `validated` (earned it on our evidence).

## Rules that always hold

- **Pick the right department for the request; don't skip the niche/brand work** to
  jump to production — a channel with no grounded niche produces slop.
- **Every creative choice that can be measured should register an experiment** on the
  channel state, so it becomes evidence, not a one-off.
- **Run every production plan past the hard constraints** (`lib/guards.mjs` →
  `checkHardConstraints`) before rendering — no fake humans, no fabricated metrics,
  no unpaid-off clickbait.
- **Never fabricate analytics.** If real numbers aren't available, say so; simulated
  numbers can never promote a strategy.
- **When a capability/tool is missing**, search the web for a free/forkable one
  first (`ROADMAP.md` tracks the gaps); only build if nothing fits, and record it.

Follow the active department's SKILL.md exactly — its Definition of Done is the
contract.
