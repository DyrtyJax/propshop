# Portable visual stories

The bundled `visual-story` module helps an agent turn source material into one editable narrative that can feed a presentation, video, scroll story, interactive experience, or another destination.

It is intentionally not a renderer. Its stable artifact is a small JSON story contract containing:

- destinations and their constraints;
- facts, sources, assets, and rights;
- ordered story beats;
- semantic elements such as text, charts, maps, diagrams, and media embeds;
- motion or interaction intent;
- human and agent decisions;
- a provider-neutral external-spend ceiling and actual spend.

Specialized tools remain replaceable. An agent can render exact browser motion with HyperFrames, build a native deck, use MapLibre for a geographic scene, hand a spatial shot to Blender or Unreal, or generate organic footage in a closed app without rewriting the editorial source.

## Attach it

```bash
propshop module inspect visual-story
propshop module attach visual-story --agent claude --project ./my-project
```

Use `--agent codex` to attach it under `.agents/skills` instead. The attached skill is named `produce-visual-story`.

## Start a story

Copy `.claude/skills/produce-visual-story/examples/portable-story.json`, or ask the attached agent to create a story contract from your brief and source pack. Then validate it and create a structural review board:

```bash
node .claude/skills/produce-visual-story/scripts/storyboard.mjs \
  --input story.json \
  --out review/board.html \
  --check-assets
```

For Codex, replace `.claude/skills` with `.agents/skills`.

The generated board is deliberately self-contained and dependency-free. It previews sequence, claims, destinations, map paths, simple charts, and unresolved decisions. It is not final design or production cartography.

## Extend it without forking the contract

Element types are open lowercase identifiers. A community prop can add a specialized type such as `music.waveform`, `game.camera-path`, or `scientific.molecule` and keep its payload under `data`. Renderer-specific settings belong under an output's `settings` or a namespaced `extensions` object.

The useful compatibility promise is semantic: stable IDs, explicit references, portable coordinates, preserved sources, and editable data. It is not a promise that every renderer understands every community element. A renderer should report unsupported elements rather than silently flatten them.

The module uses adaptive review: small work can proceed quickly, while treatment, the visual system, a representative motion or interaction spike, and the rough sequence become visible human steering points when they have meaningful downstream cost.
