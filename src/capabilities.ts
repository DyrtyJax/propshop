import type { JsonValue, PropDefinition } from "./types.js";

const KIND_CAPABILITIES: Record<string, string> = {
  sfx: "audio.sfx.generate",
  music: "audio.music.generate",
  speech: "audio.speech.synthesize",
  voice: "audio.speech.synthesize",
  vector: "vector.author",
  image: "image.generate",
  video: "video.generate",
  model3d: "3d.generate",
};

export function capabilityForProp(prop: PropDefinition): string {
  return prop.capability ?? KIND_CAPABILITIES[prop.kind] ?? `asset.${prop.kind}.generate`;
}

export function adapterSupports(capabilities: readonly string[], capability: string): boolean {
  return capabilities.includes("*") || capabilities.includes(capability);
}

export function normalizedParameters(prop: PropDefinition): Record<string, JsonValue> {
  const parameters = { ...prop.input };
  const aliases: Record<string, string> = {
    duration_seconds: "durationSeconds",
    guidance_scale: "guidanceScale",
    negative_prompt: "negativePrompt",
    num_inference_steps: "inferenceSteps",
    source_audio: "sourceAudio",
    task_route: "operation",
  };
  for (const [legacy, canonical] of Object.entries(aliases)) {
    if (parameters[canonical] === undefined && parameters[legacy] !== undefined) {
      parameters[canonical] = parameters[legacy] as JsonValue;
    }
    delete parameters[legacy];
  }
  return parameters;
}
