#!/usr/bin/env python3
"""align-words.py — TRUE word timestamps via whisperX forced alignment (free, local).

Upgrades captions.json's char-weighted `revealSec` estimates to real aligned times:
runs whisperX over the rendered narration track and writes the flat word list that
lib/caption-timing.mjs `mergeAlignmentIntoCaptions` (property-tested) consumes. The
merge itself — word-count checks, transcript agreement, grace clamping — lives in the
tested lib; this tool only produces the alignment.

Setup (one-time, not a plugin dependency — the core stays zero-dep):
  pip install whisperx   # pulls torch; CPU works, GPU is faster

Usage:
  python tools/align-words.py <narration.wav> <aligned.json> [language]
Then merge (Node):
  node -e 'Promise.all([import("./lib/caption-timing.mjs")]).then(([ct]) => {
    const fs = require("fs");
    const captions = JSON.parse(fs.readFileSync("captions.json", "utf8"));
    const aligned = JSON.parse(fs.readFileSync("aligned.json", "utf8")).words;
    const r = ct.mergeAlignmentIntoCaptions(captions, aligned);
    if (!r.valid) { console.error(r.errors.join("\\n")); process.exit(1); }
    fs.writeFileSync("captions.json", JSON.stringify(r.captions, null, 2) + "\\n");
    console.log("captions.json upgraded to forced-alignment reveal times");
  })'
"""
import json, sys

def main():
    if len(sys.argv) < 3:
        print("usage: python tools/align-words.py <narration.wav> <aligned.json> [language]")
        sys.exit(1)
    audio_path, out_path = sys.argv[1], sys.argv[2]
    language = sys.argv[3] if len(sys.argv) > 3 else "en"

    import whisperx  # deferred so --help works without the dependency
    device = "cpu"
    model = whisperx.load_model("small", device, compute_type="int8", language=language)
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio, language=language)
    align_model, metadata = whisperx.load_align_model(language_code=language, device=device)
    aligned = whisperx.align(result["segments"], align_model, metadata, audio, device)

    words = []
    for seg in aligned["segments"]:
        for w in seg.get("words", []):
            if "start" in w:  # whisperX omits times for unalignable tokens; keep only real ones
                words.append({"word": w["word"].strip(), "start": round(w["start"], 3), "end": round(w.get("end", w["start"]), 3)})

    json.dump({"source": "whisperx", "audio": audio_path, "words": words}, open(out_path, "w", encoding="utf-8"), indent=2)
    print(f"align-words: {len(words)} words -> {out_path}")

if __name__ == "__main__":
    main()
