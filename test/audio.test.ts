import { describe, expect, it } from "vitest";
import { checkAudio, inspectWav } from "../src/validation/audio.js";
import { makeWav } from "./helpers/wav.js";

describe("WAV inspection", () => {
  it("extracts deterministic production metadata", () => {
    const inspection = inspectWav(makeWav({ durationSeconds: 0.25, sampleRate: 16_000, channels: 2 }));
    expect(inspection.durationSeconds).toBeCloseTo(0.25, 4);
    expect(inspection.sampleRate).toBe(16_000);
    expect(inspection.channels).toBe(2);
    expect(inspection.bitsPerSample).toBe(16);
    expect(inspection.peakDbfs).toBeLessThan(-7);
    expect(inspection.rmsDbfs).toBeGreaterThan(-12);
  });

  it("reports failed audio policies without losing measured values", () => {
    const inspection = inspectWav(makeWav({ durationSeconds: 0.1 }));
    const checks = checkAudio(inspection, {
      durationSeconds: { min: 1, max: 2 },
      sampleRates: [48_000],
      channels: [2],
    });
    expect(checks).toHaveLength(3);
    expect(checks.every((check) => check.status === "failed")).toBe(true);
  });

  it("rejects corrupt containers", () => {
    expect(() => inspectWav(new TextEncoder().encode("not audio"))).toThrow(/RIFF\/WAVE/);
  });
});
