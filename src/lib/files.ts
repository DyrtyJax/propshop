import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { parse } from "yaml";
import { parsePropfile } from "../schema.js";
import type { Propfile, RunRecord } from "../types.js";

export const PROPFILE_NAMES = ["Propfile.yaml", "Propfile.yml"] as const;

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function createRunId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

export async function findPropfile(start = process.cwd()): Promise<string> {
  const { access } = await import("node:fs/promises");
  let directory = resolve(start);
  while (true) {
    for (const name of PROPFILE_NAMES) {
      const candidate = resolve(directory, name);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Keep walking toward the filesystem root.
      }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("No Propfile.yaml found. Run `propshop init` first.");
}

export async function loadPropfile(path?: string): Promise<{
  path: string;
  root: string;
  source: string;
  manifest: Propfile;
}> {
  const resolvedPath = path ? resolve(path) : await findPropfile();
  const source = await readFile(resolvedPath, "utf8");
  const manifest = parsePropfile(parse(source));
  return { path: resolvedPath, root: dirname(resolvedPath), source, manifest };
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function writeRun(root: string, run: RunRecord): Promise<string> {
  const path = resolve(root, ".propshop", "runs", run.runId, "run.json");
  await writeJsonAtomic(path, run);
  return path;
}

export async function appendRunEvent(
  root: string,
  runId: string,
  type: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const path = resolve(root, ".propshop", "runs", runId, "events.ndjson");
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ timestamp: new Date().toISOString(), type, ...data })}\n`, "utf8");
}

export function relativePosix(root: string, path: string): string {
  return relative(root, path).split("\\").join("/");
}
