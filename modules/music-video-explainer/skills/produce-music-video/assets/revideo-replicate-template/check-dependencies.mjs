import { access } from "node:fs/promises";

for (const name of ["@revideo/core", "@revideo/2d", "@revideo/ffmpeg", "@revideo/renderer", "@revideo/ui", "@revideo/vite-plugin"]) {
  const resolved = import.meta.resolve(name);
  await access(new URL(resolved));
}
const replicateModule = await import("replicate");
if (typeof replicateModule.default !== "function") throw new Error("replicate did not expose its client constructor");

console.log("Pinned Revideo 0.11.0 packages resolve and Replicate 1.1.0 loads successfully.");
