import { isIP } from "node:net";
import type { GenerateContext, GeneratedOutput, JsonValue } from "../../types.js";
import type { AudioCppModel, AudioCppOptions } from "./config.js";
import { modelProvenance } from "./config.js";
import { normalizeAudioRequest } from "./request.js";
import { canonicalJson, sha256 } from "../../lib/files.js";

interface ServerModel {
  id: string;
  family?: string;
  task?: string;
  mode?: string;
}

export interface ServerSnapshot {
  health: Record<string, JsonValue>;
  models: ServerModel[];
}

function baseUrl(options: AudioCppOptions): URL {
  if (!options.serverUrl) throw new Error("audio-cpp server URL is not configured");
  const url = new URL(options.serverUrl);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const loopback = host === "localhost" || host === "::1" || host.startsWith("127.") || (isIP(host) === 6 && host === "0:0:0:0:0:0:0:1");
  if (!loopback && !options.allowRemote) {
    throw new Error(`Refusing remote audio.cpp server ${url.origin}; set allowRemote: true explicitly`);
  }
  return url;
}

async function request(options: AudioCppOptions, path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(path, baseUrl(options));
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs) });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 2_000);
    throw new Error(`audio.cpp server returned ${response.status}: ${detail}`);
  }
  return response;
}

export async function inspectServer(options: AudioCppOptions): Promise<ServerSnapshot> {
  const [healthResponse, modelsResponse] = await Promise.all([
    request(options, "/health"),
    request(options, "/v1/models"),
  ]);
  const health = (await healthResponse.json()) as Record<string, JsonValue>;
  const modelBody = (await modelsResponse.json()) as { data?: ServerModel[] };
  return { health, models: modelBody.data ?? [] };
}

function decodeAudio(value: unknown, maximum: number): Uint8Array {
  if (typeof value !== "string") throw new Error("audio.cpp server response did not include base64 audio");
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength > maximum) throw new Error(`audio.cpp output exceeded ${maximum} bytes`);
  return bytes;
}

export async function generateWithHttp(
  context: GenerateContext,
  options: AudioCppOptions,
  id: string,
  model: AudioCppModel,
  snapshot: ServerSnapshot,
): Promise<GeneratedOutput[]> {
  const serverId = model.serverId ?? id;
  const serverModel = snapshot.models.find((candidate) => candidate.id === serverId);
  if (!serverModel) throw new Error(`audio.cpp server does not expose model '${serverId}'`);
  const { request: normalized, seed } = normalizeAudioRequest(context, id);
  const response = await request(options, "/v1/tasks/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: serverId, request: normalized }),
  });
  const body = (await response.json()) as {
    audio?: string;
    named_audio_outputs?: Array<{ id?: string; audio?: string; sample_rate?: number; channels?: number }>;
    sample_rate?: number;
    channels?: number;
    timing?: Record<string, JsonValue>;
  };
  const candidates: Array<{ id?: string; audio?: string; sample_rate?: number; channels?: number }> = body.audio
    ? [{ audio: body.audio, ...(body.sample_rate ? { sample_rate: body.sample_rate } : {}), ...(body.channels ? { channels: body.channels } : {}) }]
    : (body.named_audio_outputs ?? []);
  if (candidates.length === 0) throw new Error("audio.cpp server returned no audio outputs");
  return candidates.map((candidate, index) => ({
    bytes: decodeAudio(candidate.audio, options.maxOutputBytes),
    extension: "wav",
    mediaType: "audio/wav",
    providerMetadata: {
      runtime: "audio.cpp",
      transport: "http",
      adapterProtocol: 1,
      server: {
        origin: baseUrl(options).origin,
        backend: snapshot.health.backend ?? "unknown",
      },
      serverModel: {
        id: serverId,
        ...(serverModel.family ? { family: serverModel.family } : {}),
        ...(serverModel.task ? { task: serverModel.task } : {}),
        ...(serverModel.mode ? { mode: serverModel.mode } : {}),
      },
      seed,
      request: normalized,
      requestSha256: sha256(canonicalJson(normalized)),
      model: modelProvenance(id, model),
      ...(candidate.sample_rate ? { sampleRate: candidate.sample_rate } : {}),
      ...(candidate.channels ? { channels: candidate.channels } : {}),
      ...(body.timing ? { timing: body.timing } : {}),
      ...(candidate.id ? { outputId: candidate.id } : {}),
      outputIndex: index,
    } as Record<string, JsonValue>,
  }));
}
