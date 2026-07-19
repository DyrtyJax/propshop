# Portable story contract

Treat a visual story as meaning plus destinations. Do not make the renderer the source of truth.

## Top-level structure

- `project`, `title`, `thesis`, and `audience` define intent.
- `budget` records the hard external-spend ceiling and current spend without selecting a provider.
- `outputs` describe destinations such as video, slides, scroll, or interactive—not duplicate stories.
- `sources` record provenance and licensing.
- `facts` hold claims independently from their visual treatment.
- `assets` point to editable or generated media and record rights.
- `beats` form the sequence. Each beat has a purpose and semantic elements.
- `decisions` preserve human and agent choices that would otherwise disappear into chat history.
- `extensions` carry namespaced experimental data without changing the shared vocabulary.

Output-specific measures belong on the appropriate object. A video may use `durationSeconds`; a scroll story may use `scrollScreens`; a deck may use `slideCount`. They can coexist.

## Element vocabulary

Element `type` values are extensible lowercase identifiers. Prefer this shared vocabulary when it fits:

- `text`, `stat`, `image`, `video`, `shape`
- `chart.bar`, `chart.line`, `chart.area`, `chart.scatter`
- `map.route`, `map.region`, `map.flow`, `map.marker`, `map.label`, `map.camera`
- `diagram.node`, `diagram.edge`
- `embed.generated-video`, `embed.three-scene`

Use stable element IDs. Keep data in `data`, human-readable content in `text`, provenance links in `sourceIds` and `factIds`, style intent in `style`, and temporal or interactive behavior in `motion`. Do not bake values into screenshots if downstream editing matters.

## Portability rules

1. Store geographic coordinates as `[longitude, latitude]` unless an extension explicitly declares otherwise.
2. Reference facts and assets by ID. Validate dangling references before rendering.
3. Put engine-specific settings in an output's `settings` or a namespaced extension.
4. Keep narration, facts, and visual elements separable so one destination can omit or rearrange them.
5. Preserve a representative still or board for review, but never confuse it with the editable source.
6. Record costly or taste-sensitive decisions in `decisions` with a rationale.
7. Treat `budget.maxExternalSpend` as a ceiling. Update `spent` from actual receipts, not estimates.

The JSON Schema is intentionally permissive inside element data and extensions. A community prop can introduce a specialized element without forking the whole contract.
