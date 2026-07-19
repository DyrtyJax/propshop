---
name: produce-visual-story
description: Produce and revise editable visual stories across video, presentations, interactive pages, scroll-driven narratives, maps, diagrams, and motion graphics. Use when an agent must turn a script, dataset, fact pack, brief, or collection of assets into a coherent visual sequence; choose between deterministic graphics, specialist creative tools, 3D engines, and generated video; preserve sources and editability; or invite human direction at high-leverage visual and motion decisions.
---

# Produce Visual Story

Act as a visual-story producer, not an advocate for one renderer. Decide the audience, story, and destination before choosing tools.

## Start with the portable story

For substantial work, express the story with `schemas/story.schema.json`. Read `references/story-contract.md` before authoring the file. Keep facts, sources, assets, beats, and semantic visual elements separate from renderer-specific code.

Use `examples/portable-story.json` as a cross-format starting point when useful.

Validate the contract and create an editorial board with:

```sh
node scripts/storyboard.mjs --input story.json --out review/board.html --check-assets
```

The board is a structural preview, not the finished design.

## Choose the rendering route

Read `references/rendering-routes.md`. Match the route to the destination and the reason it needs to exist:

- Build slides in a native editable presentation format when the artifact will be presented or revised as slides.
- Build scroll stories as semantic HTML with progressive enhancement and reduced-motion behavior.
- Use deterministic browser graphics for exact text, diagrams, data, and repeatable frame rendering.
- Use MapLibre, deck.gl, D3, or GIS tooling when geography carries meaning. Read `references/map-primitives.md`.
- Reach for Blender or Unreal only when real spatial, camera, lighting, simulation, or interactive-3D constraints justify them.
- Use generated video for organic footage and visual invention. Never ask it to be the source of truth for factual text, charts, or maps.

No route is mandatory. The story contract should survive a renderer change.

## Work in replaceable branches

1. Establish the thesis, audience, destinations, external-spend ceiling, facts, and rights constraints.
2. Offer a small number of meaningfully different treatments when the direction is open.
3. Make one representative style frame at the real output size.
4. Make a short motion, map, or interaction spike that tests the hardest visual claim.
5. Build a rough full sequence before polishing every shot.
6. Render, inspect, revise, and preserve editable source artifacts beside exports.

## Invite human direction where it compounds

Use adaptive checkpoints. Combine them for small or low-risk work; do not manufacture approvals.

- Confirm treatment and destination when those choices change the work materially.
- Show the visual system before propagating it.
- Show the representative motion, map, or interaction spike before building the sequence.
- Show the rough sequence and remaining budget before expensive final rendering or paid generation.

Record decisions in the story file. Keep the agent's reasoning, alternatives, cost implications, and uncertainties visible enough for a person to steer.

## Finish with quality gates

Read `references/quality-gates.md`. Verify factual provenance, destination-specific legibility, accessibility, deterministic seeking where applicable, asset rights, and recoverable editable sources. A polished export without its source structure is not complete.
