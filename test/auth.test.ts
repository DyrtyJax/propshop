import { describe, expect, it, vi } from "vitest";
import { AuthBroker } from "../src/auth/broker.js";
import { getAuthProvider, listAuthProviders } from "../src/auth/registry.js";
import { MacOsKeychainStore } from "../src/auth/store.js";
import type { AuthProviderId, CommandRunner, SecretStore } from "../src/auth/types.js";

class MemoryStore implements SecretStore {
  readonly name = "test keychain";
  readonly available = true;
  values = new Map<AuthProviderId, string>();
  reads = 0;

  async get(provider: AuthProviderId): Promise<string | undefined> {
    this.reads += 1;
    return this.values.get(provider);
  }
  async set(provider: AuthProviderId, secret: string): Promise<void> { this.values.set(provider, secret); }
  async delete(provider: AuthProviderId): Promise<boolean> { return this.values.delete(provider); }
}

class FakeRunner implements CommandRunner {
  available = new Set<string>();
  results = new Map<string, number>();
  outputs = new Map<string, string>();
  calls: Array<{ command: string; args: readonly string[]; options?: { interactive?: boolean; stdin?: string; captureStdout?: boolean } }> = [];

  async find(command: string): Promise<string | undefined> { return this.available.has(command) ? `/fake/${command}` : undefined; }
  async run(command: string, args: readonly string[], options?: { interactive?: boolean; stdin?: string; captureStdout?: boolean }): Promise<{ code: number; stdout?: string }> {
    this.calls.push({ command, args, ...(options ? { options } : {}) });
    const key = args.join(" ");
    const stdout = this.outputs.get(key);
    return { code: this.results.get(key) ?? 0, ...(stdout !== undefined ? { stdout } : {}) };
  }
}

describe("auth provider registry", () => {
  it("is extensible and resolves common aliases", () => {
    expect(listAuthProviders().map((provider) => provider.id)).toEqual([
      "huggingface", "cloudflare", "fal", "replicate", "together", "quiver",
    ]);
    expect(getAuthProvider("hf").id).toBe("huggingface");
    expect(getAuthProvider("workers-ai").id).toBe("cloudflare");
    expect(() => getAuthProvider("mystery-cloud")).toThrow(/Available providers/);
  });
});

describe("AuthBroker", () => {
  it("gives environment variables precedence over every persisted source", async () => {
    const store = new MemoryStore();
    store.values.set("replicate", "keychain-secret");
    const broker = new AuthBroker({ env: { REPLICATE_API_TOKEN: "environment-secret" }, store });

    const credential = await broker.getCredential("replicate");

    expect(credential).toEqual({ token: "environment-secret", source: "environment" });
    expect(store.reads).toBe(0);
    expect(await broker.status("replicate")).toEqual(expect.objectContaining({ connected: true, source: "environment" }));
  });

  it("delegates login to official CLIs without receiving a secret", async () => {
    const runner = new FakeRunner();
    runner.available.add("wrangler");
    const broker = new AuthBroker({ env: {}, store: new MemoryStore(), runner, isInteractive: true });

    const result = await broker.login("cloudflare");

    expect(result.source).toBe("official-cli");
    expect(runner.calls).toEqual([{
      command: "/fake/wrangler",
      args: ["login", "--use-keyring"],
      options: { interactive: true },
    }]);
  });

  it("retrieves a bounded official OAuth token for adapters without exposing it in status", async () => {
    const runner = new FakeRunner();
    runner.available.add("wrangler");
    runner.outputs.set("auth token --json", JSON.stringify({ type: "oauth", token: "private-oauth-token" }));
    const broker = new AuthBroker({ env: {}, store: new MemoryStore(), runner });

    const credential = await broker.getCredential("cloudflare");
    const status = await broker.status("cloudflare");

    expect(credential).toEqual({ token: "private-oauth-token", source: "official-cli" });
    expect(status).toEqual(expect.objectContaining({ connected: true, source: "official-cli" }));
    expect(JSON.stringify(status)).not.toContain("private-oauth-token");
    expect(runner.calls[0]).toEqual({
      command: "/fake/wrangler",
      args: ["auth", "token", "--json"],
      options: { captureStdout: true },
    });
  });

  it("stores API-only provider keys via a hidden prompt abstraction", async () => {
    const store = new MemoryStore();
    const prompt = vi.fn(async () => "  private-together-key  ");
    const broker = new AuthBroker({ env: {}, store, promptSecret: prompt, isInteractive: true });

    const result = await broker.login("together");

    expect(result).toEqual(expect.objectContaining({ connected: true, source: "keychain" }));
    expect(store.values.get("together")).toBe("private-together-key");
    expect(JSON.stringify(result)).not.toContain("private-together-key");
  });

  it("fails noninteractive login with an exact safe action", async () => {
    const broker = new AuthBroker({ env: {}, store: new MemoryStore(), isInteractive: false });
    await expect(broker.login("replicate")).rejects.toThrow(
      "pipe a token to 'propshop auth login replicate --token-stdin'",
    );
  });

  it("can remotely verify without returning the credential", async () => {
    const store = new MemoryStore();
    store.values.set("replicate", "private-replicate-key");
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({ Authorization: "Bearer private-replicate-key" });
      return new Response('{"username":"someone"}', { status: 200, headers: { "content-type": "application/json" } });
    });
    const broker = new AuthBroker({ env: {}, store, fetch: fetchMock as typeof fetch });

    const status = await broker.status("replicate", { verify: true });

    expect(status).toEqual(expect.objectContaining({ connected: true, verified: true, source: "keychain" }));
    expect(JSON.stringify(status)).not.toContain("private-replicate-key");
  });

  it("explains why an environment credential remains after logout", async () => {
    const store = new MemoryStore();
    store.values.set("quiver", "stored-key");
    const broker = new AuthBroker({ env: { QUIVERAI_API_KEY: "shell-key" }, store });

    const result = await broker.logout("quiver");

    expect(result.disconnected).toBe(false);
    expect(result.message).toContain("unset QUIVERAI_API_KEY");
    expect(store.values.has("quiver")).toBe(false);
  });
});

describe("MacOsKeychainStore", () => {
  it("passes secrets over stdin instead of argv", async () => {
    const runner = new FakeRunner();
    const store = new MacOsKeychainStore(runner);

    await store.set("quiver", "never-in-the-process-list");

    const call = runner.calls[0];
    expect(call?.args).not.toContain("never-in-the-process-list");
    expect(call?.args.at(-1)).toBe("-w");
    expect(call?.options?.stdin).toBe("never-in-the-process-list\n");
  });
});
