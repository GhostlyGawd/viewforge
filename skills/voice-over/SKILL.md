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

`lib/voice-spec.mjs` recommends free, self-hostable engines (`TTS_ENGINES`): **Piper**
by default (fast, local, MIT), with Coqui XTTS / Kokoro as higher-expressiveness
options. No paid API unless the user opts in. This is the "search-for-a-free-tool-first"
rule applied — don't build a TTS, use one.

## 3. Render the audio locally

With Piper installed, render per-beat WAVs from the spec text (loop over segments),
or one continuous track. Example per segment:

```bash
echo "<segment text>" | piper --model en_US-<voice>.onnx --output_file beat-<id>.wav
```

Store audio under `state/channels/<slug>/videos/<id>/audio/`. If Piper isn't installed,
note it and leave the spec for the edit step — don't fake an audio file.

## 4. Disclosure
The spec carries `disclosureRequired`. Ensure the publish step adds the platform's
synthetic-media disclosure where required.

## Definition of done
- [ ] `narration.json` built; every segment fits its window (`validateNarrationSpec`).
- [ ] Engine chosen from the free/local list.
- [ ] Audio rendered locally (or the gap honestly noted if the engine isn't present).
- [ ] Disclosure flag carried forward; handed off to **motion-graphics**.
