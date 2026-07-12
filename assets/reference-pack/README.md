# Reference pack — the exemplar anchors

Frames from the channels the operator wants matched (Veritasium-class explanation;
Kurzgesagt/3Blue1Brown-class animation; Johnny Harris/Fern-class history texture),
organized per scene grammar:

```
reference-pack/
  <sceneType>/            e.g. kinetic-open/, mechanism/, diagram-build/
    <channel>-<desc>.png  the anchor frames (anchor9 in RUBRIC_V2)
  manifest.json           EVERY frame: origin "research-only", source URL, timestamp
```

Rules (enforced, not suggested):
- Every frame is `origin: "research-only"` in the manifest — the existing
  asset-source gate makes it UNPUBLISHABLE; these are for internal comparison only.
- The MAKER iterates toward these frames inside the design loop (side-by-side).
- The JUDGE scores our frames and reference frames in the same blind pass — if the
  rubric can't separate them, the rubric lacks range (see the calibration ledger).
- Populate via yt-dlp stills or manual capture; record the source video URL per
  frame in manifest.json. The pack is versioned like the rules file.
