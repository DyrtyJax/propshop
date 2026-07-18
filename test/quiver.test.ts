import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "../src/core.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  delete process.env.TEST_QUIVER_KEY;
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
});

describe("Quiver adapter", () => {
  it("builds a native SVG and records bounded provenance", async () => {
    let requestBody: Record<string, unknown> = {};
    let authorization = "";
    const server = createServer((request, response) => {
      authorization = request.headers.authorization ?? "";
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        response.setHeader("content-type", "application/json");
        response.setHeader("x-trace-id", "trace-from-server");
        response.end(JSON.stringify({
          id: "resp_test",
          created: 123,
          credits: 2,
          data: [{ mime_type: "image/svg+xml", svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>Portal</title><path fill="#ff5a47" d="M8 8H56V56H8Z"/></svg>` }],
        }));
      });
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No server address");
    process.env.TEST_QUIVER_KEY = "secret-test-key";
    const root = await mkdtemp(resolve(tmpdir(), "propshop-quiver-"));
    const propfile = resolve(root, "Propfile.yaml");
    await writeFile(propfile, stringify({
      version: 1,
      project: "vector-shop",
      style: { description: "Playful geometric printmaking", palette: ["#ff5a47", "#201827"] },
      providers: {
        vectors: {
          adapter: "quiver",
          env: "TEST_QUIVER_KEY",
          options: { baseUrl: `http://127.0.0.1:${address.port}/v1`, defaultModel: "arrow-test" },
        },
      },
      props: [{
        id: "portal-mark",
        kind: "vector",
        prompt: "A dimensional portal emblem",
        provider: "vectors",
        variants: 1,
        input: { width: 64, height: 64, temperature: 0.4, references: ["https://example.com/reference.png?signature=secret-query"] },
        checks: { svg: { requireViewBox: true, requireTitle: true, maxColors: 2, allowText: false } },
      }],
    }));

    const result = await build({ propfile });
    const artifact = result.run.props[0]?.artifacts[0];
    expect(result.run.status).toBe("succeeded");
    expect(result.run.props[0]?.capability).toBe("vector.svg.generate");
    expect(artifact?.inspection?.paths).toBe(1);
    expect(artifact?.checks?.every((item) => item.status === "passed")).toBe(true);
    expect(artifact?.providerMetadata?.requestId).toBe("resp_test");
    expect(JSON.stringify(artifact?.providerMetadata)).not.toContain("secret-test-key");
    expect(JSON.stringify(artifact?.providerMetadata)).not.toContain("secret-query");
    expect(authorization).toBe("Bearer secret-test-key");
    expect(requestBody.model).toBe("arrow-test");
    expect(requestBody.attributes).toEqual({ viewBox: { minX: 0, minY: 0, width: 64, height: 64 } });
    expect(requestBody.references).toEqual(["https://example.com/reference.png?signature=secret-query"]);
    const saved = await readFile(resolve(root, artifact?.path ?? ""), "utf8");
    expect(saved).toContain("<svg");
  });
});
