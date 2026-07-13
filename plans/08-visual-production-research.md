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

Multi-angle, source-verified findings in `plans/08-research-report.md`. The sweep
**independently confirmed section A**: every reference channel either employs
professional illustrators (Kurzgesagt: ~1,200 hrs/video, 200 hand-drawn panels,
2-3 illustrators × 8-12 wks, ~70 staff — the flat-vector *format* is not the craft;
CGP Grey: a team with a dedicated illustrator/animator) or builds from FOUND
real-world material (Johnny Harris's maps are real Google Earth satellite imagery
via GEOlayers, not drawings; Vox's "illustration" is a found lithograph). The one
solo, no-training analog to our pipeline — PolyMatter — wins on RULES, not drawing:
a fixed 2-3-accent low-saturation palette, few colours separated by black/white,
one focus per scene. And the frame-level literature names our exact c19 defect:
**uncontrolled values ("muddy") is the #1 amateur tell** — near-black on near-black
is one value group.

## C. Costed paths + recommendation (FINAL)

Full table in `plans/08-research-report.md`. Verdict:

- **Path A — period found-material collage + procedural/cartographic worlds, $0/mo,
  LOW risk — RECOMMENDED.** Duotone-grade public-domain engravings/lithographs into
  the brand palette, cutout + shadow, layer dense (Harris), decorate negative space
  procedurally (PolyMatter/Vox), real GeoJSON maps for geographic beats, animate in
  Remotion. It is a direct extension of the operator's own best-scoring cycles
  (c9-c18 archival), every element evidence-backed. New free source lanes unlocked:
  Rawpixel CC0 (pre-restored antique plates), Biodiversity Heritage Library Flickr
  (319k natural-history plates), Texturelabs (paper/grain).
- **Path B — AI style-locked plates animated in code, ~$5-40/mo, MED risk** — behind
  the existing `canAdoptPaidService` adoption trigger; Recraft can emit vector/SVG
  importable to Remotion; licensing is `[needs-check]`. Gap-filler, not the spine.
- **Path C — hybrid (A default, B for gaps)** — the maturation target.
- **Path D — hand-coded vector object depiction (the c19 path) — RETIRED PERMANENTLY.**

**Frame-level upgrades to implement on any path:** (1) a value-separation QC check
that dogfoods the c19 "muddy values" miss into a code guard (min value delta between
subject and ground, band-calibrated on c19-broken vs c9-c18-healthy frames, same
method as the empty-frame gate); (2) palette-discipline lint (PolyMatter's rules);
(3) CC0 paper/grain on every composited plate; (4) collage density targets.

## Doctrine already adopted from the c19 miss (committed with the ledger entry)
- Substrate-class changes require (a) a production-method feasibility check and
  (b) a separated comparative anchor judgment on spot frames BEFORE operator
  delivery. See `harness/IMPROVEMENT-LOG.md` 2026-07-13 "the craft-gap miss".
