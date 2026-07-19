import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { parseModuleManifest, type ModuleManifest } from "./schema.js";

const MANIFEST_NAMES = ["propshop.module.yaml", "propshop.module.yml", "propshop.module.json"] as const;
const MAX_SKILL_FILES = 500;
const MAX_SKILL_BYTES = 25 * 1024 * 1024;
const IGNORED_SKILL_DIRECTORIES = new Set([".git", "node_modules"]);

export interface LoadedModule {
  root: string;
  manifestPath: string;
  manifestBytes: Uint8Array;
  manifest: ModuleManifest;
}

export interface AttachModuleOptions {
  modulePath: string;
  project: string;
  agent: "codex" | "claude";
  force?: boolean;
  origin?: ModuleOrigin;
}

export type ModuleOrigin =
  | { kind: "local"; locator: string }
  | { kind: "git"; locator: string; revision: string; subdir?: string };

export interface ModuleAttachment {
  schemaVersion: 1;
  name: string;
  version: string;
  license: string;
  manifestSha256: string;
  attachedAt: string;
  agent: "codex" | "claude";
  origin: ModuleOrigin;
  skills: Array<{ name: string; destination: string; sha256: string; files: number; bytes: number }>;
  source?: ModuleManifest["source"];
  upstreams: ModuleManifest["upstreams"];
}

async function findManifest(root: string): Promise<string> {
  for (const name of MANIFEST_NAMES) {
    const candidate = resolve(root, name);
    try {
      if ((await lstat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next supported manifest name.
    }
  }
  throw new Error(`No ${MANIFEST_NAMES.join(", ")} found in ${root}`);
}

async function resolveModuleRoot(modulePath: string): Promise<string> {
  const local = resolve(modulePath);
  try {
    await findManifest(local);
    return local;
  } catch (localError) {
    if (/^[a-z0-9][a-z0-9-]*$/.test(modulePath)) {
      const bundled = resolve(dirname(fileURLToPath(import.meta.url)), "../../modules", modulePath);
      try {
        await findManifest(bundled);
        return bundled;
      } catch {
        // Preserve the more useful error for the path the user supplied.
      }
    }
    throw localError;
  }
}

export async function loadModule(modulePath: string): Promise<LoadedModule> {
  const root = await resolveModuleRoot(modulePath);
  const manifestPath = await findManifest(root);
  const manifestBytes = await readFile(manifestPath);
  const parsed = YAML.parse(manifestBytes.toString("utf8")) as unknown;
  const manifest = parseModuleManifest(parsed);
  return { root, manifestPath, manifestBytes, manifest };
}

function ignoredSkillPath(root: string, path: string): boolean {
  const child = relative(root, path);
  return child.split(/[\\/]/).some((part) => IGNORED_SKILL_DIRECTORIES.has(part));
}

async function inspectSkillTree(root: string): Promise<{ sha256: string; files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const hash = createHash("sha256");

  async function visit(path: string): Promise<void> {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Module skills cannot contain symbolic links: ${path}`);
    if (stat.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) {
        const child = resolve(path, entry);
        if (!ignoredSkillPath(root, child)) await visit(child);
      }
      return;
    }
    if (!stat.isFile()) throw new Error(`Unsupported module skill entry: ${path}`);
    files += 1;
    bytes += stat.size;
    if (files > MAX_SKILL_FILES) throw new Error(`Module skill exceeds ${MAX_SKILL_FILES} files`);
    if (bytes > MAX_SKILL_BYTES) throw new Error(`Module skill exceeds ${MAX_SKILL_BYTES} bytes`);
    hash.update(relative(root, path));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }

  await visit(root);
  return { sha256: hash.digest("hex"), files, bytes };
}

export async function attachModule(options: AttachModuleOptions): Promise<ModuleAttachment> {
  const loaded = await loadModule(options.modulePath);
  const project = resolve(options.project);
  const skillsRoot = resolve(project, options.agent === "codex" ? ".agents/skills" : ".claude/skills");
  const destinations: ModuleAttachment["skills"] = [];

  for (const skill of loaded.manifest.skills) {
    const source = resolve(loaded.root, skill.path);
    const sourceRelative = relative(loaded.root, source);
    if (!sourceRelative || sourceRelative.startsWith("..") || isAbsolute(sourceRelative)) throw new Error(`Skill path escapes module: ${skill.path}`);
    const sourceStat = await lstat(source).catch(() => undefined);
    if (!sourceStat?.isDirectory()) throw new Error(`Skill path is not a directory: ${skill.path}`);
    await lstat(resolve(source, "SKILL.md")).catch(() => {
      throw new Error(`Skill ${skill.name} has no SKILL.md`);
    });
    const payload = await inspectSkillTree(source);

    const destination = resolve(skillsRoot, skill.name);
    try {
      await lstat(destination);
      if (!options.force) throw new Error(`Skill already attached: ${destination} (use --force to replace it)`);
      await rm(destination, { recursive: true, force: true });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Skill already attached")) throw error;
    }
    await mkdir(skillsRoot, { recursive: true });
    await cp(source, destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (path) => !ignoredSkillPath(source, path),
    });
    destinations.push({ name: skill.name, destination, ...payload });
  }

  const record: ModuleAttachment = {
    schemaVersion: 1,
    name: loaded.manifest.name,
    version: loaded.manifest.version,
    license: loaded.manifest.license,
    manifestSha256: createHash("sha256").update(loaded.manifestBytes).digest("hex"),
    attachedAt: new Date().toISOString(),
    agent: options.agent,
    origin: options.origin ?? { kind: "local", locator: loaded.root },
    skills: destinations,
    ...(loaded.manifest.source ? { source: loaded.manifest.source } : {}),
    upstreams: loaded.manifest.upstreams,
  };
  const recordsRoot = resolve(project, ".propshop/modules");
  await mkdir(recordsRoot, { recursive: true });
  await writeFile(resolve(recordsRoot, `${loaded.manifest.name}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

export async function listAttachments(projectPath: string): Promise<ModuleAttachment[]> {
  const root = resolve(projectPath, ".propshop/modules");
  let names: string[];
  try {
    names = (await readdir(root)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(resolve(root, name), "utf8")) as ModuleAttachment));
}
