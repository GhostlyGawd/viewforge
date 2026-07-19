# Plan 08 — research report: how the visuals actually get made

Sourced findings behind the c19 post-mortem. Multi-angle web sweep (21 sources,
105 extracted claims, 25 sent to 3-vote adversarial verification). The synthesis
step and 15 of 25 verifications were cut off by a usage-credit wall, so claims are
labelled by evidence strength: **[confirmed]** = 3-0 adversarial vote;
**[first-party]** = quoted from a primary/creator source but verification vote was
credit-truncated; **[needs-check]** = licensing/cost specifics to confirm before any
adoption. Full run: `tasks/wvscxy3bt.output`.

## 1. Production methods of the reference class

- **[confirmed] Kurzgesagt ≠ solo, and the format is not the craft.** ~1,200 hours
  per video; ~200 panels hand-illustrated in Adobe Illustrator by 2-3 illustrators
  over 8-12 weeks; 2-3 animators keyframe *every* on-screen movement manually in
  After Effects over 8-10 weeks; ~70-person studio; "masterful vector illustration…
  quirky and relatable characters" is the trademark. Their flat-vector look depends
  on masterful illustration, **not on the flat-vector format**. → hand-rolling that
  style from primitives (c19) was never going to read as professional.
  (youtube.com/watch?v=uFk0mgljtns; kurzgesagt.org/what-we-do; kurzgesagt.org/about; Forbes 2024-10-24)
- **[confirmed] PolyMatter IS a solo, no-formal-training operation** — "written,
  animated, and made entirely by me, Evan." The closest existing analog to our
  pipeline. (skillshare.com/en/classes/make-animated-youtube-videos/1143408374)
- **[first-party] PolyMatter's frame-level rules** (the achievable target): a fixed
  channel-wide palette of a small handful of colours (2-3 accent + dark/light);
  avoid high saturation; use few colours at a time, separated by white or black;
  per-scene simplicity, balance, and a single focus (centre/contrast/arrows). Method
  is flat vector from primitive shapes + minimal keyframe interpolation
  (size/location/rotation/opacity). (same source)
- **[first-party] CGP Grey is a team** — Video Director + Illustrator/Animator +
  Distribution Assistant; storyboard → human-illustrated assets → animate. Not solo.
  (cgpgrey.com/cgpgrey-illustrator-animator)
- **[first-party] Johnny Harris = 30+ staff, ~$100k/mo overhead**, and his signature
  maps are **real Google Earth satellite imagery** animated in Google Earth Studio +
  After Effects with the GEOlayers plugin — data/imagery-driven, not hand-drawn.
  (tarapalmeri.com; premiumbeat.com/blog/making-maps-for-johnny-harris; aescripts.com — affiliate caveat noted)

**The through-line:** every reference channel either (a) employs professional
illustrators (Kurzgesagt, CGP Grey), or (b) builds from *found real-world material* —
satellite imagery, archival scans, period lithographs (Harris, Vox). None hand-code
object depictions. This is the evidentiary spine of "found shapes over drawn shapes."

## 2. No-illustrator styles that sustain top-1% engagement

- **Archival/period collage** (Vox "OK" = 1840s lithograph on a flat field; Harris
  "Hawaii" = flags + maps + declassified docs layered dense). 100% found material.
- **Map/data-driven** (Harris satellite imagery; real GeoJSON). Authority comes from
  the real geography, not drawing.
- **[first-party] AI-generated plates animated in code** — viable but a paid-service
  decision; see §3.
- **[confirmed-negative] Hand-coded vector object illustration** — the c19 path.
  Retired: the reference look requires pro illustrators; the format alone does not
  carry it.

## 3. AI illustrated-plate state of the art (July 2026)

- **[first-party] Costs**: premium (DALL-E 4, Midjourney API, Imagen 4) ~$0.03-0.20
  per image; open-weight (SD 3.5, FLUX, Ideogram) cheaper via creator APIs.
  (digitalapplied.com/blog/ai-image-generation-api-pricing-comparison-2026, pub. 2026-04)
- **[first-party] Recraft** exposes one API that outputs **both raster and vector/SVG**
  (natively importable + animatable in Remotion) plus 100+ preset styles positioned
  for cross-image consistency. A custom style-from-uploads feature is not documented
  on the landing page — **[needs-check]** in the API docs. (recraft.ai/api)
- **[needs-check] FLUX.2 open-weight licensing**: self-hosted commercial use is gated
  behind paid tiers (entry "Builder" ≈ 10K img/mo, single-domain, no client work);
  fine-tuning/LoRA rights reportedly included in the tiers. Verify before adoption.
  (bfl.ai/licensing)
- Style-consistency techniques in the wild: preset styles, style-reference images,
  LoRA training, prompt locking. The known-hard problem is scene-to-scene style drift.

## 4. Free/cheap commercial-safe asset sources

- **[first-party] Rawpixel public domain** — CC0, digitally cleaned/restored antique
  book plates, chromolithographs, museum art; commercial use, no attribution.
  A pre-restored upgrade over raw institutional scans. (rawpixel.com/public-domain)
- **[first-party] Biodiversity Heritage Library Flickr** — 319,661 natural-history
  plates (botanical/ornithological/zoological), same genre as the USDA watercolours
  that scored best. (flickr.com/photos/biodivlibrary/albums)
- **[first-party] Texturelabs** — free paper/torn-edge/grain textures up to ~6731px,
  well above 1080p needs. (texturelabs.org)
- LoC "free to use", Wikimedia Commons, Internet Archive, awesome-cc0 list.

## 5. Frame-level: what separates professional from amateur

- **[first-party] Value control is the #1 tell.** School of Motion (Emmy-winning
  Design Bootcamp): designs look "muddy" when *values aren't controlled* — subject
  and ground must sit in separated value groups. **This is exactly the c19 defect**:
  near-black silhouettes on a near-black sky = one value group = muddy. Directly
  code-checkable. (schoolofmotion.com/blog/design-value-structure-color-theory)
- **[first-party] Palette discipline** (PolyMatter, §1): few colours, low saturation,
  separated by black/white, 2-3 accents.
- **[first-party] Texture/grain** breaks the flat-digital tell.
  (schoolofmotion.com/blog/how-to-add-texture-designs-photoshop)
- **Density + treatment consistency** (Harris): layered found material, redaction
  bars, stamps, thin frame-lines, one unified grade.

## Costed production paths

| Path | What | Monthly cost | Risk | Evidence |
|---|---|---|---|---|
| **A. Period found-material collage + procedural/cartographic worlds** | Duotone-grade public-domain engravings/lithographs into brand palette, cutout + shadow, layer dense, decorate negative space procedurally, real GeoJSON maps; animate in Remotion | **$0** | **Low** — proven in-pipeline (c9-c18 archival scored best); Vox/Harris are 100% found material | strongest |
| **B. AI style-locked plates animated in code** | Generate consistent-style scene plates (Recraft vector/SVG, or FLUX/Ideogram raster), style-lock, animate in code | ~$5-40 (adoption trigger) | Med — style drift is the known-hard problem; licensing **[needs-check]**; "AI slop" perception | moderate |
| **C. Hybrid (A default, B for gaps)** | Path A everywhere a public-domain source exists; Path B only to fill a specific object/scene with no archival source | $0-15 | Low-Med | strong |
| **D. Hand-coded vector object illustration** | *(the c19 path)* | $0 | **Rejected** | disproven |

**Recommendation: Path A now; grow into Path C.** It is $0/mo, lowest-risk, and a
direct extension of the operator's own highest-scoring cycles — every element is
evidence-backed rather than assumed. Path B stays available behind the existing
`canAdoptPaidService` adoption trigger to fill gaps once Path A's ceiling is measured.
Path D is retired permanently and encoded as doctrine.

## Frame-level upgrades to implement regardless of path
1. **Value-separation QC check** (dogfoods the c19 miss): require a minimum value
   delta between the dominant subject region and the background; calibrate the band
   on real broken (c19) vs healthy (c9-c18) frames, same method as the empty-frame
   gate. Turns "muddy values" from a taste call into a code guard.
2. **Palette-discipline lint**: ≤ N hue families per frame, saturation ceiling,
   black/white separators — PolyMatter's rules as a check.
3. **Paper/grain/texture pass** from CC0 texture sources on every composited plate.
4. **Density + treatment consistency** targets for collage beats.
