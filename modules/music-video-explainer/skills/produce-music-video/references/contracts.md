# Optional production contracts

Use structured contracts when facts, exact timing, multiple tools, or a handoff make them valuable. Do not require them for a simple creative experiment, and do not confuse a valid manifest with a good film.

## Fact pack

Use `schemas/fact-pack.schema.json` when the piece publishes factual claims.

- Keep each claim atomic enough to approve or reject independently.
- Give verified claims at least one source ID and access date.
- Mark unfinished or interpretive language `draft`.
- Preserve the source's wording separately from the final on-screen phrasing when the distinction matters.

## Shot manifest

Use `schemas/shot-manifest.schema.json` when exact timing, asset lineage, or multiple production branches need coordination.

- Use half-open intervals: start inclusive, end exclusive.
- Keep factual text in `onScreenText` and link relevant `factIds`.
- Keep asset paths relative to the production directory.
- Treat `kind` as descriptive, not as a required shot grammar.
- Record vocal intervals only when exact extraction or sync needs them.
- Record provider/model choices as resolved production history, not as permanent creative defaults.

The validator checks timeline, references, and files. It intentionally does not select a provider, estimate provider-specific pricing, demand a fixed number of takes, or approve taste.

## Decisions and history

Keep human and agent selections separate from the shot manifest. A review packet should say whether a choice is `pending-human`, `human-selected`, or `agent-selected`; never imply approval that did not happen.

Preserve the canonical master, approved candidates, prompts, provider IDs, hashes, costs, retries, and reasons for route changes. Update the record when the edit changes.
