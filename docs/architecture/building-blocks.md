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
raw artifact → inspection → checks → compare → promote
```

An SFX prop remains `audio.sfx.generate` whether it is fulfilled by Stable Audio through audio.cpp, MOSS-SoundEffect through a Python worker, a Replicate deployment, or a service that does not exist yet.

## Stable layer

The stable layer owns:

- capability IDs such as `audio.sfx.generate` and `vector.author`;
- portable parameters such as duration, seed policy, negative prompt, and source media;
- immutable prompts and input hashes;
- output roles and media contracts;
- inspection and deterministic finishing;
- quality policies;
- comparison, approval, and promotion history.

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
