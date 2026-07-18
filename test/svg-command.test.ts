import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../src/core.js";

afterEach(() => delete process.env.DO_NOT_INHERIT_THIS_SECRET);

describe("SVG command adapter", () => {
  it("uses the versioned protocol without a shell or ambient secret inheritance", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "propshop-svg-command-"));
    const executable = resolve(root, "fake-svg-driver");
    await writeFile(executable, `#!/usr/bin/env node
const chunks = [];
if (process.argv.includes("--propshop-describe")) {
  process.stdout.write(JSON.stringify({ protocol: 1, name: "fake-vector", version: "2.4.0", capabilities: ["vector.svg.generate"] }));
  process.exit(0);
}
if (process.env.DO_NOT_INHERIT_THIS_SECRET) process.exit(42);
process.stdin.on("data", chunk => chunks.push(chunk));
process.stdin.on("end", () => {
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  process.stdout.write(JSON.stringify({ outputs: [{
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>Ticket</title><path d="M2 8H30V24H2Z"/></svg>',
    metadata: { receivedModel: request.model.id }
  }] }));
});
`);
    await chmod(executable, 0o755);
    process.env.DO_NOT_INHERIT_THIS_SECRET = "extremely-secret";
    const propfile = resolve(root, "Propfile.yaml");
    await writeFile(propfile, stringify({
      version: 1,
      project: "local-vector-shop",
      providers: {
        local: {
          adapter: "svg-command",
          options: {
            executable,
            provenanceFiles: [executable],
            defaultModel: "starvector-local",
            models: {
              "starvector-local": {
                source: "joanrod/star-vector",
                revision: "test-revision",
                license: { id: "Apache-2.0", restrictions: [] },
              },
            },
          },
        },
      },
      props: [{
        id: "ticket-mark",
        kind: "vector",
        prompt: "A punched admission ticket icon",
        provider: "local",
        variants: 1,
        checks: { svg: { requireViewBox: true, requireTitle: true, minPaths: 1 } },
      }],
    }));

    const result = await build({ propfile });
    const metadata = result.run.props[0]?.artifacts[0]?.providerMetadata;
    expect(result.run.status).toBe("succeeded");
    expect((metadata?.driver as Record<string, unknown>).name).toBe("fake-vector");
    expect((metadata?.model as Record<string, unknown>).id).toBe("starvector-local");
    expect(metadata?.provenanceFiles).toEqual([expect.objectContaining({ path: executable, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
    expect(JSON.stringify(metadata)).not.toContain("extremely-secret");
  });
});
