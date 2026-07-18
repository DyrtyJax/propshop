# Production contracts

Use `schemas/fact-pack.schema.json` for claims and citations. A verified claim needs at least one source ID. Keep claims atomic enough that a reviewer can accept or reject each one independently. Mark unfinished language `draft`.

Use `schemas/shot-manifest.schema.json` for the timeline. Shots must:

- start at zero, remain ordered, and cover the full render without gaps or overlaps;
- use half-open intervals (`startSeconds` inclusive, `endSeconds` exclusive);
- cite fact IDs for every `map` or `metric` shot;
- provide a vocal interval and performance direction for every `performance` shot;
- keep explanatory text in `onScreenText`, where it remains editable;
- reference assets relative to the manifest directory.

Keep the canonical character description in `performer.canonicalPrompt`. Put only shot-specific emotion, action, and framing in `performanceDirection`. This reduces identity drift while leaving room for creative variation.

The manifest is the production ledger, not merely a prompt. Update it when timing or sources change and rerun validation before spending money.
