import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { CloudflareSvgAdapter } from "../src/adapters/cloudflare-svg.js";
import type { GenerateContext, ProviderConfig } from "../src/types.js";
import { inspectArtifact } from "../src/validation/index.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  delete process.env.TEST_CF_ACCOUNT;
  delete process.env.TEST_CF_TOKEN;
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
});

async function mockApi(handler: Parameters<typeof createServer>[0]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  return `http://127.0.0.1:${address.port}/client/v4`;
}

function context(provider: ProviderConfig): GenerateContext {
  return {
    projectRoot: process.cwd(),
    runId: "run-test",
    prop: {
      id: "shop-mark",
      kind: "logo",
      prompt: "A joyful forge inside an open toolbox",
      provider: "cloudflare",
      model: "@cf/qwen/qwen2.5-coder-32b-instruct",
      variants: 1,
      input: {},
      tags: [],
    },
    capability: "vector.svg.generate",
    parameters: { width: 64, height: 64, temperature: 0.8, topK: 24, maxOutputTokens: 2_048 },
    providerName: "cloudflare",
    provider,
    variant: 1,
    style: { description: "Playful 1970s hardware-store mascot", palette: ["#ff5a47", "#201827"] , references: [] },
  };
}

describe("Cloudflare SVG adapter", () => {
  it("uses the provider-direct endpoint, extracts fenced SVG, and records safe metering", async () => {
    let path = "";
    let authorization = "";
    let requestBody: Record<string, unknown> = {};
    const baseUrl = await mockApi((request, response) => {
      path = request.url ?? "";
      authorization = request.headers.authorization ?? "";
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        response.setHeader("content-type", "application/json");
        response.setHeader("cf-ray", "test-ray-SJC");
        response.end(JSON.stringify({
          success: true,
          result: {
            response: "Here you go:\n```svg\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><title>PropShop forge</title><desc>A forge inside a toolbox</desc><path fill=\"#ff5a47\" d=\"M8 8h48v48H8z\"/></svg>\n```",
            usage: { prompt_tokens: 123, completion_tokens: 456, total_tokens: 579 },
            cost: { amount: 0.0005, currency: "USD" },
            request_id: "cf-request-test",
          },
        }));
      });
    });
    process.env.TEST_CF_ACCOUNT = "account-test";
    process.env.TEST_CF_TOKEN = "super-secret-token";
    const provider: ProviderConfig = {
      adapter: "cloudflare-svg",
      env: "TEST_CF_TOKEN",
      options: { baseUrl, accountIdEnv: "TEST_CF_ACCOUNT" },
    };

    const adapter = new CloudflareSvgAdapter();
    const outputs = await adapter.generate(context(provider));
    const metadata = outputs[0]?.providerMetadata;
    expect(path).toBe("/client/v4/accounts/account-test/ai/run/%40cf/qwen/qwen2.5-coder-32b-instruct");
    expect(authorization).toBe("Bearer super-secret-token");
    expect(requestBody.stream).toBe(false);
    expect(requestBody.temperature).toBe(0.8);
    expect(requestBody.top_k).toBe(24);
    expect(requestBody.max_tokens).toBe(2_048);
    expect(JSON.stringify(requestBody)).toContain("Return exactly one self-contained");
    expect(JSON.stringify(requestBody)).toContain("Playful 1970s");
    expect(new TextDecoder().decode(outputs[0]?.bytes)).toMatch(/^<svg[\s\S]*<\/svg>$/);
    const inspected = inspectArtifact(outputs[0]!);
    expect(inspected.checks.every((check) => check.status === "passed")).toBe(true);
    expect(inspected.inspection?.hasDescription).toBe(true);
    expect(metadata?.usage).toEqual({ prompt_tokens: 123, completion_tokens: 456, total_tokens: 579 });
    expect(metadata?.reportedCost).toEqual({ amount: 0.0005, currency: "USD" });
    expect(metadata?.deterministic).toBe(false);
    expect(metadata?.cfRay).toBe("test-ray-SJC");
    expect(JSON.stringify(metadata)).not.toContain("super-secret-token");
    expect(JSON.stringify(metadata)).not.toContain("account-test");
  });

  it("reports missing provider-native credentials without making a request", async () => {
    const adapter = new CloudflareSvgAdapter();
    const result = await adapter.check({
      adapter: "cloudflare-svg",
      env: "TEST_CF_TOKEN",
      options: { accountIdEnv: "TEST_CF_ACCOUNT" },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("TEST_CF_ACCOUNT");
    expect(result.message).toContain("TEST_CF_TOKEN");
  });

  it("rejects prose-only model output instead of writing it as SVG", async () => {
    const baseUrl = await mockApi((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, result: { response: "I cannot create that image." } }));
    });
    process.env.TEST_CF_ACCOUNT = "account-test";
    process.env.TEST_CF_TOKEN = "secret";
    const provider: ProviderConfig = {
      adapter: "cloudflare-svg",
      env: "TEST_CF_TOKEN",
      options: { baseUrl, accountIdEnv: "TEST_CF_ACCOUNT" },
    };
    await expect(new CloudflareSvgAdapter().generate(context(provider))).rejects.toThrow("did not contain an SVG");
  });

  it("stops reading a chunked response at the configured byte bound", async () => {
    const baseUrl = await mockApi((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.write("x".repeat(80));
      response.end("x".repeat(80));
    });
    process.env.TEST_CF_ACCOUNT = "account-test";
    process.env.TEST_CF_TOKEN = "secret";
    const provider: ProviderConfig = {
      adapter: "cloudflare-svg",
      env: "TEST_CF_TOKEN",
      options: { baseUrl, accountIdEnv: "TEST_CF_ACCOUNT", maxResponseBytes: 100 },
    };
    await expect(new CloudflareSvgAdapter().generate(context(provider))).rejects.toThrow("response exceeded 100 bytes");
  });
});
