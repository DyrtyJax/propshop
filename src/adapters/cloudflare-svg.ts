import { isIP } from "node:net";
import { z } from "zod";
import { canonicalJson, sha256 } from "../lib/files.js";
import type { Adapter, GenerateContext, GeneratedOutput, JsonValue, ProviderConfig } from "../types.js";

const DEFAULT_MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";

const optionsSchema = z.object({
  baseUrl: z.string().url().default("https://api.cloudflare.com/client/v4"),
  allowCustomBaseUrl: z.boolean().default(false),
  accountIdEnv: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).default("CLOUDFLARE_ACCOUNT_ID"),
  defaultModel: z.string().min(1).default(DEFAULT_MODEL),
  timeoutMs: z.number().int().positive().max(600_000).default(120_000),
  maxOutputBytes: z.number().int().positive().max(16 * 1024 * 1024).default(2 * 1024 * 1024),
  maxResponseBytes: z.number().int().positive().max(32 * 1024 * 1024).default(8 * 1024 * 1024),
  instructions: z.string().min(1).optional(),
});

const inputSchema = z.object({
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  viewBox: z.object({
    minX: z.number(),
    minY: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  instructions: z.string().min(1).optional(),
  temperature: z.number().min(0).max(5).optional(),
  topP: z.number().min(0).max(2).optional(),
  topK: z.number().int().min(1).max(50).optional(),
  maxOutputTokens: z.number().int().min(1).max(32_768).default(4_096),
  repetitionPenalty: z.number().min(0).max(2).optional(),
  frequencyPenalty: z.number().min(0).max(2).optional(),
  presencePenalty: z.number().min(0).max(2).optional(),
});

export type CloudflareSvgOptions = z.infer<typeof optionsSchema>;

export interface CloudflareCredentials {
  accountId: string;
  token: string;
  /** A non-secret description suitable for provenance, for example an environment variable name. */
  source: string;
}

/**
 * Credential resolvers are deliberately injectable so a future PropShop auth broker can delegate
 * to Wrangler or an OS keychain without changing the generation adapter.
 */
export interface CloudflareCredentialResolver {
  resolve(config: ProviderConfig, options: CloudflareSvgOptions): Promise<CloudflareCredentials>;
}

class EnvironmentCredentialResolver implements CloudflareCredentialResolver {
  async resolve(config: ProviderConfig, options: CloudflareSvgOptions): Promise<CloudflareCredentials> {
    const tokenEnv = config.env ?? "CLOUDFLARE_API_TOKEN";
    const accountId = process.env[options.accountIdEnv]?.trim();
    const token = process.env[tokenEnv]?.trim();
    const missing = [
      ...(accountId ? [] : [options.accountIdEnv]),
      ...(token ? [] : [tokenEnv]),
    ];
    if (missing.length > 0) throw new Error(`Missing environment variable${missing.length === 1 ? "" : "s"} ${missing.join(", ")}`);
    return { accountId: accountId!, token: token!, source: `environment (${options.accountIdEnv}, ${tokenEnv})` };
  }
}

function apiBase(options: CloudflareSvgOptions): URL {
  const base = new URL(options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`);
  const host = base.hostname.replace(/^\[|\]$/g, "");
  const loopback = host === "localhost" || host.startsWith("127.") || host === "::1" || (isIP(host) === 6 && host === "0:0:0:0:0:0:0:1");
  if (base.origin !== "https://api.cloudflare.com" && !loopback && !options.allowCustomBaseUrl) {
    throw new Error(`Refusing custom Cloudflare API origin ${base.origin}; set allowCustomBaseUrl: true explicitly`);
  }
  return base;
}

function endpoint(options: CloudflareSvgOptions, accountId: string, model: string): URL {
  const safeAccountId = encodeURIComponent(accountId);
  const safeModel = model.split("/").map(encodeURIComponent).join("/");
  return new URL(`accounts/${safeAccountId}/ai/run/${safeModel}`, apiBase(options));
}

function dimensions(context: GenerateContext, input: z.infer<typeof inputSchema>): string | undefined {
  if (input.viewBox) {
    const { minX, minY, width, height } = input.viewBox;
    return `Use viewBox="${minX} ${minY} ${width} ${height}".`;
  }
  if (input.width && input.height) return `Use viewBox="0 0 ${input.width} ${input.height}".`;
  if (input.width) return `Target a width of ${input.width} logical units and choose a harmonious height.`;
  if (input.height) return `Target a height of ${input.height} logical units and choose a harmonious width.`;
  return context.prop.kind === "icon" ? "Use a square viewBox suitable for an icon." : undefined;
}

function requestFor(context: GenerateContext, options: CloudflareSvgOptions): Record<string, JsonValue> {
  const input = inputSchema.parse(context.parameters);
  const system = [
    "You are an expert vector art director and SVG engineer.",
    "Return exactly one self-contained, production-ready SVG document and nothing else: no Markdown fence, explanation, or preamble.",
    "Use xmlns and a viewBox. Include a concise <title> and <desc>. Use clean editable vector geometry and intentional visual hierarchy.",
    "Do not use scripts, event handlers, foreignObject, external URLs, raster images, animation, or active CSS.",
    "Exercise strong visual judgment. Honor the brief without reducing it to a generic template.",
    options.instructions,
  ].filter((part): part is string => Boolean(part)).join("\n");
  const user = [
    `Create this SVG asset:\n${context.prop.prompt}`,
    dimensions(context, input),
    context.style?.description ? `Art direction: ${context.style.description}` : undefined,
    context.style?.palette.length ? `Preferred palette: ${context.style.palette.join(", ")}` : undefined,
    input.instructions,
  ].filter((part): part is string => Boolean(part)).join("\n");
  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
    max_tokens: input.maxOutputTokens,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.topP !== undefined ? { top_p: input.topP } : {}),
    ...(input.topK !== undefined ? { top_k: input.topK } : {}),
    ...(input.repetitionPenalty !== undefined ? { repetition_penalty: input.repetitionPenalty } : {}),
    ...(input.frequencyPenalty !== undefined ? { frequency_penalty: input.frequencyPenalty } : {}),
    ...(input.presencePenalty !== undefined ? { presence_penalty: input.presencePenalty } : {}),
  };
}

async function boundedResponse(response: Response, maximum: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) throw new Error(`Cloudflare response exceeded ${maximum} bytes`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error(`Cloudflare response exceeded ${maximum} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function extractSvg(generated: string): string {
  const text = generated.replace(/^\uFEFF/, "").trim();
  const start = text.search(/<svg\b/i);
  if (start < 0) throw new Error("Cloudflare model response did not contain an SVG document");
  const rest = text.slice(start);
  const close = /<\/svg\s*>/i.exec(rest);
  if (close) return rest.slice(0, close.index + close[0].length).trim();
  const selfClosing = /^<svg\b[^>]*\/\s*>/is.exec(rest);
  if (selfClosing) return selfClosing[0].trim();
  throw new Error("Cloudflare model response contained an unterminated SVG document");
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const values = value.map(jsonValue);
    return values.some((item) => item === undefined) ? undefined : values as JsonValue[];
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => [key, jsonValue(item)] as const);
    if (entries.some(([, item]) => item === undefined)) return undefined;
    return Object.fromEntries(entries) as Record<string, JsonValue>;
  }
  return undefined;
}

function errorMessage(bodyText: string): string {
  try {
    const body = JSON.parse(bodyText) as { errors?: Array<{ code?: number | string; message?: string }>; messages?: unknown };
    const errors = body.errors?.map((item) => [item.code, item.message].filter((value) => value !== undefined).join(": ")).filter(Boolean);
    if (errors?.length) return errors.join("; ").slice(0, 2_000);
  } catch {
    // Keep a bounded plain-text response below.
  }
  return bodyText.slice(0, 2_000);
}

export class CloudflareSvgAdapter implements Adapter {
  readonly name = "cloudflare-svg";
  readonly version = "1.0.0";
  readonly capabilities = ["vector.svg.generate"] as const;

  constructor(private readonly credentials: CloudflareCredentialResolver = new EnvironmentCredentialResolver()) {}

  async check(config: ProviderConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const options = optionsSchema.parse(config.options ?? {});
      apiBase(options);
      const credential = await this.credentials.resolve(config, options);
      endpoint(options, credential.accountId, options.defaultModel);
      return { ok: true, message: `ready (${options.defaultModel}; ${credential.source})` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async generate(context: GenerateContext): Promise<GeneratedOutput[]> {
    const options = optionsSchema.parse(context.provider.options ?? {});
    const credential = await this.credentials.resolve(context.provider, options);
    const model = context.prop.model ?? options.defaultModel;
    const request = requestFor(context, options);
    const response = await fetch(endpoint(options, credential.accountId, model), {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const bodyText = await boundedResponse(response, options.maxResponseBytes);
    if (!response.ok) throw new Error(`Cloudflare Workers AI returned ${response.status}: ${errorMessage(bodyText)}`);

    let body: {
      success?: boolean;
      result?: { response?: string; usage?: unknown; cost?: unknown; request_id?: string };
      usage?: unknown;
      cost?: unknown;
      errors?: unknown[];
    };
    try {
      body = JSON.parse(bodyText) as typeof body;
    } catch {
      throw new Error("Cloudflare Workers AI returned invalid JSON");
    }
    if (body.success === false) throw new Error(`Cloudflare Workers AI request failed: ${errorMessage(bodyText)}`);
    if (typeof body.result?.response !== "string") throw new Error("Cloudflare Workers AI returned no generated text");

    const svg = extractSvg(body.result.response);
    const bytes = new TextEncoder().encode(svg);
    if (bytes.byteLength > options.maxOutputBytes) throw new Error(`Cloudflare SVG output exceeded ${options.maxOutputBytes} bytes`);
    const usage = jsonValue(body.result.usage ?? body.usage);
    const reportedCost = jsonValue(body.result.cost ?? body.cost);
    return [{
      bytes,
      extension: "svg",
      mediaType: "image/svg+xml",
      providerMetadata: {
        service: "cloudflare-workers-ai",
        transport: "https",
        model: { id: model, host: "Cloudflare Workers AI" },
        requestSha256: sha256(canonicalJson(request)),
        deterministic: false,
        sampling: {
          temperature: typeof request.temperature === "number" ? request.temperature : "provider-default",
          seed: "unset",
        },
        credentialSource: credential.source,
        ...(usage !== undefined ? { usage } : {}),
        ...(reportedCost !== undefined ? { reportedCost } : {}),
        ...(body.result.request_id ? { requestId: body.result.request_id } : {}),
        ...(response.headers.get("cf-ray") ? { cfRay: response.headers.get("cf-ray")! } : {}),
      },
    }];
  }
}
