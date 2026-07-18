export type AuthProviderId = "huggingface" | "cloudflare" | "fal" | "replicate" | "together" | "quiver";

export interface OfficialCliAuth {
  command: string;
  loginArgs: readonly string[];
  statusArgs: readonly string[];
  logoutArgs: readonly string[];
  installHint: string;
  credentialArgs?: readonly string[];
  parseCredential?: (stdout: string) => string | undefined;
}

export interface RemoteVerification {
  url: string;
  method?: "GET" | "POST";
  headers(token: string): Record<string, string>;
  isValid(status: number, body: unknown): boolean;
}

export interface AuthProviderManifest {
  id: AuthProviderId;
  aliases: readonly string[];
  displayName: string;
  env: readonly string[];
  tokenUrl: string;
  officialCli?: OfficialCliAuth;
  remoteVerification?: RemoteVerification;
}

export type AuthSource = "environment" | "official-cli" | "keychain" | "none";

export interface AuthStatus {
  provider: AuthProviderId;
  displayName: string;
  connected: boolean;
  source: AuthSource;
  detail: string;
  verified?: boolean;
}

export interface SecretStore {
  readonly name: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  get(provider: AuthProviderId): Promise<string | undefined>;
  set(provider: AuthProviderId, secret: string): Promise<void>;
  delete(provider: AuthProviderId): Promise<boolean>;
}

export interface CommandResult {
  code: number;
  stdout?: string;
}

export interface CommandRunner {
  find(command: string): Promise<string | undefined>;
  run(command: string, args: readonly string[], options?: { interactive?: boolean; stdin?: string; captureStdout?: boolean; timeoutMs?: number }): Promise<CommandResult>;
}

export interface AuthBrokerOptions {
  env?: NodeJS.ProcessEnv;
  store?: SecretStore;
  runner?: CommandRunner;
  fetch?: typeof globalThis.fetch;
  promptSecret?: (message: string) => Promise<string>;
  isInteractive?: boolean;
}

export interface AuthLoginOptions {
  token?: string;
  forceKeychain?: boolean;
}
