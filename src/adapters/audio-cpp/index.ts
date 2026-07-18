import { ZodError } from "zod";
import type { Adapter, GenerateContext, GeneratedOutput, ProviderConfig } from "../../types.js";
import { parseAudioCppOptions, resolveAudioCppModel } from "./config.js";
import { generateWithHttp, inspectServer } from "./http.js";
import { checkCli, generateWithCli } from "./process.js";

function errorMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  return error instanceof Error ? error.message : String(error);
}

export class AudioCppAdapter implements Adapter {
  readonly name = "audio-cpp";
  readonly version = "0.1.0";
  readonly capabilities = ["audio.sfx.generate", "audio.music.generate"] as const;

  async check(config: ProviderConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const options = parseAudioCppOptions(config);
      if ((options.transport === "http" || options.transport === "auto") && options.serverUrl) {
        try {
          const snapshot = await inspectServer(options);
          return {
            ok: true,
            message: `server ready (${snapshot.health.backend ?? "unknown"}; ${snapshot.models.length} model${snapshot.models.length === 1 ? "" : "s"})`,
          };
        } catch (error) {
          if (options.transport === "http") throw error;
        }
      }
      const executable = await checkCli(options);
      return { ok: true, message: `CLI ready (${executable}; ${options.backend})` };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  async generate(context: GenerateContext): Promise<GeneratedOutput[]> {
    const options = parseAudioCppOptions(context.provider);
    const { id, model } = resolveAudioCppModel(context, options);
    if ((options.transport === "http" || options.transport === "auto") && options.serverUrl) {
      try {
        const snapshot = await inspectServer(options);
        return generateWithHttp(context, options, id, model, snapshot);
      } catch (error) {
        if (options.transport === "http") throw error;
        // Auto mode falls back only during transport resolution, before generation begins.
      }
    }
    return generateWithCli(context, options, id, model);
  }
}
