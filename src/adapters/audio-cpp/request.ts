import { randomBytes } from "node:crypto";
import { canonicalJson, sha256 } from "../../lib/files.js";
import type { GenerateContext, JsonValue } from "../../types.js";

const FLAG_FIELDS: Record<string, string> = {
  audio: "--audio",
  duration_seconds: "--duration-seconds",
  guidance_scale: "--guidance-scale",
  language: "--language",
  lyrics: "--lyrics",
  max_steps: "--max-steps",
  max_tokens: "--max-tokens",
  num_inference_steps: "--num-inference-steps",
  repaint_end: "--repaint-end",
  repaint_mode: "--repaint-mode",
  repaint_start: "--repaint-start",
  repaint_strength: "--repaint-strength",
  task_route: "--task-route",
  temperature: "--temperature",
  top_k: "--top-k",
  top_p: "--top-p",
  track_name: "--track-name",
};

function integerSeed(value: JsonValue | undefined, context: GenerateContext, modelId: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return Math.abs(value + context.variant - 1) % 2_147_483_647;
  }
  if (value === "fresh") return randomBytes(4).readUInt32LE(0) % 2_147_483_647;
  if (value !== undefined && value !== "locked") {
    throw new Error("audio-cpp input.seed must be an integer, 'locked', or 'fresh'");
  }
  const identity = canonicalJson({
    capability: context.capability,
    prop: context.prop.id,
    prompt: context.prop.prompt,
    model: modelId,
    variant: context.variant,
    parameters: context.parameters,
  });
  return Number.parseInt(sha256(identity).slice(0, 8), 16) % 2_147_483_647;
}

export interface NormalizedAudioRequest {
  request: Record<string, JsonValue>;
  seed: number;
}

export function normalizeAudioRequest(context: GenerateContext, modelId: string): NormalizedAudioRequest {
  const seed = integerSeed(context.parameters.seed, context, modelId);
  const advanced = context.parameters.advanced;
  const audioCppAdvanced = advanced && !Array.isArray(advanced) && typeof advanced === "object"
    ? advanced.audioCpp
    : undefined;
  const advancedObject = audioCppAdvanced && !Array.isArray(audioCppAdvanced) && typeof audioCppAdvanced === "object"
    ? audioCppAdvanced
    : {};
  const requestOptions = advancedObject.requestOptions;
  const request: Record<string, JsonValue> = {
    text: context.prop.prompt,
    seed,
    ...(context.parameters.durationSeconds !== undefined ? { duration_seconds: context.parameters.durationSeconds } : {}),
    ...(context.parameters.guidanceScale !== undefined ? { guidance_scale: context.parameters.guidanceScale } : {}),
    ...(context.parameters.inferenceSteps !== undefined ? { num_inference_steps: context.parameters.inferenceSteps } : {}),
    ...(context.parameters.language !== undefined ? { language: context.parameters.language } : {}),
    ...(context.parameters.lyrics !== undefined ? { lyrics: context.parameters.lyrics } : {}),
    ...(context.parameters.operation !== undefined ? { task_route: context.parameters.operation } : {}),
    ...(context.parameters.sourceAudio !== undefined ? { audio: context.parameters.sourceAudio } : {}),
    options: {
      ...(context.parameters.negativePrompt !== undefined ? { negative_prompt: context.parameters.negativePrompt } : {}),
      ...(context.parameters.sampler !== undefined ? { sampler: context.parameters.sampler } : {}),
      ...(requestOptions && !Array.isArray(requestOptions) && typeof requestOptions === "object" ? requestOptions : {}),
    },
  };
  return { request, seed };
}

function optionEntries(value: JsonValue | undefined): Array<[string, string]> {
  if (!value || Array.isArray(value) || typeof value !== "object") return [];
  return Object.entries(value).map(([key, child]) => [key, typeof child === "string" ? child : JSON.stringify(child)]);
}

export function requestCliArgs(request: Record<string, JsonValue>): string[] {
  const args: string[] = ["--text", String(request.text), "--seed", String(request.seed)];
  for (const [field, flag] of Object.entries(FLAG_FIELDS)) {
    const value = request[field];
    if (value !== undefined && value !== null) args.push(flag, String(value));
  }
  for (const [key, value] of optionEntries(request.options)) args.push("--request-option", `${key}=${value}`);
  return args;
}
