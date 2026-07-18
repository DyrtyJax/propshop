import { MockAdapter } from "./mock.js";
import { ReplicateAdapter } from "./replicate.js";
import type { Adapter } from "../types.js";
import { AudioCppAdapter } from "./audio-cpp/index.js";
import { QuiverAdapter } from "./quiver.js";
import { SvgCommandAdapter } from "./svg-command.js";

const adapters: Record<string, Adapter> = {
  "audio-cpp": new AudioCppAdapter(),
  mock: new MockAdapter(),
  quiver: new QuiverAdapter(),
  replicate: new ReplicateAdapter(),
  "svg-command": new SvgCommandAdapter(),
};

export function getAdapter(name: string): Adapter {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(
      `Unknown adapter '${name}'. Built-in adapters: ${Object.keys(adapters).join(", ")}`,
    );
  }
  return adapter;
}

export function listAdapters(): Adapter[] {
  return Object.values(adapters);
}
