import { isIP } from "node:net";
import { z } from "zod";
import { canonicalJson, sha256 } from "../lib/files.js";
import type { Adapter, GenerateContext, GeneratedOutput, JsonValue, ProviderConfig } from "../types.js";

const optionsSchema = z.object({
  baseUrl: z.string().url().default("https://api.quiver.ai/v1"),
  allowCustomBaseUrl: z.boolean().default(false),
  defaultModel: z.string().min(1).default("arrow-1.1"),
  timeoutMs: z.number().int().positive().max(600_000).default(120_000),
  maxOutputBytes: z.number().int().positive().default(8 * 1024 * 1024),
  instructions: z.string().min(1).optional(),
});

const referenceSchema = z.union([
  z.string().url(),
  z.object({ url: z.string().url() }),
  z.object({ base64: z.string().min(1).max(16_777_216) }),
]);

const inputSchema = z.object({
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  viewBox: z.object({
    minX: z.number(),
    minY: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  references: z.array(referenceSchema).max(16).optional(),
  instructions: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  maxOutputTokens: z.number().int().min(1).max(65_536).optional(),
});

type QuiverOptions = z.infer<typeof optionsSchema>;

function endpoint(options: QuiverOptions, path: string): URL {
  const base = new URL(options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`);
  const host = base.hostname.replace(/^\[|\]$/g, "");
  const loopback = host === "localhost" || host.startsWith("127.") || host === "::1" || (isIP(host) === 6 && host === "0:0:0:0:0:0:0:1");
  if (base.origin !== "https://api.quiver.ai" && !loopback && !options.allowCustomBaseUrl) {
    throw new Error(`Refusing custom Quiver API origin ${base.origin}; set allowCustomBaseUrl: true explicitly`);
  }
  return new URL(path.replace(/^\//, ""), base);
}

function objectValue(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeReference(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (typeof value.base64 === "string") {
    const bytes = Buffer.from(value.base64, "base64");
    return { base64Sha256: sha256(bytes), bytes: bytes.byteLength };
  }
  if (typeof value.url === "string") return { url: safeReference(value.url) };
  return value;
}

function safeRequest(request: Record<string, JsonValue>): Record<string, JsonValue> {
  return {
    ...request,
    ...(Array.isArray(request.references) ? { references: request.references.map(safeReference) } : {}),
  };
}

function instructions(context: GenerateContext, options: QuiverOptions): string | undefined {
  const parts = [
    options.instructions,
    context.style?.description ? `Project style: ${context.style.description}` : undefined,
    context.style?.palette.length ? `Preferred palette: ${context.style.palette.join(", ")}` : undefined,
    stringValue(context.parameters.instructions),
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function resolvedRequest(context: GenerateContext, options: QuiverOptions, model: string): Record<string, JsonValue> {
  const input = inputSchema.parse(context.parameters);
  const advanced = objectValue(context.parameters.advanced);
  const quiver = objectValue(advanced?.quiver);
  const requestOptions = objectValue(quiver?.requestOptions) ?? {};
  const requestedViewBox = input.viewBox;
  const width = input.width;
  const height = input.height;
  const viewBox = requestedViewBox ?? (width && height ? { minX: 0, minY: 0, width, height } : undefined);
  const references = input.references;
  const guidance = instructions(context, options);
  return {
    ...requestOptions,
    model,
    prompt: context.prop.prompt,
    n: 1,
    stream: false,
    ...(guidance ? { instructions: guidance } : {}),
    ...(viewBox ? { attributes: { viewBox } } : {}),
    ...(references ? { references } : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.topP !== undefined ? { top_p: input.topP } : {}),
    ...(input.presencePenalty !== undefined ? { presence_penalty: input.presencePenalty } : {}),
    ...(input.maxOutputTokens !== undefined ? { max_output_tokens: input.maxOutputTokens } : {}),
  };
}

async function responseBody(response: Response, maximum: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) throw new Error(`Quiver response exceeded ${maximum} bytes`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximum) throw new Error(`Quiver response exceeded ${maximum} bytes`);
  return new TextDecoder().decode(bytes);
}

export class QuiverAdapter implements Adapter {
  readonly name = "quiver";
  readonly version = "1.0.0";
  readonly capabilities = ["vector.svg.generate"] as const;

  async check(config: ProviderConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const options = optionsSchema.parse(config.options ?? {});
      endpoint(options, "svgs/generations");
      const env = config.env ?? "QUIVERAI_API_KEY";
      return process.env[env]
        ? { ok: true, message: `ready (${options.defaultModel}; ${env})` }
        : { ok: false, message: `missing environment variable ${env}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async generate(context: GenerateContext): Promise<GeneratedOutput[]> {
    const options = optionsSchema.parse(context.provider.options ?? {});
    const env = context.provider.env ?? "QUIVERAI_API_KEY";
    const token = process.env[env];
    if (!token) throw new Error(`Missing environment variable ${env}`);
    const model = context.prop.model ?? options.defaultModel;
    const request = resolvedRequest(context, options, model);
    const traceId = `${context.runId}-${context.prop.id}-${context.variant}`.slice(0, 256);
    const response = await fetch(endpoint(options, "svgs/generations"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-trace-id": traceId,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const bodyText = await responseBody(response, options.maxOutputBytes * 2 + 1024 * 1024);
    if (!response.ok) {
      let message = bodyText.slice(0, 2_000);
      try {
        const body = JSON.parse(bodyText) as { code?: string; message?: string; request_id?: string };
        message = [body.code, body.message, body.request_id].filter(Boolean).join(": ") || message;
      } catch {
        // Keep bounded response text.
      }
      throw new Error(`Quiver API returned ${response.status}: ${message}`);
    }
    const body = JSON.parse(bodyText) as {
      id?: string;
      created?: number;
      credits?: number;
      data?: Array<{ id?: string; svg?: string; mime_type?: string }>;
    };
    if (!body.data?.length) throw new Error("Quiver API returned no SVG outputs");
    const exactRequestSha256 = sha256(canonicalJson(request));
    const recordedRequest = safeRequest(request);
    return body.data.map((item, index) => {
      if (typeof item.svg !== "string" || item.svg.length === 0) throw new Error(`Quiver output ${index + 1} did not contain SVG markup`);
      const bytes = new TextEncoder().encode(item.svg);
      if (bytes.byteLength > options.maxOutputBytes) throw new Error(`Quiver SVG output exceeded ${options.maxOutputBytes} bytes`);
      return {
        bytes,
        extension: "svg",
        mediaType: "image/svg+xml",
        providerMetadata: {
          service: "quiver",
          transport: "https",
          model: { id: model, provider: "QuiverAI" },
          request: recordedRequest,
          requestSha256: exactRequestSha256,
          deterministic: false,
          ...(body.id ? { requestId: body.id } : {}),
          ...(item.id ? { outputId: item.id } : {}),
          ...(body.created !== undefined ? { created: body.created } : {}),
          ...(body.credits !== undefined ? { credits: body.credits } : {}),
          traceId: response.headers.get("x-trace-id") ?? traceId,
          outputIndex: index,
        },
      };
    });
  }
}
