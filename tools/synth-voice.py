#!/usr/bin/env python3
"""synth-voice.py — natural narration via Kokoro (free, local) with AUDIO-DRIVEN timing.

Synthesizes each script beat separately, concatenates with small gaps, and writes:
  - <outDir>/narration.wav      (the full narration track)
  - <captionsPath>/captions.json (per-beat startSec/durSec/words → audio-driven timing
    + word-synced captions for CaptionVideo)

Kokoro sounds markedly more natural than Piper and is still free + fully local (no key).
The pure timing/caption logic is in lib/caption-timing.mjs (property-tested); this tool
just produces the audio + the beat timing it consumes.

Setup (one-time, not a plugin dependency — the core stays zero-dep):
  pip install kokoro-onnx soundfile numpy
  # download the model + voices (≈350MB) from the kokoro-onnx releases:
  #   kokoro-v1.0.onnx  -> $KOKORO_MODEL  (default ./kokoro.onnx)
  #   voices-v1.0.bin   -> $KOKORO_VOICES (default ./voices.bin)

Usage:
  python tools/synth-voice.py <script.json> <remotion/public dir> [voice] [beatId,beatId,...]
Env: KOKORO_MODEL, KOKORO_VOICES (paths to the model files).
"""
import json, os, sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

SR = 24000
DEFAULT_VOICE = "am_michael"  # the chosen Marginalia narrator (Kokoro US male)

def main():
    if len(sys.argv) < 3:
        print("usage: python tools/synth-voice.py <script.json> <publicDir> [voice] [beatIds]")
        sys.exit(1)
    script_path, public_dir = sys.argv[1], sys.argv[2]
    voice = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_VOICE
    only = set(sys.argv[4].split(",")) if len(sys.argv) > 4 and sys.argv[4] else None

    model = os.environ.get("KOKORO_MODEL", "kokoro.onnx")
    voices = os.environ.get("KOKORO_VOICES", "voices.bin")
    k = Kokoro(model, voices)

    script = json.load(open(script_path, encoding="utf-8"))
    beats = [b for b in script["beats"] if (b.get("text") or "").strip() and (only is None or b["id"] in only)]

    gap = np.zeros(int(0.32 * SR), dtype=np.float32)
    chunks, timing, t = [], [], 0.0
    for b in beats:
        txt = b["text"].strip()
        samples, sr = k.create(txt, voice=voice, speed=1.0, lang="en-us")
        samples = np.asarray(samples, dtype=np.float32)
        dur = len(samples) / sr
        timing.append({"beatId": b["id"], "startSec": round(t, 3), "durSec": round(dur, 3),
                       "text": txt, "words": txt.split()})
        chunks += [samples, gap]
        t += dur + len(gap) / SR
        print(f"  {b['id']}: {dur:.1f}s")

    if not chunks:
        print("synth-voice: no spoken beats found"); sys.exit(1)
    audio = np.concatenate(chunks)
    os.makedirs(public_dir, exist_ok=True)
    sf.write(os.path.join(public_dir, "narration.wav"), audio, SR)
    captions = {"totalSec": round(len(audio) / SR, 3), "voice": voice, "beats": timing}
    cap_path = os.path.join(os.path.dirname(public_dir.rstrip("/\\")), "..", "captions.json")
    json.dump(captions, open(cap_path, "w", encoding="utf-8"), indent=2)
    print(f"synth-voice: {len(audio)/SR:.1f}s narration.wav + captions.json ({voice})")

if __name__ == "__main__":
    main()
