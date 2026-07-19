# Cloudflare Workers AI SVG adapter

`cloudflare-svg` asks a code-capable model on Cloudflare Workers AI for a native SVG, then hands that SVG to PropShop's normal safety and structural inspection. It is an inexpensive generalist route, not a claim that one built-in model is always the best illustrator.

The adapter calls Cloudflare's provider-direct REST endpoint. It does not use an inference aggregator or send prompts through a PropShop service.

## Authentication

Create a Workers AI API token and expose the provider-native credentials:

```sh
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
propshop doctor
```

The API token needs Workers AI read and edit permissions. Do not put either credential in a Propfile. A future PropShop auth broker can supply Wrangler or keychain credentials through the adapter's credential-resolver interface; environment variables are the initial portable path.

## Configuration

```yaml
providers:
  cloudflare:
    adapter: cloudflare-svg
    options:
      defaultModel: "@cf/qwen/qwen2.5-coder-32b-instruct"
      timeoutMs: 120000
      maxOutputBytes: 2097152

props:
  - id: shop-mark
    kind: logo
    prompt: >-
      A joyful little forge inside an open toolbox, with one four-point spark.
      Bold hand-cut shapes and excellent negative space. No lettering.
    provider: cloudflare
    variants: 2
    input:
      width: 64
      height: 64
      temperature: 0.8
      maxOutputTokens: 4096
    checks:
      svg:
        requireViewBox: true
        requireTitle: true
        requireDescription: true
        allowText: false
        allowRasterImages: false
```

The default Qwen2.5-Coder model is a replaceable, low-cost code model. Set `model` on a prop or `defaultModel` on the provider to use another Workers AI text-generation model. `temperature`, `topP`, `topK`, `maxOutputTokens`, and repetition/frequency/presence penalties are portable inputs supported by this adapter. PropShop does not force a seed and records the route as non-deterministic.

Cloudflare may return the model's prose inside a Markdown fence despite the instruction. The adapter extracts the first complete SVG document and rejects missing or unterminated SVG. PropShop's native SVG inspector remains the authority for scripts, external resources, accessibility, and project-specific checks.

## Usage and cost evidence

Run metadata includes the model, a request digest, Cloudflare's trace identifier, and any `usage` or cost object returned by the API. PropShop does not turn token counts into a pretend exact charge inside the adapter. Cost quoting belongs to the shared pricing layer, where the official rate, retrieval time, and confidence can be recorded independently.

Current API and model details should be checked against Cloudflare's official documentation:

- [Workers AI REST API](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [Qwen2.5-Coder 32B model](https://developers.cloudflare.com/workers-ai/models/qwen2.5-coder-32b-instruct/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
