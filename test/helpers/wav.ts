export function makeWav(options: {
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  amplitude?: number;
  frequency?: number;
} = {}): Uint8Array {
  const sampleRate = options.sampleRate ?? 8_000;
  const channels = options.channels ?? 1;
  const amplitude = options.amplitude ?? 0.4;
  const frequency = options.frequency ?? 440;
  const frameCount = Math.round((options.durationSeconds ?? 0.1) * sampleRate);
  const dataLength = frameCount * channels * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * frequency * frame) / sampleRate) * amplitude * 32767);
    for (let channel = 0; channel < channels; channel += 1) {
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  return bytes;
}
