import { spawn } from "node:child_process";
import { findExecutable } from "../lib/process.js";
import type { CommandResult, CommandRunner } from "./types.js";

const MAX_CAPTURE_BYTES = 64 * 1024;

export class SystemCommandRunner implements CommandRunner {
  async find(command: string): Promise<string | undefined> {
    try {
      return await findExecutable(command);
    } catch {
      return undefined;
    }
  }

  run(command: string, args: readonly string[], options: { interactive?: boolean; stdin?: string; captureStdout?: boolean; timeoutMs?: number } = {}): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const interactive = options.interactive ?? false;
      const timeoutMs = options.timeoutMs ?? (interactive ? 0 : 15_000);
      const child = spawn(command, [...args], {
        stdio: interactive ? "inherit" : ["pipe", "pipe", "pipe"],
        shell: false,
      });
      let captured = 0;
      let timedOut = false;
      const timeout = timeoutMs > 0 ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs) : undefined;
      const stdout: Buffer[] = [];
      const count = (chunk: Buffer): void => {
        captured += chunk.length;
        if (captured > MAX_CAPTURE_BYTES) child.kill("SIGKILL");
      };
      if (!interactive) {
        child.stdout?.on("data", (chunk: Buffer) => {
          count(chunk);
          if (options.captureStdout) stdout.push(chunk);
        });
        child.stderr?.on("data", count);
        child.stdin?.end(options.stdin ?? "");
      }
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (timeout) clearTimeout(timeout);
        if (timedOut) return reject(new Error(`Command '${command}' timed out after ${timeoutMs}ms`));
        if (captured > MAX_CAPTURE_BYTES) return reject(new Error(`Command '${command}' exceeded the output limit`));
        if (signal) return reject(new Error(`Command '${command}' ended with signal ${signal}`));
        resolve({ code: code ?? 1, ...(options.captureStdout ? { stdout: Buffer.concat(stdout).toString("utf8") } : {}) });
      });
    });
  }
}
