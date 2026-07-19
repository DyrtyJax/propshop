import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AuthProviderId, CommandRunner, SecretStore } from "./types.js";
import { SystemCommandRunner } from "./commands.js";

const execFileAsync = promisify(execFile);
const SERVICE = "dev.propshop.credentials";

class UnsupportedSecretStore implements SecretStore {
  readonly name = "unavailable";
  readonly available = false;

  constructor(readonly unavailableReason: string) {}

  async get(): Promise<undefined> { return undefined; }
  async set(): Promise<void> { throw new Error(this.unavailableReason); }
  async delete(): Promise<boolean> { return false; }
}

export class MacOsKeychainStore implements SecretStore {
  readonly name = "macOS Keychain";
  readonly available = true;

  constructor(private readonly runner: CommandRunner = new SystemCommandRunner()) {}

  async get(provider: AuthProviderId): Promise<string | undefined> {
    try {
      const result = await execFileAsync("/usr/bin/security", ["find-generic-password", "-a", provider, "-s", SERVICE, "-w"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024,
        timeout: 15_000,
      });
      const value = result.stdout.trim();
      return value || undefined;
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code === 44 || code === "44") return undefined;
      throw new Error(`Could not read ${provider} from macOS Keychain`);
    }
  }

  async set(provider: AuthProviderId, secret: string): Promise<void> {
    // `-w` as the final argument makes security prompt on stdin. Putting the
    // secret after `-w` would leak it through the process argument list.
    const result = await this.runner.run("/usr/bin/security", [
      "add-generic-password", "-U", "-a", provider, "-s", SERVICE,
      "-l", `PropShop · ${provider}`, "-w",
    ], { stdin: `${secret}\n` });
    if (result.code !== 0) throw new Error(`Could not save ${provider} in macOS Keychain`);
  }

  async delete(provider: AuthProviderId): Promise<boolean> {
    try {
      await execFileAsync("/usr/bin/security", ["delete-generic-password", "-a", provider, "-s", SERVICE], { maxBuffer: 64 * 1024, timeout: 15_000 });
      return true;
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code === 44 || code === "44") return false;
      throw new Error(`Could not remove ${provider} from macOS Keychain`);
    }
  }
}

export class LinuxSecretServiceStore implements SecretStore {
  readonly name = "Secret Service";
  readonly available = true;

  constructor(private readonly runner: CommandRunner = new SystemCommandRunner()) {}

  async get(provider: AuthProviderId): Promise<string | undefined> {
    try {
      const result = await execFileAsync("secret-tool", ["lookup", "service", SERVICE, "provider", provider], {
        encoding: "utf8",
        maxBuffer: 64 * 1024,
        timeout: 15_000,
      });
      const value = result.stdout.trim();
      return value || undefined;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return undefined;
      return undefined;
    }
  }

  async set(provider: AuthProviderId, secret: string): Promise<void> {
    const executable = await this.runner.find("secret-tool");
    if (!executable) throw new Error("Install libsecret (secret-tool) to store PropShop credentials securely");
    const result = await this.runner.run(executable, ["store", `--label=PropShop · ${provider}`, "service", SERVICE, "provider", provider], { stdin: secret });
    if (result.code !== 0) throw new Error(`Could not save ${provider} in Secret Service`);
  }

  async delete(provider: AuthProviderId): Promise<boolean> {
    const executable = await this.runner.find("secret-tool");
    if (!executable) return false;
    const result = await this.runner.run(executable, ["clear", "service", SERVICE, "provider", provider]);
    return result.code === 0;
  }
}

export function createSecretStore(platform = process.platform): SecretStore {
  if (platform === "darwin") return new MacOsKeychainStore();
  if (platform === "linux") return new LinuxSecretServiceStore();
  if (platform === "win32") {
    return new UnsupportedSecretStore("Secure Windows credential storage is not available yet. Set the provider environment variable for this session; PropShop will never write a plaintext token.");
  }
  return new UnsupportedSecretStore(`Secure credential storage is not supported on ${platform}. Use the provider environment variable for this session.`);
}
