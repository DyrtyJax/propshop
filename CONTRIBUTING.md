# Contributing to PropShop

PropShop is an early workshop. Small, demonstrable contributions are more valuable than large abstractions.

## Good first contributions

- Add a validator for a concrete artifact property.
- Improve a manifest error message.
- Add a beautiful, reproducible example Propfile.
- Propose an adapter with a real provider and sample output.
- Make run provenance more complete without putting secrets in it.

For a new adapter, open an issue first with:

1. the capability and provider it exposes;
2. whether it runs locally or sends data elsewhere;
3. the model/code license constraints;
4. the metadata needed to reproduce a run;
5. one small example Propfile.

Adapters translate a stable PropShop capability into a provider request. Prefer portable fields such as `durationSeconds`, `seed`, `negativePrompt`, `viewBox`, and `references`; keep provider-only experiments under `input.advanced.<adapter>`. An adapter must declare its version and supported capabilities, preserve model and runtime license provenance, and never write secrets or signed URLs into a run record. See [Building blocks, not backends](docs/architecture/building-blocks.md). For an external executable, implement the small [`svg-command` protocol](docs/adapters/svg.md) before proposing a new in-process dependency.

## Development

```bash
npm install
npm run check
npm run build
node dist/cli.js plan --file examples/retro-interface/Propfile.yaml
```

Tests must not require paid credentials. Provider integrations should keep network calls behind their adapter and use fixtures in tests. Exercise the real request shape, transport safety, deterministic inputs, output-size limits, and artifact metadata in contract tests.

## Project boundaries

Core owns:

- manifest parsing;
- orchestration and lifecycle;
- immutable run records;
- artifact hashes and metadata;
- validation and promotion.

Adapters own:

- provider authentication;
- provider-specific inputs;
- generation or retrieval;
- translating outputs into ordinary artifact bytes;
- provider/model/license metadata.

Please do not add generic “AI” abstractions without a working prop that needs them.
