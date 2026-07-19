import { execFile } from "node:child_process";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { ModuleOrigin } from "./loader.js";

const execFileAsync = promisify(execFile);

export interface GitModuleSource {
  root: string;
  origin: Extract<ModuleOrigin, { kind: "git" }>;
  cleanup(): Promise<void>;
}

function safeGitUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Git module sources must be full https:// or file:// URLs");
  }
  if (url.protocol !== "https:" && url.protocol !== "file:") {
    throw new Error("Git module sources must use https:// (file:// is supported for local testing)");
  }
  if (url.username || url.password) throw new Error("Git module source URLs cannot contain credentials");
  return url;
}

function resolveSubdir(checkout: string, subdir?: string): string {
  if (!subdir) return checkout;
  const root = resolve(checkout, subdir);
  const child = relative(checkout, root);
  if (!child || child.startsWith("..") || isAbsolute(child)) throw new Error("Module subdirectory must stay inside the repository");
  return root;
}

export async function checkoutGitModule(locator: string, options: { ref?: string; subdir?: string } = {}): Promise<GitModuleSource> {
  const url = safeGitUrl(locator);
  const checkout = await mkdtemp(resolve(tmpdir(), "propshop-module-"));
  try {
    await execFileAsync("git", ["clone", "--quiet", url.toString(), checkout]);
    if (options.ref) {
      let target: string;
      try {
        target = (await execFileAsync("git", ["rev-parse", "--verify", "--end-of-options", `${options.ref}^{commit}`], { cwd: checkout })).stdout.trim();
      } catch {
        target = (await execFileAsync("git", ["rev-parse", "--verify", "--end-of-options", `origin/${options.ref}^{commit}`], { cwd: checkout })).stdout.trim();
      }
      await execFileAsync("git", ["checkout", "--quiet", "--detach", target], { cwd: checkout });
    }
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: checkout });
    const revision = stdout.trim();
    if (!/^[a-f0-9]{40,64}$/i.test(revision)) throw new Error("Could not resolve the module source commit");

    const root = resolveSubdir(checkout, options.subdir);
    const stat = await lstat(root).catch(() => undefined);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error(`Module subdirectory is not a directory: ${options.subdir ?? "."}`);
    return {
      root,
      origin: {
        kind: "git",
        locator: url.toString(),
        revision,
        ...(options.subdir ? { subdir: options.subdir } : {}),
      },
      cleanup: () => rm(checkout, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(checkout, { recursive: true, force: true });
    throw error;
  }
}
