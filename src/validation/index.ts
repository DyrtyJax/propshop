import type { AudioChecks, GeneratedOutput, JsonValue, SvgChecks } from "../types.js";
import type { ArtifactCheck } from "../types.js";
import { inspectArtifact as inspectAudioArtifact } from "./audio.js";
import { checkSvg, inspectSvg } from "./svg.js";

export function inspectArtifact(
  output: GeneratedOutput,
  checks?: { audio?: AudioChecks; svg?: SvgChecks },
): { inspection?: Record<string, JsonValue>; checks: ArtifactCheck[] } {
  const extension = output.extension.replace(/^\./, "").toLowerCase();
  try {
    if (output.mediaType === "image/svg+xml" || extension === "svg") {
      const inspection = inspectSvg(output.bytes);
      return {
        inspection: inspection as unknown as Record<string, JsonValue>,
        checks: checkSvg(inspection, checks?.svg),
      };
    }
    return inspectAudioArtifact(output, checks?.audio);
  } catch (error) {
    const kind = output.mediaType === "image/svg+xml" || extension === "svg" ? "svg" : "artifact";
    return {
      checks: [{
        name: `${kind}.parse`,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }
}
