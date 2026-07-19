# Rendering routes

Choose per destination and per beat. A single project can mix routes while retaining one story contract.

## Native editable presentations

Use a presentation-native authoring tool when slides are the product. Keep text as text, charts as charts, and visual groups editable. Export PDF or video only after checking the native deck. Use the portable story as editorial source, not as a replacement for the deck's layout model.

## Deterministic browser graphics

Use HTML, CSS, SVG, Canvas, or WebGL when exact text, data, diagrams, repeatable timing, or responsive variants matter.

- HyperFrames is a strong current route for agent-authored browser animation and deterministic frame rendering.
- Remotion is useful when the team already thinks in React components and frame-indexed composition.
- Motionly may help when a visual timeline editor is important, but verify current maturity before depending on it.

Renderers change quickly. Pin versions, prototype the hardest beat, and keep renderer code downstream of the story contract.

## Scroll and interactive stories

Start with semantic HTML and a readable nonanimated state. Add scroll progress, sticky scenes, WebGL, or Canvas only where the interaction teaches something. Respect reduced-motion preferences, keyboard navigation, small screens, and deep links. Prefer progressive enhancement over a video embedded in a long page.

## Maps and spatial data

- Use MapLibre for explorable vector maps and camera movement.
- Add deck.gl for large spatial layers and GPU-heavy visualization.
- Use D3 for bespoke projections, annotations, and small deterministic diagrams.
- Use QGIS or another GIS tool for preprocessing, validation, and cartographic analysis.

Do not use a geographic engine merely to draw a decorative line. Read `map-primitives.md` before building factual maps.

## 3D engines

Use Blender for authored geometry, lighting, simulation, compositing, and reusable camera scenes. Use Unreal when real-time environments, game-engine interaction, virtual production, or its asset ecosystem produces real value. Both impose setup and review costs. They are not default replacements for a strong 2D visual system.

## Generated and closed video tools

Use generated video for organic motion, characters, atmospherics, transitions, or visual invention. It can be the right route even when it is closed. Composite factual labels, maps, interface text, and charts deterministically afterward. Preserve prompts, seeds when supported, model/version, edit decisions, and commercial-use terms beside the asset record.
