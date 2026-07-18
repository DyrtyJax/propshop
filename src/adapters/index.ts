import { MockAdapter } from "./mock.js";
import { ReplicateAdapter } from "./replicate.js";
import type { Adapter } from "../types.js";

const adapters: Record<string, Adapter> = {
  mock: new MockAdapter(),
  replicate: new ReplicateAdapter(),
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
