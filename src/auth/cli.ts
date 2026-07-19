import type { Command } from "commander";
import { AuthBroker } from "./broker.js";

const MAX_TOKEN_BYTES = 16 * 1024;

async function readTokenStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("--token-stdin expects an API key on standard input");
  process.stdin.setEncoding("utf8");
  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk;
    if (Buffer.byteLength(value) > MAX_TOKEN_BYTES) throw new Error("API key input exceeded the 16 KiB limit");
  }
  return value.trim();
}

function printStatus(status: Awaited<ReturnType<AuthBroker["status"]>>): void {
  const mark = status.connected ? "✓" : "×";
  const verification = status.verified === undefined ? "" : status.verified ? " · verified" : " · verification failed";
  console.log(`  ${mark} ${status.displayName.padEnd(14)} ${status.source.padEnd(12)} ${status.detail}${verification}`);
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Connect model providers without putting credentials in Propfiles");

  auth
    .command("login")
    .description("Connect a provider using its official CLI or the operating-system keychain")
    .argument("<provider>", "provider name")
    .option("--token-stdin", "read an API key from stdin and store it securely")
    .option("--keychain", "use an API key even when an official provider CLI is installed")
    .action(async (provider: string, options: { tokenStdin?: boolean; keychain?: boolean }) => {
      const broker = new AuthBroker();
      const token = options.tokenStdin ? await readTokenStdin() : undefined;
      const status = await broker.login(provider, {
        ...(token !== undefined ? { token } : {}),
        forceKeychain: options.keychain ?? options.tokenStdin ?? false,
      });
      console.log("");
      printStatus(status);
      console.log("");
    });

  auth
    .command("status")
    .description("Show provider authentication sources without revealing credentials")
    .argument("[provider]", "provider name")
    .option("--verify", "safely verify supported credentials with the provider")
    .action(async (provider: string | undefined, options: { verify?: boolean }) => {
      const broker = new AuthBroker();
      const statuses = provider
        ? [await broker.status(provider, { verify: options.verify ?? false })]
        : await broker.statusAll({ verify: options.verify ?? false });
      console.log("");
      for (const status of statuses) printStatus(status);
      console.log("");
      if (provider && !statuses[0]?.connected) process.exitCode = 1;
    });

  auth
    .command("logout")
    .description("Remove stored provider authentication")
    .argument("<provider>", "provider name")
    .action(async (provider: string) => {
      const result = await new AuthBroker().logout(provider);
      console.log(`\n  ${result.message}\n`);
      if (!result.disconnected && result.message.includes("remains configured")) process.exitCode = 1;
    });
}
