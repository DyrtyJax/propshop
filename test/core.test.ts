import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { build, promote } from "../src/core.js";

async function fixture(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "propshop-"));
  await writeFile(
    resolve(root, "Propfile.yaml"),
    stringify({
      version: 1,
      project: "test-shop",
      providers: { preview: { adapter: "mock" } },
      props: [
        {
          id: "portal-icon",
          kind: "vector",
          prompt: "a tiny portal",
          provider: "preview",
          variants: 2,
        },
      ],
    }),
  );
  return root;
}

describe("build", () => {
  it("records immutable artifacts with hashes", async () => {
    const root = await fixture();
    const result = await build({ propfile: resolve(root, "Propfile.yaml") });
    expect(result.run.status).toBe("succeeded");
    expect(result.run.props[0]?.artifacts).toHaveLength(2);
    expect(result.run.props[0]?.artifacts[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(result.path, "utf8")).toContain('"status": "succeeded"');
    const events = await readFile(resolve(root, ".propshop", "runs", result.run.runId, "events.ndjson"), "utf8");
    expect(events).toContain('"type":"run.started"');
    expect(events).toContain('"type":"artifact.created"');
    expect(events).toContain('"type":"run.completed"');
  });

  it("promotes a chosen take and creates a lockfile", async () => {
    const root = await fixture();
    const result = await build({ propfile: resolve(root, "Propfile.yaml") });
    await expect(promote(result.run.runId, "portal-icon", resolve(root, "Propfile.yaml"))).rejects.toThrow(/choose one/);
    const outputs = await promote(result.run.runId, "portal-icon", resolve(root, "Propfile.yaml"), 2);
    expect(outputs).toHaveLength(1);
    expect(await readFile(resolve(root, "Propfile.lock"), "utf8")).toContain(result.run.runId);
  });
});
