# Plan 08 — How the visuals actually get made (the c19 post-mortem research)

**Trigger:** cycle 19 (hand-coded flat-vector SVG worlds) regressed below c18=76.
Operator verdict: "shape figures… shitty stick figure animation. The last one was
better. Do some research to find a way to actually do this successfully."

**Question:** what production approach can a solo, code-driven (Remotion, headless,
$100/mo cap) pipeline realistically use to reach reference-class perceived quality —
with evidence, not assumption?

This document has two evidence sections: (A) direct comparative analysis of our own
reference anchors (done in-loop, the check c19 skipped), and (B) the deep-research
sweep (multi-source, adversarially verified, cited) — see
`plans/08-research-report.md`. The costed paths and the recommendation integrate both.

---

## A. What the anchors actually contain (comparative analysis, 2026-07-13)

Looking at our four anchor frames NEXT TO the c19 frames — the step c19 skipped —
yields a clean decomposition of where reference-class quality comes from:

### polymatter-sanctions (flat-vector "illustrated world")
- **The substrate is a MAP** — found geography (Korea/Japan coastlines), not drawn
  objects. The shapes carry authority because they come from the real world, not
  from an illustrator's hand.
- The negative space is filled with **quiet procedural detail**: faint grid lines,
  dashed boxes, scattered coordinate numbers, tiny crosses/squares, connector lines.
  Code is BETTER at this than humans — it is exactly the layer our c19 frames lacked.
- **Grade stack**: two-color discipline (slate-blue field + one hot accent), subtle
  land gradients/inner shadows, glow on the accent, vignette, film grain.
- **Type**: massive condensed bold, white + accent bar, hard shadows. Two colors.
- Conclusion: this frame requires ZERO drawing skill. GeoJSON + procedural
  decoration + grade = ownable in Remotion at near-parity.

### kurzgesagt-evolution (the counter-example)
- Even this "simple" chart is ~50 species silhouettes, each with professional shape
  character. **Object/creature illustration IS the illustrator's craft** — the
  style's simplicity is deceptive. Not ownable by hand-rolled SVG; this is the
  category where c19 failed ("shape figures").

### vox-ok (the period-collage unlock)
- The frame's illustration is an **1840s hand-colored lithograph** — a FOUND
  professional drawing by a 19th-century engraver, placed on a flat saturated field
  with expressive script type and one rough red swash. Vox drew nothing.
- For our 1872 story this is decisive: the period itself produced enormous
  professional illustration (engravings, lithographs, Harper's Weekly woodcuts,
  Currier & Ives prints, fruit crate labels) — all public domain, all scanned
  (LoC, Wikimedia Commons, Internet Archive, NYPL). **The illustrated world already
  exists, drawn by professional Victorian illustrators, free and publishable.**

### harris-hawaii (collage maximalism)
- 100% found material: real flag photo, archival maps, declassified documents,
  B/W portrait — layered DENSE, with redaction bars, rubber stamps, thin frame
  lines, distressed type on accent bars, unified warm grain. Zero drawn objects.
- The craft is layering density + treatment consistency, both code-implementable.

### The frame-level law this yields

> **Found shapes over drawn shapes.** Real maps, documents, photographs, period
> artwork, and data carry professional authority into the frame for free; drawn
> objects put the author's (absent) illustration skill on screen. A code pipeline
> should compose and treat found material, decorate with procedural detail, and
> never hand-draw an object more complex than a geometric primitive used as
> DESIGN (bars, rules, tags) rather than as DEPICTION (buildings, ships, people).

c19 violated exactly this: it replaced found-material authority (statute scan,
USDA plates) with hand-drawn depictions (Capitol, quill, harbor). The archival
cycles scored best because found material was doing the illustrating.

### Feasibility probe for the 1872 story (survey level, positive)
- Wikimedia Commons: full Harper's Weekly year categories (1870, 1873, covers…)
- LoC Prints & Photographs: 19th-c. lithograph collections incl. NY harbor items
  (e.g. items 2017647705, 2016810609); "free to use and reuse" program
- Already proven in-pipeline: LoC statute scan + USDA pomological watercolors
  (fetched, treated, published in c9–c18 — the operator's best-scored substrate)

Sources for section A probes:
- https://commons.wikimedia.org/wiki/Category:Harper's_Weekly,_1870
- https://commons.wikimedia.org/wiki/Category:Harper's_Weekly,_1873
- https://www.loc.gov/photos/?fa=subject:lithographs (1800–1899 filters)
- https://www.loc.gov/item/2017647705/ , https://www.loc.gov/item/2016810609/
- https://www.loc.gov/free-to-use/

---

## B. Deep-research sweep

Multi-angle, source-verified findings: see `plans/08-research-report.md`
(channel production methods; no-illustrator styles that sustain top-1% engagement;
genAI illustrated-plate state of the art, costs and licensing; free asset sources;
frame-level craft principles). This section and the costed paths below are
finalized from that report.

## C. Costed paths + recommendation

Finalized after B; recorded in `plans/08-research-report.md` and mirrored into the
design-loop state. (Prior from A alone: period-plate collage + cartographic worlds,
$0/mo, is the leading candidate; genAI plates are the gap-filler behind an adoption
trigger; hand-drawn object illustration is retired permanently.)

## Doctrine already adopted from the c19 miss (committed with the ledger entry)
- Substrate-class changes require (a) a production-method feasibility check and
  (b) a separated comparative anchor judgment on spot frames BEFORE operator
  delivery. See `harness/IMPROVEMENT-LOG.md` 2026-07-13 "the craft-gap miss".
