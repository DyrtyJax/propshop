import Replicate from "replicate";
import type {
  Adapter,
  GenerateContext,
  GeneratedOutput,
  JsonValue,
  ProviderConfig,
} from "../types.js";

const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function outputUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(outputUrls);
  if (typeof value === "string" && value.startsWith("http")) return [value];
  if (value instanceof URL) return [value.href];
  if (value && typeof value === "object") {
    const candidate = value as { href?: unknown; url?: unknown };
    if (typeof candidate.href === "string") return [candidate.href];
    if (typeof candidate.url === "function") {
      const result = candidate.url();
      if (typeof result === "string") return [result];
      if (result instanceof URL) return [result.href];
    }
    const stringified = String(value);
    if (stringified.startsWith("http")) return [stringified];
  }
  return [];
}

function extensionFrom(response: Response, url: string, override?: string): string {
  if (override) return override.replace(/^\./, "");
  const mediaType = response.headers.get("content-type")?.split(";")[0];
  if (mediaType && EXTENSIONS[mediaType]) return EXTENSIONS[mediaType];
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
  return match?.[1]?.toLowerCase() ?? "bin";
}

export class ReplicateAdapter implements Adapter {
  readonly name = "replicate";
  readonly version = "1.0.0";
  readonly capabilities = ["*"] as const;

  async check(config: ProviderConfig): Promise<{ ok: boolean; message: string }> {
    const env = config.env ?? "REPLICATE_API_TOKEN";
    return process.env[env]
      ? { ok: true, message: `ready (${env})` }
      : { ok: false, message: `missing environment variable ${env}` };
  }

  async generate(context: GenerateContext): Promise<GeneratedOutput[]> {
    const env = context.provider.env ?? "REPLICATE_API_TOKEN";
    const token = process.env[env];
    if (!token) throw new Error(`Missing environment variable ${env}`);
    if (!context.prop.model) throw new Error(`Prop ${context.prop.id} requires a Replicate model`);

    const replicate = new Replicate({ auth: token });
    const input: Record<string, JsonValue> = {
      ...context.prop.input,
      prompt: context.prop.prompt,
    };
    const output = await replicate.run(context.prop.model as `${string}/${string}`, { input });
    const urls = outputUrls(output);
    if (urls.length === 0) throw new Error("Replicate returned no downloadable output URLs");

    return Promise.all(
      urls.map(async (url): Promise<GeneratedOutput> => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not download output (${response.status})`);
        const mediaType =
          context.prop.output?.mediaType ??
          response.headers.get("content-type")?.split(";")[0] ??
          "application/octet-stream";
        return {
          bytes: new Uint8Array(await response.arrayBuffer()),
          extension: extensionFrom(response, url, context.prop.output?.extension),
          mediaType,
          providerMetadata: {
            // Signed query parameters can contain temporary credentials and do not belong in a run ledger.
            sourceUrl: `${new URL(url).origin}${new URL(url).pathname}`,
          },
        };
      }),
    );
  }
}
