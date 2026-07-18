import { createServer } from "node:http";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { AudioCppAdapter } from "../src/adapters/audio-cpp/index.js";
import { build } from "../src/core.js";
import type { RunRecord } from "../src/types.js";
import { makeWav } from "./helpers/wav.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done())))));

function audioMetadata(run: RunRecord): Record<string, unknown> {
  return run.props[0]?.artifacts[0]?.providerMetadata ?? {};
}

async function writeManifest(root: string, provider: Record<string, unknown>, model = "small-sfx"): Promise<string> {
  const path = resolve(root, "Propfile.yaml");
  await writeFile(
    path,
    stringify({
      version: 1,
      project: "audio-shop",
      providers: { local: provider },
      props: [
        {
          id: "menu-hover",
          kind: "sfx",
          capability: "audio.sfx.generate",
          prompt: "a tiny glassy menu hover",
          provider: "local",
          ...(model ? { model } : {}),
          variants: 1,
          input: { durationSeconds: 0.1, seed: "locked", negativePrompt: "music" },
          checks: {
            audio: {
              durationSeconds: { min: 0.09, max: 0.11 },
              sampleRates: [8_000],
              channels: [1],
              maxClippedRatio: 0,
            },
          },
        },
      ],
    }),
  );
  return path;
}

describe("audio.cpp adapter", () => {
  it("runs a CLI safely, inspects WAV output, and locks a seed", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "propshop-audio-cli-"));
    const model = resolve(root, "model");
    await mkdir(model);
    const wav = makeWav();
    const executable = resolve(root, "fake-audiocpp");
    await writeFile(
      executable,
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--list-loaders")) { console.log("stable_audio"); process.exit(0); }
const out = args[args.indexOf("--out") + 1];
fs.writeFileSync(out, Buffer.from("${Buffer.from(wav).toString("base64")}", "base64"));
`,
    );
    await chmod(executable, 0o755);
    const propfile = await writeManifest(root, {
      adapter: "audio-cpp",
      options: {
        transport: "cli",
        executable,
        backend: "cpu",
        models: {
          "small-sfx": {
            family: "stable_audio",
            path: model,
            source: "stabilityai/stable-audio-3-small-sfx",
            revision: "test-revision",
            license: { id: "Stability-AI-Community", restrictions: ["model terms apply"] },
          },
        },
      },
    });

    const first = await build({ propfile });
    const second = await build({ propfile });
    expect(first.run.status).toBe("succeeded");
    expect(first.run.props[0]?.capability).toBe("audio.sfx.generate");
    expect(first.run.props[0]?.artifacts[0]?.inspection?.sampleRate).toBe(8_000);
    expect(first.run.props[0]?.artifacts[0]?.checks?.every((check) => check.status === "passed")).toBe(true);
    expect(audioMetadata(first.run).transport).toBe("cli");
    expect(audioMetadata(first.run).seed).toBe(audioMetadata(second.run).seed);
  });

  it("includes a provider-default model in locked seed identity", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "propshop-audio-seed-"));
    const model = resolve(root, "model");
    await mkdir(model);
    const wav = makeWav();
    const executable = resolve(root, "fake-audiocpp");
    await writeFile(
      executable,
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--list-loaders")) process.exit(0);
fs.writeFileSync(args[args.indexOf("--out") + 1], Buffer.from("${Buffer.from(wav).toString("base64")}", "base64"));
`,
    );
    await chmod(executable, 0o755);
    const propfile = await writeManifest(root, {
      adapter: "audio-cpp",
      options: {
        transport: "cli",
        executable,
        defaultModel: "small-sfx",
        models: { "small-sfx": { family: "stable_audio", path: model } },
      },
    }, "");

    const first = await build({ propfile });
    await writeManifest(root, {
      adapter: "audio-cpp",
      options: {
        transport: "cli",
        executable,
        defaultModel: "alternate-sfx",
        models: { "alternate-sfx": { family: "stable_audio", path: model } },
      },
    }, "");
    const second = await build({ propfile });
    expect(audioMetadata(first.run).seed).not.toBe(audioMetadata(second.run).seed);
    expect((audioMetadata(first.run).model as Record<string, unknown>).id).toBe("small-sfx");
    expect((audioMetadata(second.run).model as Record<string, unknown>).id).toBe("alternate-sfx");
  });

  it("uses the warm HTTP transport without coupling to its response shape", async () => {
    const wav = makeWav();
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/health") return response.end(JSON.stringify({ status: "ok", backend: "cuda", models: 1 }));
      if (request.url === "/v1/models") return response.end(JSON.stringify({ data: [{ id: "sfx", family: "stable_audio", task: "gen", mode: "offline" }] }));
      if (request.url === "/v1/tasks/run") return response.end(JSON.stringify({ audio: Buffer.from(wav).toString("base64"), sample_rate: 8_000, channels: 1, timing: { wall_ms: 12 } }));
      response.statusCode = 404;
      response.end("{}");
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    const root = await mkdtemp(resolve(tmpdir(), "propshop-audio-http-"));
    const propfile = await writeManifest(root, {
      adapter: "audio-cpp",
      options: {
        transport: "http",
        serverUrl: `http://127.0.0.1:${address.port}`,
        models: { "small-sfx": { family: "stable_audio", serverId: "sfx" } },
      },
    });
    const result = await build({ propfile });
    expect(result.run.status).toBe("succeeded");
    expect(audioMetadata(result.run).transport).toBe("http");
    expect((audioMetadata(result.run).server as Record<string, unknown>).backend).toBe("cuda");
  });

  it("refuses remote HTTP servers unless explicitly allowed", async () => {
    const adapter = new AudioCppAdapter();
    const health = await adapter.check({
      adapter: "audio-cpp",
      options: {
        transport: "http",
        serverUrl: "https://example.com",
        models: { sfx: { family: "stable_audio", serverId: "sfx" } },
      },
    });
    expect(health.ok).toBe(false);
    expect(health.message).toMatch(/Refusing remote/);
  });
});
