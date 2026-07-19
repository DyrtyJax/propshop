# Provider authentication

PropShop delegates identity to model providers instead of inventing a shared account. Credentials never belong in `Propfile.yaml`, command arguments, run records, or logs.

```bash
propshop auth login cloudflare
propshop auth login huggingface
propshop auth login fal
propshop auth login replicate
propshop auth status
propshop auth status replicate --verify
propshop auth logout replicate
```

## Provider registry

| Provider | Preferred login | Environment override |
| --- | --- | --- |
| Hugging Face | `hf auth login` | `HF_TOKEN` |
| Cloudflare | `wrangler login --use-keyring` | `CLOUDFLARE_API_TOKEN` |
| fal | `fal auth login` | `FAL_KEY` |
| Replicate | OS credential store | `REPLICATE_API_TOKEN` |
| Together AI | OS credential store | `TOGETHER_API_KEY` |
| Quiver | OS credential store | `QUIVERAI_API_KEY` |

Hugging Face uses its browser/device login. Wrangler uses OAuth and asks Wrangler to encrypt its credential file with a key held by the operating-system keychain. fal owns its browser login and local profile. PropShop does not copy these provider-managed sessions into its own store.

For API-key-only providers, `auth login` accepts the key through a hidden terminal prompt. On macOS it is stored as a generic-password item in Keychain. On Linux PropShop uses Secret Service through `secret-tool`; install your distribution's `libsecret-tools` package when it is absent. PropShop currently refuses to persist a key on Windows rather than falling back to plaintext; use the environment variable until a Credential Manager backend lands.

For automation, pipe the key over stdin. This avoids shell history and process-list exposure:

```bash
printf '%s' "$REPLICATE_API_TOKEN" | propshop auth login replicate --token-stdin
```

Do not write a literal token into that command. Environment variables always take precedence, then credentials managed by the provider's official CLI, then PropShop's OS-keychain entry.

## Status and verification

`propshop auth status` only reports whether a source is available. It never prints a token, token prefix, account response, or provider CLI output. `--verify` makes a bounded request to a documented identity/token endpoint where one exists. Currently remote verification is supported for Hugging Face, Cloudflare, and Replicate. Other providers report local presence without pretending it proves account or billing status.

Official CLI credentials are read only when a provider exposes a supported safe command. Cloudflare uses `wrangler auth token --json`; Hugging Face uses `hf auth token`. Captured output is bounded and stays inside the broker so adapters can authenticate without copying credentials into the environment.

## CI and servers

Interactive login is deliberately disabled without a terminal. Use a short-lived environment credential supplied by the platform secret manager, or workload identity/OIDC when the provider supports it. A failed noninteractive login prints the exact environment variable or stdin command to use.

Provider definitions live in `src/auth/registry.ts`. A manifest declares aliases, environment variables, official CLI commands, the account-key page, and an optional safe verification endpoint. This keeps authentication extensible without coupling it to asset capabilities or model selection.

References: [Hugging Face CLI authentication](https://huggingface.co/docs/huggingface_hub/en/guides/cli), [Wrangler authentication and keyring storage](https://developers.cloudflare.com/workers/wrangler/commands/general/), [fal CLI authentication](https://fal.ai/docs/api-reference/cli/auth), and [Replicate HTTP authentication](https://replicate.com/docs/reference/http/).
