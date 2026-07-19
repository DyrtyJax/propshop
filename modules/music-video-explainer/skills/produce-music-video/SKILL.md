---
name: produce-music-video
description: Produce source-grounded AI music videos and proofs that alternate a singing or speaking character with animated maps, metrics, titles, and visual explanations. Use when an agent needs to plan, validate, generate, or assemble a cohesive music video from a master song, isolated vocals, a performer reference, factual sources, and map or data assets—especially when lip sync, identity continuity, exact timing, budget control, provenance, and editable project files matter.
---

# Produce a music video

Build a typed timeline first. Give the agent creative control inside shots, but make timing, facts, audio, costs, and provenance mechanical.

## Workflow

1. Collect a lossless master, isolated vocal stem, front-facing performer reference, fact pack, and any GeoJSON or data assets.
2. Draft `facts.json` and `shots.json` from the bundled schemas. Read [references/contracts.md](references/contracts.md) while authoring them.
3. Resolve the installed skill directory (the directory containing this `SKILL.md`) as `MUSIC_VIDEO_SKILL`, then validate before generation:

   ```bash
   node "$MUSIC_VIDEO_SKILL/scripts/validate-production.mjs" --shots shots.json --facts facts.json --check-assets
   ```

4. Canonicalize audio and extract one clean vocal clip per performance shot:

   ```bash
   node "$MUSIC_VIDEO_SKILL/scripts/prepare-audio.mjs" \
     --master song.wav --vocals vocals.wav --shots shots.json --out-dir build/audio
   ```

5. Generate two takes per performance shot. Before using Kling, read [references/kling-avatar.md](references/kling-avatar.md). Construct and inspect each request without submitting it:

   ```bash
   node "$MUSIC_VIDEO_SKILL/scripts/build-kling-request.mjs" \
     --shots shots.json --shot performance-01 \
     --image rivet.png --audio build/audio/performance-01.wav
   ```

6. Generate maps, metrics, and text deterministically from cited data. Never ask a video model to render factual labels, charts, or typography.
7. Assemble against the untouched canonical master. Strip all generated clip audio. Apply the same palette, typography, texture, and grade to performer and explanatory shots.
8. Run validation again, inspect the complete video at full speed, and preserve the manifest, facts, source assets, provider IDs, hashes, cost report, and editable project.

Read [references/production-gates.md](references/production-gates.md) before a paid proof or final render. Use the bundled [Off the Rails fixture](fixtures/off-the-rails/shots.json) as a 24-second contract example, not as verified publication copy.

## Creative boundary

Allow surprising lyrics, jokes, visual metaphors, camera direction, map choreography, and take selection. Do not allow invention of claims, coordinates, citations, timing, provider mechanics, or spending limits. Fail visibly when the approved take count or budget is exhausted; do not silently switch providers.

## Composition runtime

Use the tested Revideo `0.11.0` runtime under `assets/revideo-replicate-template`. Copy it into the production project before installing so generated files do not modify the attached skill:

```bash
cp -R "$MUSIC_VIDEO_SKILL/assets/revideo-replicate-template" build/revideo
cd build/revideo
npm ci --ignore-scripts
npm run render -- \
  --shots ../../shots.json --facts ../../facts.json --geojson ../../rail.geojson \
  --clips ../../performance-clips.json --master ../../build/audio/master-48k-s24.wav \
  --out-dir ./out
```

`performance-clips.json` maps performance shot IDs to local MP4 paths or HTTP URLs. Omit it to render explicit placeholders. The composition renders performance, map, metric, and title slots from the contracts, stages only the master audio, mutes performance clips, and disables Revideo telemetry. Module authors can run `npm run smoke` from the original bundled template path, where its fixture-relative paths remain intact.
