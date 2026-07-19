# Building blocks, not backends

PropShop's durable abstraction is a creative capability. Models, runtimes, transports, and vendors are replaceable implementations.

```text
Propfile
   │
   ▼
capability + normalized parameters + quality policy
   │
   ▼
adapter
   ├── local process
   ├── warm HTTP service
   ├── hosted model API
   └── creative framework
   │
   ▼
raw artifact → inspection → checks → human/agent decision → promote
```

An SFX prop remains `audio.sfx.generate` whether it is fulfilled by Stable Audio through audio.cpp, MOSS-SoundEffect through a Python worker, a Replicate deployment, or a service that does not exist yet. A vector prop likewise remains `vector.svg.generate` across Quiver, StarVector, InternSVG, and an editable OpenPencil workflow.

For compound creative work, the portable unit can be larger than one generated file. The `visual-story` module keeps destinations, facts, beats, semantic elements, and decisions stable while a native presentation tool, browser renderer, map engine, 3D engine, or generated-video service fulfills individual branches. This is composition of capabilities, not a new monolithic backend.

## Stable layer

The stable layer owns:

- capability IDs such as `audio.sfx.generate` and `vector.author`;
- portable parameters such as duration, seed policy, negative prompt, and source media;
- immutable prompts and input hashes;
- output roles and media contracts;
- inspection and deterministic finishing;
- quality policies;
- comparison, approval, and promotion history.

For creative work, approval is not synonymous with a passing validator. Preserve whether a candidate was `human-selected` or `agent-selected`, the evidence presented at the decision, and what branch may run next.

The stable layer must never expose a model's mutable CLI flags as PropShop's public contract.

## Replaceable layer

An adapter maps the stable request onto one provider. Its record must identify:

- adapter name, version, and protocol;
- transport and endpoint or executable digest;
- engine version or revision;
- model family, source, revision, weight digest, and license;
- backend, device, precision, and relevant runtime options;
- canonical resolved request and its SHA-256 digest;
- actual seed and provider job ID when one exists.

Runtime code and model weights have independent licenses. An Apache runtime can execute gated or noncommercial weights; PropShop must never collapse those facts into one “open source” badge.

## Parameters and escape hatches

Portable parameters use model-neutral names:

```yaml
input:
  durationSeconds: 1.2
  seed: locked
  negativePrompt: music, speech, long reverb tail
  inferenceSteps: 8
  guidanceScale: 1
```

Provider experiments live under a namespaced escape hatch:

```yaml
input:
  advanced:
    audioCpp:
      requestOptions:
        sampler: pingpong
        apg_scale: 1.0
```

Unknown provider settings should never silently become part of the portable contract.

## Seed policies

- `locked` (default): derive a stable seed from the normalized prop and take number.
- integer: use it as the first take's seed and increment for subsequent takes.
- `fresh`: generate a new seed, then record it in the run.

A seed provides best-effort reproducibility, not a promise of identical PCM across engine revisions, precision modes, and GPU kernels. PropShop's stronger guarantee is that the exact produced bytes are hashed, preserved, and attributable.

## Adapter protocol direction

Built-in adapters currently implement the TypeScript compatibility interface. Community adapters should move out of process behind a versioned JSON-RPC-over-stdio protocol:

1. explicit executable and exact version;
2. handshake with protocol and capability descriptors;
3. `doctor` and side-effect-free `resolve` phases;
4. event-streamed execution with progress, artifacts, usage, warnings, and typed failures;
5. assigned staging directories rather than arbitrary output paths;
6. cancellation and finite retry semantics;
7. package integrity captured in the lock.

MCP remains the agent-facing interface to PropShop. It is not the backend adapter ABI: agent calls are a poor fit for large artifacts, execution isolation, cancellation, and deterministic build lifecycle.

## Run layout

```text
.propshop/runs/<run-id>/
  events.ndjson       append-only state transitions
  run.json            current materialized view
  artifacts/          content-hashed raw takes
```

Future finishing stages should preserve raw output and create lineage-linked masters and derivatives. `Propfile.lock` should evolve toward adapter/engine/model resolution; approved production state should eventually move to a separate production ledger.

## Partial execution and human review

Long creative runs should not disappear into a monolith. A run is a resumable graph of replaceable branches:

1. execute only enough work to reach the next useful preview;
2. preserve candidates and immutable inputs;
3. expose artifacts, cost, uncertainty, and a recommendation;
4. invite a human decision when taste or risk has large downstream consequences;
5. rerun only the affected branch after the decision.

Mechanical conversions and cheap diagnostics can remain autonomous. Direction, music, identity, representative motion, rough cuts, rights, and publication are common human gates unless the user explicitly delegates them. See [Module authoring](../module-authoring.md).

## Security boundary

- Never execute through a shell.
- Never download weights invisibly during `build`.
- Never serialize secret values or signed URL query strings.
- Remote local-runtime servers require explicit opt-in.
- Enforce time and output-byte limits.
- Sniff and inspect artifacts rather than trusting extensions.
- Require explicit plugin installation and pin its integrity.
- Treat a subprocess as isolation from protocol bugs, not as a security sandbox.

The architectural line to defend is simple:

> Capabilities are stable; providers, models, transports, and creative runtimes are replaceable.
