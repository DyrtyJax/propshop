import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { getAdapter } from "./adapters/index.js";
import {
  createRunId,
  appendRunEvent,
  loadPropfile,
  relativePosix,
  sha256,
  writeJsonAtomic,
  writeRun,
} from "./lib/files.js";
import type { Adapter, PropDefinition, PropRunRecord, RunRecord } from "./types.js";
import { inspectArtifact } from "./validation/index.js";
import { adapterSupports, capabilityForProp, normalizedParameters } from "./capabilities.js";

export const VERSION = "0.3.0";

function selectProps(props: PropDefinition[], ids: string[]): PropDefinition[] {
  if (ids.length === 0) return props;
  const requested = new Set(ids);
  const selected = props.filter((prop) => requested.has(prop.id));
  const missing = ids.filter((id) => !selected.some((prop) => prop.id === id));
  if (missing.length > 0) throw new Error(`Unknown prop${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
  return selected;
}

function propRecord(prop: PropDefinition, adapter: Adapter): PropRunRecord {
  return {
    id: prop.id,
    kind: prop.kind,
    capability: capabilityForProp(prop),
    prompt: prop.prompt,
    provider: prop.provider,
    adapter: adapter.name,
    adapterVersion: adapter.version,
    ...(prop.model ? { model: prop.model } : {}),
    status: "planned",
    artifacts: [],
  };
}

export interface BuildOptions {
  propfile?: string;
  ids?: string[];
  dryRun?: boolean;
  continueOnError?: boolean;
  onEvent?: (message: string) => void;
}

export async function build(options: BuildOptions = {}): Promise<{ run: RunRecord; path: string }> {
  const loaded = await loadPropfile(options.propfile);
  const props = selectProps(loaded.manifest.props, options.ids ?? []);
  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const run: RunRecord = {
    schemaVersion: 1,
    runId,
    project: loaded.manifest.project,
    propfile: relativePosix(loaded.root, loaded.path),
    propfileSha256: sha256(loaded.source),
    startedAt,
    status: options.dryRun ? "planned" : "running",
    props: props.map((prop) => {
      const provider = loaded.manifest.providers[prop.provider];
      if (!provider) throw new Error(`Unknown provider ${prop.provider}`);
      const adapter = getAdapter(provider.adapter);
      const capability = capabilityForProp(prop);
      if (!adapterSupports(adapter.capabilities, capability)) {
        throw new Error(`Adapter '${adapter.name}' does not support capability '${capability}'`);
      }
      return propRecord(prop, adapter);
    }),
    tool: {
      name: "propshop",
      version: VERSION,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    },
  };

  let runPath = await writeRun(loaded.root, run);
  await appendRunEvent(loaded.root, runId, options.dryRun ? "run.planned" : "run.started", {
    project: run.project,
    propfileSha256: run.propfileSha256,
    props: run.props.map((prop) => ({ id: prop.id, capability: prop.capability, adapter: prop.adapter, adapterVersion: prop.adapterVersion })),
  });
  if (options.dryRun) return { run, path: runPath };

  for (const [index, prop] of props.entries()) {
    const record = run.props[index];
    if (!record) continue;
    const provider = loaded.manifest.providers[prop.provider];
    if (!provider) continue;
    const adapter = getAdapter(provider.adapter);
    const capability = capabilityForProp(prop);
    if (!adapterSupports(adapter.capabilities, capability)) {
      throw new Error(`Adapter '${adapter.name}' does not support capability '${capability}'`);
    }
    record.status = "running";
    record.startedAt = new Date().toISOString();
    await appendRunEvent(loaded.root, runId, "prop.started", { propId: prop.id, capability, adapter: adapter.name });
    options.onEvent?.(`building ${prop.id} via ${prop.provider}/${adapter.name}`);
    await writeRun(loaded.root, run);

    try {
      const health = await adapter.check(provider, { projectRoot: loaded.root });
      if (!health.ok) throw new Error(health.message);
      const failedChecks: string[] = [];
      for (let variant = 1; variant <= prop.variants; variant += 1) {
        const outputs = await adapter.generate({
          projectRoot: loaded.root,
          runId,
          prop,
          capability,
          parameters: normalizedParameters(prop),
          providerName: prop.provider,
          provider,
          variant,
          ...(loaded.manifest.style ? { style: loaded.manifest.style } : {}),
        });
        for (const [outputIndex, output] of outputs.entries()) {
          const validation = inspectArtifact(output, prop.checks);
          const suffix = outputs.length > 1 ? `-${outputIndex + 1}` : "";
          const filename = `${prop.id}-take-${String(variant).padStart(2, "0")}${suffix}.${output.extension.replace(/^\./, "")}`;
          const path = resolve(loaded.root, ".propshop", "runs", runId, "artifacts", prop.id, filename);
          await mkdir(resolve(path, ".."), { recursive: true });
          await writeFile(path, output.bytes);
          record.artifacts.push({
            path: relativePosix(loaded.root, path),
            sha256: sha256(output.bytes),
            bytes: output.bytes.byteLength,
            mediaType: output.mediaType,
            variant,
            ...(validation.inspection ? { inspection: validation.inspection } : {}),
            ...(validation.checks.length > 0 ? { checks: validation.checks } : {}),
            ...(output.providerMetadata ? { providerMetadata: output.providerMetadata } : {}),
          });
          const artifact = record.artifacts.at(-1);
          await appendRunEvent(loaded.root, runId, "artifact.created", {
            propId: prop.id,
            variant,
            path: artifact?.path,
            sha256: artifact?.sha256,
            bytes: artifact?.bytes,
            checks: artifact?.checks,
          });
          failedChecks.push(...validation.checks.filter((item) => item.status === "failed").map((item) => `${prop.id}/${item.name}`));
        }
      }
      if (failedChecks.length > 0) throw new Error(`Artifact checks failed: ${failedChecks.join(", ")}`);
      record.status = "succeeded";
      record.completedAt = new Date().toISOString();
      await appendRunEvent(loaded.root, runId, "prop.completed", { propId: prop.id, artifacts: record.artifacts.length });
      options.onEvent?.(`finished ${prop.id} (${record.artifacts.length} artifact${record.artifacts.length === 1 ? "" : "s"})`);
    } catch (error) {
      record.status = "failed";
      record.completedAt = new Date().toISOString();
      record.error = error instanceof Error ? error.message : String(error);
      await appendRunEvent(loaded.root, runId, "prop.failed", { propId: prop.id, error: record.error });
      options.onEvent?.(`failed ${prop.id}: ${record.error}`);
      if (!options.continueOnError) {
        run.status = run.props.some((item) => item.status === "succeeded") ? "partial" : "failed";
        run.completedAt = new Date().toISOString();
        runPath = await writeRun(loaded.root, run);
        await appendRunEvent(loaded.root, runId, "run.completed", { status: run.status });
        throw Object.assign(new Error(record.error), { runPath });
      }
    }
    await writeRun(loaded.root, run);
  }

  const succeeded = run.props.filter((prop) => prop.status === "succeeded").length;
  run.status = succeeded === run.props.length ? "succeeded" : succeeded === 0 ? "failed" : "partial";
  run.completedAt = new Date().toISOString();
  runPath = await writeRun(loaded.root, run);
  await appendRunEvent(loaded.root, runId, "run.completed", { status: run.status });
  return { run, path: runPath };
}

export async function getRun(runId: string, propfile?: string): Promise<{ run: RunRecord; root: string; path: string }> {
  const loaded = await loadPropfile(propfile);
  const path = resolve(loaded.root, ".propshop", "runs", runId, "run.json");
  const run = JSON.parse(await readFile(path, "utf8")) as RunRecord;
  return { run, root: loaded.root, path };
}

export async function listRuns(propfile?: string): Promise<RunRecord[]> {
  const loaded = await loadPropfile(propfile);
  const directory = resolve(loaded.root, ".propshop", "runs");
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return [];
  }
  const runs = await Promise.all(
    entries.map(async (entry) => {
      try {
        return JSON.parse(await readFile(resolve(directory, entry, "run.json"), "utf8")) as RunRecord;
      } catch {
        return undefined;
      }
    }),
  );
  return runs.filter((run): run is RunRecord => Boolean(run)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function promote(runId: string, propId: string, propfile?: string, take?: number): Promise<string[]> {
  const loaded = await loadPropfile(propfile);
  const { run } = await getRun(runId, loaded.path);
  const prop = run.props.find((candidate) => candidate.id === propId);
  if (!prop) throw new Error(`Run ${runId} has no prop named ${propId}`);
  if (prop.status !== "succeeded" || prop.artifacts.length === 0) {
    throw new Error(`Prop ${propId} has no successful artifacts to promote`);
  }
  const variants = [...new Set(prop.artifacts.map((artifact) => artifact.variant))];
  if (take === undefined && variants.length > 1) {
    throw new Error(`Prop ${propId} has ${variants.length} takes; choose one with --take <number>`);
  }
  const selectedTake = take ?? variants[0];
  const selectedArtifacts = prop.artifacts.filter((artifact) => artifact.variant === selectedTake);
  if (selectedArtifacts.length === 0) throw new Error(`Prop ${propId} has no take ${selectedTake}`);

  const destination = resolve(loaded.root, loaded.manifest.outputDir, propId);
  await mkdir(destination, { recursive: true });
  const promoted: string[] = [];
  for (const artifact of selectedArtifacts) {
    const source = resolve(loaded.root, artifact.path);
    const output = resolve(destination, basename(artifact.path));
    await cp(source, output);
    promoted.push(relativePosix(loaded.root, output));
  }

  const lockPath = resolve(loaded.root, "Propfile.lock");
  let lock: Record<string, unknown> = { schemaVersion: 1, project: loaded.manifest.project, promoted: {} };
  try {
    lock = JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>;
  } catch {
    // First promotion creates the lockfile.
  }
  const existing = (lock.promoted ?? {}) as Record<string, unknown>;
  lock.promoted = {
    ...existing,
    [propId]: {
      runId,
      take: selectedTake,
      promotedAt: new Date().toISOString(),
      artifacts: selectedArtifacts.map(({ path: _path, ...artifact }) => artifact),
      files: promoted,
    },
  };
  await writeJsonAtomic(lockPath, lock);
  return promoted;
}
