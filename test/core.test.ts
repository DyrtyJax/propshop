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
  });

  it("promotes a chosen take and creates a lockfile", async () => {
    const root = await fixture();
    const result = await build({ propfile: resolve(root, "Propfile.yaml") });
    const outputs = await promote(result.run.runId, "portal-icon", resolve(root, "Propfile.yaml"));
    expect(outputs).toHaveLength(2);
    expect(await readFile(resolve(root, "Propfile.lock"), "utf8")).toContain(result.run.runId);
  });
});
