<p align="center">
  <img src="brand/propshop-banner.svg" alt="PropShop — the creative build system for coding agents" width="100%" />
</p>

<p align="center">
  <strong>Need a thing? Send it to PropShop.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/propshop"><img src="https://img.shields.io/npm/v/propshop?color=ff5a47&label=npm" alt="npm version" /></a>
  <a href="https://github.com/DyrtyJax/propshop/actions/workflows/ci.yml"><img src="https://github.com/DyrtyJax/propshop/actions/workflows/ci.yml/badge.svg" alt="shop check" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-201827" alt="Apache 2.0 license" /></a>
</p>

PropShop turns creative asset requests into reproducible builds. A coding agent can describe what a project needs; specialist providers make the raw material; PropShop records, validates, compares, and promotes the result.

It is the missing workshop between an agent saying “this interface needs a satisfying glassy hover” and a production-ready file appearing in the repository.

> **Early workshop release:** The build contract is working. The adapter ecosystem is just beginning.

## The idea

```text
Fable / Sol / Codex
        │  writes or edits a Propfile
        ▼
    propshop build
        │
        ├── OpenPencil / Iconify       vector
        ├── audio.cpp / ElevenLabs     audio
        ├── ComfyUI / Replicate        raster + video
        └── Blender                    3D
        │
        ▼
hashed takes → compare → promote → production assets
```

PropShop does not try to be an image, audio, or 3D model. It provides the stable build layer around specialist tools:

- one declarative `Propfile.yaml`;
- capability-oriented provider adapters;
- immutable run records with prompts, model names, environment, and SHA-256 hashes;
- multiple takes without filename chaos;
- explicit promotion into production assets;
- a `Propfile.lock` recording exactly what was chosen.

## Open a shop

PropShop currently requires Node.js 20 or newer.

```bash
npm install --global propshop
propshop init my-project
cd my-project
propshop plan
propshop build
```

Or take a quick look without installing globally:

```bash
npx propshop@latest init my-project
```

To run the repository's complete retro-interface example from source:

```bash
git clone https://github.com/DyrtyJax/propshop.git
cd propshop
npm install && npm run build
npm link
propshop plan --file examples/retro-interface/Propfile.yaml
propshop build --file examples/retro-interface/Propfile.yaml
propshop runs --file examples/retro-interface/Propfile.yaml
```

The example uses the deterministic `mock` adapter, so it needs no keys and spends no money. It creates branded preview cards while exercising the real run ledger, hashing, variants, and promotion flow.

## A Propfile

```yaml
version: 1
project: haunted-arcade
outputDir: props

style:
  description: CRT glow and printed ephemera; charming, not cyberpunk
  palette: ["#17121f", "#ff4db8", "#f4efff"]
  references: []

providers:
  preview:
    adapter: mock
  replicate:
    adapter: replicate
    env: REPLICATE_API_TOKEN

props:
  - id: portal-icon
    kind: vector
    prompt: An ornate dimensional portal with a handmade 2002 web-game feel
    provider: preview
    variants: 3
    tags: [navigation, icon]

  - id: menu-hover
    kind: sfx
    prompt: A short glassy arcade hover with a dusty CRT click
    provider: replicate
    model: stability-ai/stable-audio-3
    variants: 4
    input:
      duration: 0.8
```

Provider-specific fields belong under `input`; the adapter always injects the prop's prompt. A provider can be changed without changing the prop's identity.

## Commands

| Command | Job |
| --- | --- |
| `propshop init` | Open a new shop with a starter Propfile |
| `propshop validate` | Validate references, providers, IDs, and inputs |
| `propshop plan [ids...]` | Show the call sheet without generating anything |
| `propshop doctor` | Check adapters and credentials |
| `propshop build [ids...]` | Generate takes and write an immutable run |
| `propshop runs` | List recent runs |
| `propshop show <run>` | Inspect complete provenance for a run |
| `propshop promote <id> --run <run>` | Copy an approved prop into production and lock it |

## What exists today

- `mock` adapter for deterministic, keyless development and CI;
- generic Replicate adapter for hosted models that return downloadable artifacts;
- YAML validation with useful errors;
- selective builds and up to 16 variants per prop;
- atomic run records and content hashes;
- promotion ledger in `Propfile.lock`;
- tests on Node.js 20 and 22.

## Where contributors can make this fun

The highest-value next steps are deliberately separable:

1. **OpenPencil adapter** with native vector linting and rendered visual checks.
2. **audio.cpp adapter** with loudness, duration, silence, and seamless-loop validators.
3. **ComfyUI adapter** that captures the workflow, model hashes, seed, and custom-node revisions.
4. **Contact sheet UI** for comparing takes and promoting one.
5. **External adapter SDK** so providers can live outside the core package.
6. **Agent skill and MCP server** exposing `plan`, `build`, `show`, and `promote` safely.

See [CONTRIBUTING.md](CONTRIBUTING.md) before taking a prop ticket.

## Design principle

The core stays broad by staying small. It owns recipes, runs, artifacts, validation, and promotion. It does not absorb the specialist creative tools it coordinates.

PropShop is licensed under [Apache 2.0](LICENSE). Generated assets and model weights may carry their own licenses; adapters should record those before a prop is promoted.
