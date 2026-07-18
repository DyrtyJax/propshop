import type { ArtifactCheck, AudioChecks, GeneratedOutput, JsonValue } from "../types.js";

export interface AudioInspection {
  container: "wav";
  encoding: "pcm" | "float";
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSeconds: number;
  peakDbfs: number;
  rmsDbfs: number;
  dcOffset: number;
  clippedSamples: number;
  clippedRatio: number;
  leadingSilenceSeconds: number;
  trailingSilenceSeconds: number;
}

function fourCc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function dbfs(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : -160;
}

function sampleAt(view: DataView, offset: number, format: number, bits: number): number {
  if (format === 3) {
    if (bits === 32) return view.getFloat32(offset, true);
    if (bits === 64) return view.getFloat64(offset, true);
    throw new Error(`Unsupported WAV float depth: ${bits}`);
  }
  if (bits === 8) return (view.getUint8(offset) - 128) / 128;
  if (bits === 16) return view.getInt16(offset, true) / 32768;
  if (bits === 24) {
    let value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    if (value & 0x800000) value |= 0xff000000;
    return value / 8388608;
  }
  if (bits === 32) return view.getInt32(offset, true) / 2147483648;
  throw new Error(`Unsupported WAV PCM depth: ${bits}`);
}

export function inspectWav(bytes: Uint8Array): AudioInspection {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || fourCc(view, 0) !== "RIFF" || fourCc(view, 8) !== "WAVE") {
    throw new Error("Artifact is not a RIFF/WAVE file");
  }

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let blockAlign = 0;
  let dataOffset = 0;
  let dataLength = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const id = fourCc(view, offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.byteLength) throw new Error(`Invalid WAV ${id} chunk length`);
    if (id === "fmt ") {
      if (size < 16) throw new Error("Invalid WAV format chunk");
      format = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      blockAlign = view.getUint16(start + 12, true);
      bitsPerSample = view.getUint16(start + 14, true);
      if (format === 0xfffe && size >= 40) format = view.getUint16(start + 24, true);
    } else if (id === "data") {
      dataOffset = start;
      dataLength = size;
    }
    offset = start + size + (size % 2);
  }
  if (![1, 3].includes(format)) throw new Error(`Unsupported WAV encoding: ${format}`);
  if (channels <= 0 || sampleRate <= 0 || bitsPerSample <= 0 || blockAlign <= 0) {
    throw new Error("WAV format metadata is incomplete");
  }
  if (dataOffset === 0 || dataLength === 0) throw new Error("WAV contains no audio data");

  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample)) throw new Error(`Unsupported WAV sample depth: ${bitsPerSample}`);
  const sampleCount = Math.floor(dataLength / bytesPerSample);
  let peak = 0;
  let sum = 0;
  let sumSquares = 0;
  let clippedSamples = 0;
  let firstAudible = sampleCount;
  let lastAudible = -1;
  const silenceThreshold = 10 ** (-60 / 20);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.max(-1, Math.min(1, sampleAt(view, dataOffset + index * bytesPerSample, format, bitsPerSample)));
    const magnitude = Math.abs(sample);
    peak = Math.max(peak, magnitude);
    sum += sample;
    sumSquares += sample * sample;
    if (magnitude >= 0.999) clippedSamples += 1;
    if (magnitude > silenceThreshold) {
      firstAudible = Math.min(firstAudible, index);
      lastAudible = index;
    }
  }
  const samplesPerSecond = sampleRate * channels;
  const rms = Math.sqrt(sumSquares / sampleCount);
  return {
    container: "wav",
    encoding: format === 3 ? "float" : "pcm",
    sampleRate,
    channels,
    bitsPerSample,
    durationSeconds: sampleCount / samplesPerSecond,
    peakDbfs: dbfs(peak),
    rmsDbfs: dbfs(rms),
    dcOffset: sum / sampleCount,
    clippedSamples,
    clippedRatio: clippedSamples / sampleCount,
    leadingSilenceSeconds: firstAudible / samplesPerSecond,
    trailingSilenceSeconds: lastAudible < 0 ? sampleCount / samplesPerSecond : (sampleCount - 1 - lastAudible) / samplesPerSecond,
  };
}

function check(
  name: string,
  passed: boolean,
  actual: JsonValue,
  expected: JsonValue,
  message: string,
): ArtifactCheck {
  return { name, status: passed ? "passed" : "failed", actual, expected, message };
}

export function checkAudio(inspection: AudioInspection, rules?: AudioChecks): ArtifactCheck[] {
  if (!rules) return [];
  const results: ArtifactCheck[] = [];
  if (rules.durationSeconds) {
    const { min = 0, max = Number.POSITIVE_INFINITY } = rules.durationSeconds;
    results.push(
      check(
        "audio.duration",
        inspection.durationSeconds >= min && inspection.durationSeconds <= max,
        inspection.durationSeconds,
        { min, ...(Number.isFinite(max) ? { max } : {}) },
        `duration ${inspection.durationSeconds.toFixed(3)}s must be between ${min}s and ${Number.isFinite(max) ? `${max}s` : "∞"}`,
      ),
    );
  }
  if (rules.sampleRates) {
    results.push(check("audio.sample-rate", rules.sampleRates.includes(inspection.sampleRate), inspection.sampleRate, rules.sampleRates, `sample rate ${inspection.sampleRate}Hz must be one of ${rules.sampleRates.join(", ")}`));
  }
  if (rules.channels) {
    results.push(check("audio.channels", rules.channels.includes(inspection.channels), inspection.channels, rules.channels, `${inspection.channels} channels must be one of ${rules.channels.join(", ")}`));
  }
  if (rules.minRmsDbfs !== undefined) {
    results.push(check("audio.rms", inspection.rmsDbfs >= rules.minRmsDbfs, inspection.rmsDbfs, { min: rules.minRmsDbfs }, `RMS ${inspection.rmsDbfs.toFixed(2)} dBFS must be at least ${rules.minRmsDbfs} dBFS`));
  }
  if (rules.maxPeakDbfs !== undefined) {
    results.push(check("audio.peak", inspection.peakDbfs <= rules.maxPeakDbfs, inspection.peakDbfs, { max: rules.maxPeakDbfs }, `peak ${inspection.peakDbfs.toFixed(2)} dBFS must not exceed ${rules.maxPeakDbfs} dBFS`));
  }
  if (rules.maxClippedRatio !== undefined) {
    results.push(check("audio.clipping", inspection.clippedRatio <= rules.maxClippedRatio, inspection.clippedRatio, { max: rules.maxClippedRatio }, `clipped sample ratio ${inspection.clippedRatio.toFixed(6)} must not exceed ${rules.maxClippedRatio}`));
  }
  if (rules.maxLeadingSilenceSeconds !== undefined) {
    results.push(check("audio.leading-silence", inspection.leadingSilenceSeconds <= rules.maxLeadingSilenceSeconds, inspection.leadingSilenceSeconds, { max: rules.maxLeadingSilenceSeconds }, `leading silence ${inspection.leadingSilenceSeconds.toFixed(3)}s must not exceed ${rules.maxLeadingSilenceSeconds}s`));
  }
  if (rules.maxTrailingSilenceSeconds !== undefined) {
    results.push(check("audio.trailing-silence", inspection.trailingSilenceSeconds <= rules.maxTrailingSilenceSeconds, inspection.trailingSilenceSeconds, { max: rules.maxTrailingSilenceSeconds }, `trailing silence ${inspection.trailingSilenceSeconds.toFixed(3)}s must not exceed ${rules.maxTrailingSilenceSeconds}s`));
  }
  return results;
}

export function inspectArtifact(output: GeneratedOutput, audioChecks?: AudioChecks): {
  inspection?: Record<string, JsonValue>;
  checks: ArtifactCheck[];
} {
  if (output.mediaType !== "audio/wav" && output.extension.replace(/^\./, "").toLowerCase() !== "wav") {
    return { checks: [] };
  }
  const inspection = inspectWav(output.bytes);
  return {
    inspection: inspection as unknown as Record<string, JsonValue>,
    checks: checkAudio(inspection, audioChecks),
  };
}
