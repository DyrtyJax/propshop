import type { AuthProviderManifest, AuthProviderId } from "./types.js";

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

const manifests: readonly AuthProviderManifest[] = [
  {
    id: "huggingface",
    aliases: ["hf", "hugging-face"],
    displayName: "Hugging Face",
    env: ["HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"],
    tokenUrl: "https://huggingface.co/settings/tokens",
    officialCli: {
      command: "hf",
      loginArgs: ["auth", "login"],
      statusArgs: ["auth", "whoami"],
      logoutArgs: ["auth", "logout"],
      installHint: "Install the Hugging Face CLI (`pipx install huggingface_hub`) or set HF_TOKEN.",
      credentialArgs: ["auth", "token"],
      parseCredential: (stdout) => stdout.trim() || undefined,
    },
    remoteVerification: {
      url: "https://huggingface.co/api/whoami-v2",
      headers: bearer,
      isValid: (status) => status === 200,
    },
  },
  {
    id: "cloudflare",
    aliases: ["workers-ai", "workers", "cf"],
    displayName: "Cloudflare",
    env: ["CLOUDFLARE_API_TOKEN"],
    tokenUrl: "https://dash.cloudflare.com/profile/api-tokens",
    officialCli: {
      command: "wrangler",
      loginArgs: ["login", "--use-keyring"],
      statusArgs: ["whoami"],
      logoutArgs: ["logout"],
      installHint: "Install Wrangler (`npm install --global wrangler`) or set CLOUDFLARE_API_TOKEN.",
      credentialArgs: ["auth", "token", "--json"],
      parseCredential: (stdout) => {
        try {
          const parsed = JSON.parse(stdout) as { token?: unknown };
          return typeof parsed.token === "string" && parsed.token.length > 0 ? parsed.token : undefined;
        } catch {
          return undefined;
        }
      },
    },
    remoteVerification: {
      url: "https://api.cloudflare.com/client/v4/user/tokens/verify",
      headers: bearer,
      isValid: (status, body) => status === 200 && typeof body === "object" && body !== null && (body as { success?: unknown }).success === true,
    },
  },
  {
    id: "fal",
    aliases: ["fal-ai", "fal.ai"],
    displayName: "fal",
    env: ["FAL_KEY"],
    tokenUrl: "https://fal.ai/dashboard/keys",
    officialCli: {
      command: "fal",
      loginArgs: ["auth", "login"],
      statusArgs: ["auth", "whoami"],
      logoutArgs: ["auth", "logout"],
      installHint: "Install the fal CLI (`pipx install fal`) or set FAL_KEY.",
    },
  },
  {
    id: "replicate",
    aliases: [],
    displayName: "Replicate",
    env: ["REPLICATE_API_TOKEN"],
    tokenUrl: "https://replicate.com/account/api-tokens",
    remoteVerification: {
      url: "https://api.replicate.com/v1/account",
      headers: bearer,
      isValid: (status) => status === 200,
    },
  },
  {
    id: "together",
    aliases: ["together-ai", "together.ai"],
    displayName: "Together AI",
    env: ["TOGETHER_API_KEY"],
    tokenUrl: "https://api.together.ai/settings/api-keys",
  },
  {
    id: "quiver",
    aliases: ["quiver-ai", "quiver.ai"],
    displayName: "Quiver",
    env: ["QUIVERAI_API_KEY"],
    tokenUrl: "https://app.quiver.ai/settings/api-keys",
  },
] as const;

const byName = new Map<string, AuthProviderManifest>();
for (const manifest of manifests) {
  byName.set(manifest.id, manifest);
  for (const alias of manifest.aliases) byName.set(alias, manifest);
}

export function listAuthProviders(): readonly AuthProviderManifest[] {
  return manifests;
}

export function getAuthProvider(name: string): AuthProviderManifest {
  const provider = byName.get(name.toLowerCase());
  if (!provider) {
    throw new Error(`Unknown auth provider '${name}'. Available providers: ${manifests.map((item) => item.id).join(", ")}`);
  }
  return provider;
}

export function isAuthProviderId(value: string): value is AuthProviderId {
  return manifests.some((manifest) => manifest.id === value);
}
