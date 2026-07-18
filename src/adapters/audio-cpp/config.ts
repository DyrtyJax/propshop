import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { GenerateContext, JsonValue, ProviderConfig } from "../../types.js";

const licenseSchema = z.object({
  id: z.string().optional(),
  url: z.string().url().optional(),
  restrictions: z.array(z.string()).default([]),
});

const modelSchema = z.object({
  family: z.string().min(1),
  path: z.string().min(1).optional(),
  serverId: z.string().min(1).optional(),
  task: z.string().min(1).default("gen"),
  source: z.string().optional(),
  revision: z.string().optional(),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  license: licenseSchema.optional(),
  loadOptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  sessionOptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export const audioCppOptionsSchema = z.object({
  transport: z.enum(["auto", "cli", "http"]).default("auto"),
  executable: z.string().min(1).default("audiocpp_cli"),
  serverUrl: z.string().url().optional(),
  allowRemote: z.boolean().default(false),
  backend: z.enum(["best", "cpu", "cuda", "vulkan", "metal"]).default("best"),
  device: z.number().int().nonnegative().default(0),
  threads: z.number().int().positive().default(4),
  timeoutMs: z.number().int().positive().max(3_600_000).default(600_000),
  maxOutputBytes: z.number().int().positive().default(256 * 1024 * 1024),
  defaultModel: z.string().optional(),
  models: z.record(z.string(), modelSchema).refine((models) => Object.keys(models).length > 0, "configure at least one model"),
});

export type AudioCppOptions = z.infer<typeof audioCppOptionsSchema>;
export type AudioCppModel = z.infer<typeof modelSchema>;

export function parseAudioCppOptions(config: ProviderConfig): AudioCppOptions {
  const parsed = audioCppOptionsSchema.parse(config.options ?? {});
  if (parsed.transport === "http" && !parsed.serverUrl) {
    throw new Error("audio-cpp HTTP transport requires options.serverUrl");
  }
  if (parsed.defaultModel && !parsed.models[parsed.defaultModel]) {
    throw new Error(`audio-cpp defaultModel '${parsed.defaultModel}' is not configured`);
  }
  return parsed;
}

export function resolveAudioCppModel(context: GenerateContext, options: AudioCppOptions): {
  id: string;
  model: AudioCppModel;
} {
  const id = context.prop.model ?? options.defaultModel;
  if (!id) throw new Error(`Prop ${context.prop.id} must set model or its provider must set defaultModel`);
  const model = options.models[id];
  if (!model) throw new Error(`audio-cpp model '${id}' is not configured by provider ${context.providerName}`);
  return { id, model };
}

export function resolveModelPath(projectRoot: string, model: AudioCppModel): string {
  if (!model.path) throw new Error("audio-cpp CLI transport requires a model path");
  return isAbsolute(model.path) ? model.path : resolve(projectRoot, model.path);
}

export function modelProvenance(id: string, model: AudioCppModel): Record<string, JsonValue> {
  return {
    id,
    family: model.family,
    task: model.task,
    ...(model.source ? { source: model.source } : {}),
    ...(model.revision ? { revision: model.revision } : {}),
    ...(model.sha256 ? { sha256: model.sha256.toLowerCase() } : {}),
    ...(model.license
      ? {
          license: {
            ...(model.license.id ? { id: model.license.id } : {}),
            ...(model.license.url ? { url: model.license.url } : {}),
            restrictions: model.license.restrictions,
          },
        }
      : {}),
  };
}
