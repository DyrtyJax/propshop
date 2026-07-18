# SVG module

PropShop treats `vector.svg.generate` as the stable capability. Quiver, a local model wrapper, a design framework, or a future hosted API can produce the candidate; the same SVG inspection, quality policy, run ledger, comparison, and promotion path applies afterward.

## Native SVG inspection

Every SVG is parsed as XML rather than trusted as text with an `.svg` suffix. PropShop records:

- viewBox, dimensions, and aspect ratio;
- element, attribute, group, path, path-command, definition, and nesting counts;
- detected colors, gradients, filters, transforms, text, and raster images;
- title, description, and accessible-name signals;
- IDs and duplicates;
- scripts, event handlers, doctypes, active CSS, foreign objects, external URLs, and other unsafe features.

Active or externally loaded content and duplicate IDs fail every SVG build. Embedded raster images also fail by default: a vector prop should remain vector unless `allowRasterImages: true` is deliberate.

Structural checks are useful production constraints, not a synthetic “taste score.” Compare rendered takes and promote one intentionally.

```yaml
checks:
  svg:
    requireViewBox: true
    requireTitle: true
    allowText: false
    allowRasterImages: false
    minPaths: 1
    maxPaths: 80
    maxPathCommands: 1200
    maxElements: 180
    maxDepth: 12
    maxColors: 5
    maxGradients: 2
    maxFilters: 0
    aspectRatio: { min: 0.95, max: 1.05 }
```

## Quiver adapter

[QuiverAI](https://docs.quiver.ai/api) is the first native-vector hosted adapter. It returns editable SVG directly rather than generating pixels and tracing them afterward.

```bash
export QUIVERAI_API_KEY="..."
```

```yaml
providers:
  vectors:
    adapter: quiver
    env: QUIVERAI_API_KEY
    options:
      defaultModel: arrow-1.1
      timeoutMs: 120000
      maxOutputBytes: 8388608
      instructions: Clean geometry, intentional negative space, no generic AI gradients.

props:
  - id: portal-mark
    kind: vector
    capability: vector.svg.generate
    provider: vectors
    model: arrow-1.1
    prompt: A dimensional portal emblem for a haunted arcade admission ticket
    variants: 4
    input:
      width: 512
      height: 512
      temperature: 0.45
      maxOutputTokens: 8192
```

The adapter folds the project style description and palette into Quiver instructions, forces non-streaming one-output requests per PropShop take, and records the model ID, request digest, response ID, trace ID, and credit debit. API keys and signed reference query strings are never written to the ledger.

Quiver does not currently expose a deterministic seed. PropShop records that limitation instead of inventing reproducibility it cannot provide; the returned bytes remain immutable and hashed.

## Local and framework command protocol

The `svg-command` adapter is the bridge for StarVector, InternSVG, an OpenPencil export workflow, an internal renderer, or any executable that can speak a tiny JSON protocol. PropShop invokes it directly without a shell and passes only explicitly allowlisted environment variables.

Provider:

```yaml
providers:
  local-vector:
    adapter: svg-command
    options:
      executable: python3
      args: [./tools/starvector_driver.py]
      provenanceFiles: [./tools/starvector_driver.py]
      passEnv: [HF_TOKEN, CUDA_VISIBLE_DEVICES]
      defaultModel: starvector-1b
      models:
        starvector-1b:
          source: starvector/starvector-1b-im2svg
          revision: PINNED_HUGGING_FACE_COMMIT
          sha256: OPTIONAL_WEIGHT_PACKAGE_SHA256
          license:
            id: Apache-2.0
            restrictions: []
```

Handshake:

```bash
python3 ./tools/starvector_driver.py --propshop-describe
```

```json
{
  "protocol": 1,
  "name": "starvector-driver",
  "version": "1.0.0",
  "capabilities": ["vector.svg.generate"]
}
```

For generation, the executable reads one JSON request from stdin and writes one JSON response to stdout:

```json
{
  "outputs": [
    {
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\">...</svg>",
      "metadata": { "inferenceMs": 840 }
    }
  ],
  "metadata": { "backend": "cuda" }
}
```

The request contains protocol, capability, prompt, take number, resolved model/options, portable parameters, and project style. The run records the driver/version handshake, executable digest, explicitly listed driver-file digests, request digest, model revision/license, and bounded logs—but not the raw command arguments or ambient environment.

Copy the working no-model protocol example in [`examples/svg-command`](../../examples/svg-command/) before wrapping a real runtime.
