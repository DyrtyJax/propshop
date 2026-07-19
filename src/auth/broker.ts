import { getAuthProvider, listAuthProviders } from "./registry.js";
import { SystemCommandRunner } from "./commands.js";
import { promptHidden } from "./prompt.js";
import { createSecretStore } from "./store.js";
import type {
  AuthBrokerOptions,
  AuthLoginOptions,
  AuthProviderManifest,
  AuthStatus,
  CommandRunner,
  SecretStore,
} from "./types.js";

const VERIFY_TIMEOUT_MS = 10_000;

export class AuthBroker {
  private readonly env: NodeJS.ProcessEnv;
  private readonly store: SecretStore;
  private readonly runner: CommandRunner;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly promptSecret: (message: string) => Promise<string>;
  private readonly interactive: boolean;

  constructor(options: AuthBrokerOptions = {}) {
    this.env = options.env ?? process.env;
    this.store = options.store ?? createSecretStore();
    this.runner = options.runner ?? new SystemCommandRunner();
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.promptSecret = options.promptSecret ?? promptHidden;
    this.interactive = options.isInteractive ?? Boolean(process.stdin.isTTY && process.stderr.isTTY);
  }

  providers(): readonly AuthProviderManifest[] {
    return listAuthProviders();
  }

  async getCredential(name: string): Promise<{ token: string; source: "environment" | "official-cli" | "keychain" } | undefined> {
    const provider = getAuthProvider(name);
    for (const variable of provider.env) {
      const value = this.env[variable]?.trim();
      if (value) return { token: value, source: "environment" };
    }
    const official = provider.officialCli;
    if (official?.credentialArgs && official.parseCredential) {
      const executable = await this.runner.find(official.command);
      if (executable) {
        const result = await this.runner.run(executable, official.credentialArgs, { captureStdout: true });
        if (result.code === 0 && result.stdout !== undefined) {
          const value = official.parseCredential(result.stdout);
          if (value) return { token: value, source: "official-cli" };
        }
      }
    }
    const value = await this.store.get(provider.id);
    return value ? { token: value, source: "keychain" } : undefined;
  }

  async status(name: string, options: { verify?: boolean } = {}): Promise<AuthStatus> {
    const provider = getAuthProvider(name);
    const credential = await this.getCredential(provider.id);
    if (credential) {
      if (options.verify && provider.remoteVerification) {
        const verified = await this.verify(provider, credential.token);
        return {
          provider: provider.id,
          displayName: provider.displayName,
          connected: verified,
          source: credential.source,
          detail: verified ? `${credential.source}; remote verification passed` : `${credential.source}; remote verification failed`,
          verified,
        };
      }
      return {
        provider: provider.id,
        displayName: provider.displayName,
        connected: true,
        source: credential.source,
        detail: credential.source === "environment"
          ? `configured by ${provider.env.find((key) => this.env[key]?.trim())}`
          : credential.source === "official-cli"
            ? `managed by ${provider.officialCli?.command ?? "provider CLI"}`
            : `stored in ${this.store.name}`,
      };
    }

    if (provider.officialCli) {
      const executable = await this.runner.find(provider.officialCli.command);
      if (executable) {
        const result = await this.runner.run(executable, provider.officialCli.statusArgs);
        if (result.code === 0) {
          return { provider: provider.id, displayName: provider.displayName, connected: true, source: "official-cli", detail: `managed by ${provider.officialCli.command}` };
        }
      }
    }
    return { provider: provider.id, displayName: provider.displayName, connected: false, source: "none", detail: `run: propshop auth login ${provider.id}` };
  }

  async statusAll(options: { verify?: boolean } = {}): Promise<AuthStatus[]> {
    const statuses: AuthStatus[] = [];
    for (const provider of listAuthProviders()) statuses.push(await this.status(provider.id, options));
    return statuses;
  }

  async login(name: string, options: AuthLoginOptions = {}): Promise<AuthStatus> {
    const provider = getAuthProvider(name);
    const environmentVariable = provider.env.find((key) => this.env[key]?.trim());
    if (environmentVariable) {
      return { provider: provider.id, displayName: provider.displayName, connected: true, source: "environment", detail: `already configured by ${environmentVariable}` };
    }

    if (!options.forceKeychain && options.token === undefined && provider.officialCli) {
      const executable = await this.runner.find(provider.officialCli.command);
      if (executable) {
        if (!this.interactive) {
          throw new Error(`Interactive login required. Run 'propshop auth login ${provider.id}' in a terminal, or set ${provider.env[0]}.`);
        }
        const result = await this.runner.run(executable, provider.officialCli.loginArgs, { interactive: true });
        if (result.code !== 0) throw new Error(`${provider.displayName} login did not complete`);
        return { provider: provider.id, displayName: provider.displayName, connected: true, source: "official-cli", detail: `managed by ${provider.officialCli.command}` };
      }
    }

    if (!this.store.available) {
      const cliHint = provider.officialCli ? ` ${provider.officialCli.installHint}` : "";
      throw new Error(`${this.store.unavailableReason ?? "No secure credential store is available."}${cliHint} Or set ${provider.env[0]}.`);
    }
    if (!this.interactive && options.token === undefined) {
      throw new Error(`Interactive login required. Run 'propshop auth login ${provider.id}' in a terminal, or pipe a token to 'propshop auth login ${provider.id} --token-stdin'. Create one at ${provider.tokenUrl}`);
    }
    const value = (options.token ?? await this.promptSecret(`${provider.displayName} API key (input hidden): `)).trim();
    if (!value) throw new Error("No API key was provided");
    await this.store.set(provider.id, value);
    return { provider: provider.id, displayName: provider.displayName, connected: true, source: "keychain", detail: `stored in ${this.store.name}` };
  }

  async logout(name: string): Promise<{ message: string; disconnected: boolean }> {
    const provider = getAuthProvider(name);
    const variables = provider.env.filter((key) => this.env[key]?.trim());
    let disconnected = await this.store.delete(provider.id);
    if (variables.length > 0) {
      return { disconnected: false, message: `Stored credentials removed. ${provider.displayName} remains configured by the current shell; run: unset ${variables.join(" ")}` };
    }
    if (provider.officialCli) {
      const executable = await this.runner.find(provider.officialCli.command);
      if (executable) {
        const status = await this.runner.run(executable, provider.officialCli.statusArgs);
        if (status.code === 0) {
          const result = await this.runner.run(executable, provider.officialCli.logoutArgs, { interactive: this.interactive });
          if (result.code !== 0) throw new Error(`${provider.displayName} logout did not complete`);
          disconnected = true;
        }
      }
    }
    return { disconnected, message: disconnected ? `${provider.displayName} disconnected` : `${provider.displayName} had no stored login` };
  }

  private async verify(provider: AuthProviderManifest, secret: string): Promise<boolean> {
    const verification = provider.remoteVerification;
    if (!verification) return true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(verification.url, {
        method: verification.method ?? "GET",
        headers: verification.headers(secret),
        signal: controller.signal,
      });
      let body: unknown;
      try { body = await response.json(); } catch { body = undefined; }
      return verification.isValid(response.status, body);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
