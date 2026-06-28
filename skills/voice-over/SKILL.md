---
name: voice-over
description: >-
  Turn a ViewForge script into a narration spec and (locally, free) a voiceover
  track using a self-hosted TTS engine (Piper by default). Produces per-beat
  segments with SSML + timing, checks each fits its beat window, and flags
  synthetic-voice disclosure. Audio only — never a fake human on screen.
  Department #5.
when_to_use: >-
  When a ViewForge video has a script and needs narration — e.g. "voice vid-1",
  "generate the voiceover", "viewforge voice step".
argument-hint: "[channel-slug] [video-id]"
allowed-tools: >-
  Read Write Edit Glob WebSearch Bash(node *) Bash(mkdir *) Bash(echo *) Bash(ls *) Bash(piper *)
---

# Voice-over (ViewForge — department #5)

Generate the narration. ViewForge uses a **synthetic voice** (fine, and disclosed
where required) — it never renders a fake human; the voice is audio only.

## 1. Build the narration spec

```bash
node -e '
import("../../lib/voice-spec.mjs").then(({buildNarrationSpec, validateNarrationSpec}) => {
  const script = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
  const spec = buildNarrationSpec(script, { engine: "piper" });
  const v = validateNarrationSpec(spec);
  require("fs").writeFileSync(process.argv[2], JSON.stringify(spec, null, 2) + "\n");
  console.log(spec.totalWords, "words ~" + spec.estimatedSeconds + "s | fits:", v.valid, v.issues.join("; "));
})' "<script.json>" "<narration.json>"
```

If a segment overruns its beat window, tighten that beat's copy (back in script-write)
rather than speeding the voice past natural pace.

## 2. Pick the engine (free + local first)

`lib/voice-spec.mjs` recommends free, self-hostable engines (`TTS_ENGINES`): **Kokoro**
is the default — markedly more natural than Piper, still free + fully local — with voice
**am_michael**. Piper is a lighter fallback. Genuinely human narration = a paid API
(ElevenLabs), which the operator can opt into with a key. Don't build a TTS — use one.

## 3. Render the audio — audio-DRIVEN (preferred)

Use **`tools/synth-voice.py`** (Kokoro): it synthesizes each beat separately, so the
video can be timed to the REAL narration and the captions word-synced. It writes
`narration.wav` + `captions.json` (per-beat `startSec`/`durSec`/`words`):

```bash
# setup once: pip install kokoro-onnx soundfile numpy; download kokoro.onnx + voices.bin
KOKORO_MODEL=kokoro.onnx KOKORO_VOICES=voices.bin \
  python tools/synth-voice.py <script.json> <render>/public am_michael
```

The motion department's `CaptionVideo` composition then drives timing + word-synced
captions from `captions.json` (timing logic is the property-tested `lib/caption-timing.mjs`).
If Kokoro isn't set up, fall back to Piper per-segment WAVs, or leave the spec for the
edit step — don't fake an audio file. (Lighter Piper path: `echo "<text>" | piper -m
en_US-<voice>.onnx -f beat.wav`.)

## 4. Disclosure
The spec carries `disclosureRequired`. Ensure the publish step adds the platform's
synthetic-media disclosure where required.

## Definition of done
- [ ] `narration.json` built; every segment fits its window (`validateNarrationSpec`).
- [ ] Engine chosen from the free/local list.
- [ ] Audio rendered locally (or the gap honestly noted if the engine isn't present).
- [ ] Disclosure flag carried forward; handed off to **motion-graphics**.
