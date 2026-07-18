#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command } from "commander";
import { ZodError } from "zod";
import { listAdapters, getAdapter } from "./adapters/index.js";
import { build, getRun, listRuns, promote, VERSION } from "./core.js";
import { loadPropfile } from "./lib/files.js";
import { capabilityForProp } from "./capabilities.js";
import type { ArtifactRecord, PropDefinition } from "./types.js";

const TEMPLATE = `version: 1
project: my-prop-shop
description: A coherent collection of generated creative assets.
outputDir: props

style:
  description: Playful, tactile, slightly theatrical. Never generic AI gloss.
  references: []
  palette: ["#201827", "#ff5a47", "#fff0c7"]

providers:
  preview:
    adapter: mock
  # replicate:
  #   adapter: replicate
  #   env: REPLICATE_API_TOKEN

props:
  - id: curtain-call
    kind: sfx
    prompt: A tiny theatrical flourish for a successful UI action
    provider: preview
    variants: 2
    input:
      duration: 1.5
    tags: [ui, success]
`;

function logPlan(project: string, props: PropDefinition[]): void {
  console.log(`\n  ${project}\n`);
  for (const prop of props) {
    console.log(`  ${prop.id.padEnd(24)} ${capabilityForProp(prop).padEnd(24)} ${prop.provider.padEnd(14)} ${prop.variants} take${prop.variants === 1 ? "" : "s"}`);
  }
  console.log(`\n  ${props.length} prop${props.length === 1 ? "" : "s"} ready for the shop floor.\n`);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function writeSvgContactSheet(root: string, runId: string, propId: string, artifacts: ArtifactRecord[]): Promise<string> {
  const cards = await Promise.all(artifacts.map(async (artifact) => {
    const inspection = artifact.inspection ?? {};
    const safe = artifact.checks?.find((item) => item.name === "svg.safe")?.status === "passed";
    const failed = artifact.checks?.filter((item) => item.status === "failed") ?? [];
    const source = safe ? await readFile(resolve(root, artifact.path)) : undefined;
    const preview = source
      ? `<img src="data:image/svg+xml;base64,${source.toString("base64")}" alt="Take ${artifact.variant}"/>`
      : `<div class="blocked">Preview blocked<br/>SVG safety check did not pass</div>`;
    const colors = Array.isArray(inspection.colors) ? inspection.colors.filter((value): value is string => typeof value === "string") : [];
    return `<article>
      <div class="preview">${preview}</div>
      <header><strong>Take ${String(artifact.variant).padStart(2, "0")}</strong><code>${escapeHtml(artifact.sha256.slice(0, 12))}</code></header>
      <p>${inspection.elements ?? "—"} elements · ${inspection.paths ?? "—"} paths · depth ${inspection.maxDepth ?? "—"}</p>
      <div class="swatches">${colors.map((color) => `<i title="${escapeHtml(color)}" style="background:${escapeHtml(color)}"></i>`).join("")}</div>
      <small>${failed.length ? escapeHtml(failed.map((item) => item.name).join(", ")) : "all checks passed"}</small>
    </article>`;
  }));
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="icon" href="data:,"/>
<title>${escapeHtml(propId)} · PropShop ${escapeHtml(runId)}</title>
<style>
:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#17121f;color:#fff0c7}*{box-sizing:border-box}body{margin:0;padding:40px}h1{font:800 clamp(28px,5vw,56px) system-ui,sans-serif;margin:0}.run{color:#ff5a47;margin:8px 0 32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}article{background:#211a2b;border:1px solid #423650;border-radius:18px;padding:14px;box-shadow:0 12px 40px #0005}.preview{aspect-ratio:1;display:grid;place-items:center;background:repeating-conic-gradient(#fff0c710 0 25%,transparent 0 50%) 50%/24px 24px;border-radius:12px;overflow:hidden}.preview img{width:88%;height:88%;object-fit:contain}.blocked{text-align:center;color:#ff8d7f}header{display:flex;justify-content:space-between;gap:12px;margin-top:14px}code,small{color:#a998b8}p{margin:8px 0}.swatches{display:flex;gap:5px;min-height:18px;margin-bottom:8px}.swatches i{display:block;width:18px;height:18px;border:1px solid #fff4;border-radius:50%}
</style></head><body><h1>${escapeHtml(propId)}</h1><p class="run">${escapeHtml(runId)} · choose with your eyes</p><main class="grid">${cards.join("")}</main></body></html>`;
  const path = resolve(root, ".propshop", "runs", runId, "comparisons", `${propId}.html`);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, html, "utf8");
  return path;
}

const program = new Command()
  .name("propshop")
  .description("The creative build system for coding agents.")
  .version(VERSION)
  .showSuggestionAfterError();

program
  .command("init")
  .description("Create a Propfile.yaml")
  .argument("[directory]", "project directory", ".")
  .option("--force", "replace an existing Propfile.yaml")
  .action(async (directory: string, options: { force?: boolean }) => {
    const root = resolve(directory);
    const path = resolve(root, "Propfile.yaml");
    await mkdir(root, { recursive: true });
    if (!options.force) {
      try {
        await access(path);
        throw new Error(`Propfile already exists at ${path}`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Propfile already")) throw error;
      }
    }
    await writeFile(path, TEMPLATE, "utf8");
    console.log(`\n  Open for business: ${path}\n  Next: cd ${directory} && propshop plan\n`);
  });

program
  .command("validate")
  .description("Validate the current Propfile")
  .option("-f, --file <path>", "path to a Propfile")
  .action(async (options: { file?: string }) => {
    const loaded = await loadPropfile(options.file);
    console.log(`✓ ${loaded.path}\n  ${loaded.manifest.props.length} props · ${Object.keys(loaded.manifest.providers).length} providers`);
  });

program
  .command("plan")
  .description("Show what PropShop would build")
  .argument("[ids...]", "specific prop IDs")
  .option("-f, --file <path>", "path to a Propfile")
  .action(async (ids: string[], options: { file?: string }) => {
    const loaded = await loadPropfile(options.file);
    const selected = ids.length > 0 ? loaded.manifest.props.filter((prop) => ids.includes(prop.id)) : loaded.manifest.props;
    const missing = ids.filter((id) => !selected.some((prop) => prop.id === id));
    if (missing.length > 0) throw new Error(`Unknown props: ${missing.join(", ")}`);
    logPlan(loaded.manifest.project, selected);
  });

program
  .command("build")
  .description("Build props and write an immutable run record")
  .argument("[ids...]", "specific prop IDs")
  .option("-f, --file <path>", "path to a Propfile")
  .option("--dry-run", "write a plan without invoking providers")
  .option("--continue-on-error", "attempt remaining props after a failure")
  .action(async (ids: string[], options: { file?: string; dryRun?: boolean; continueOnError?: boolean }) => {
    console.log("\n  PropShop is open.\n");
    const result = await build({
      ...(options.file ? { propfile: options.file } : {}),
      ids,
      dryRun: options.dryRun ?? false,
      continueOnError: options.continueOnError ?? false,
      onEvent: (message) => console.log(`  ${message}`),
    });
    console.log(`\n  ${result.run.status.toUpperCase()} · ${result.run.runId}\n  ${result.path}\n`);
  });

program
  .command("doctor")
  .description("Check configured provider adapters")
  .option("-f, --file <path>", "path to a Propfile")
  .action(async (options: { file?: string }) => {
    const loaded = await loadPropfile(options.file);
    let unhealthy = false;
    console.log("");
    for (const [name, config] of Object.entries(loaded.manifest.providers)) {
      const adapter = getAdapter(config.adapter);
      const result = await adapter.check(config, { projectRoot: loaded.root });
      unhealthy ||= !result.ok;
      console.log(`  ${result.ok ? "✓" : "×"} ${name} (${adapter.name}) — ${result.message}`);
    }
    console.log(`\n  Built-in adapters: ${listAdapters().map((adapter) => `${adapter.name}@${adapter.version}`).join(", ")}\n`);
    if (unhealthy) process.exitCode = 1;
  });

program
  .command("runs")
  .description("List recent build runs")
  .option("-f, --file <path>", "path to a Propfile")
  .action(async (options: { file?: string }) => {
    const runs = await listRuns(options.file);
    if (runs.length === 0) return console.log("\n  No runs yet. The shelves are empty.\n");
    console.log("");
    for (const run of runs.slice(0, 20)) {
      console.log(`  ${run.runId}  ${run.status.padEnd(9)}  ${run.props.length} prop${run.props.length === 1 ? "" : "s"}`);
    }
    console.log("");
  });

program
  .command("show")
  .description("Print a run record")
  .argument("<run-id>")
  .option("-f, --file <path>", "path to a Propfile")
  .action(async (runId: string, options: { file?: string }) => {
    const { run } = await getRun(runId, options.file);
    console.log(JSON.stringify(run, null, 2));
  });

program
  .command("promote")
  .description("Promote one run's prop into the project's output directory")
  .argument("<prop-id>")
  .requiredOption("--run <run-id>", "source run")
  .option("--take <number>", "take number to promote", (value) => Number.parseInt(value, 10))
  .option("-f, --file <path>", "path to a Propfile")
  .action(async (propId: string, options: { run: string; file?: string; take?: number }) => {
    if (options.take !== undefined && (!Number.isInteger(options.take) || options.take < 1)) throw new Error("--take must be a positive integer");
    const outputs = await promote(options.run, propId, options.file, options.take);
    console.log(`\n  Promoted ${propId}:\n${outputs.map((path) => `  → ${path}`).join("\n")}\n`);
  });

program
  .command("compare")
  .description("Compare generated takes and their measured artifact quality")
  .argument("<prop-id>")
  .requiredOption("--run <run-id>", "source run")
  .option("-f, --file <path>", "path to a Propfile")
  .action(async (propId: string, options: { run: string; file?: string }) => {
    const { run, root } = await getRun(options.run, options.file);
    const prop = run.props.find((candidate) => candidate.id === propId);
    if (!prop) throw new Error(`Run ${options.run} has no prop named ${propId}`);
    console.log(`\n  ${prop.id} · ${prop.capability}\n`);
    for (const artifact of prop.artifacts) {
      const inspection = artifact.inspection ?? {};
      const failed = artifact.checks?.filter((check) => check.status === "failed").length ?? 0;
      if (inspection.container === "svg") {
        const elements = typeof inspection.elements === "number" ? inspection.elements : 0;
        const paths = typeof inspection.paths === "number" ? inspection.paths : 0;
        const colors = Array.isArray(inspection.colors) ? inspection.colors.length : 0;
        const depth = typeof inspection.maxDepth === "number" ? inspection.maxDepth : 0;
        console.log(`  take ${String(artifact.variant).padStart(2, "0")}  ${String(elements).padStart(4)} elements  ${String(paths).padStart(4)} paths  ${String(colors).padStart(2)} colors  depth ${String(depth).padStart(2)}  ${failed ? `${failed} failed checks` : "✓"}`);
      } else {
        const duration = typeof inspection.durationSeconds === "number" ? `${inspection.durationSeconds.toFixed(3)}s` : "—";
        const rms = typeof inspection.rmsDbfs === "number" ? `${inspection.rmsDbfs.toFixed(1)} dBFS` : "—";
        const peak = typeof inspection.peakDbfs === "number" ? `${inspection.peakDbfs.toFixed(1)} dBFS` : "—";
        console.log(`  take ${String(artifact.variant).padStart(2, "0")}  ${duration.padEnd(9)} RMS ${rms.padEnd(13)} peak ${peak.padEnd(13)} ${failed ? `${failed} failed checks` : "✓"}`);
      }
      console.log(`           ${artifact.path}`);
    }
    if (prop.artifacts.some((artifact) => artifact.inspection?.container === "svg")) {
      const contactSheet = await writeSvgContactSheet(root, run.runId, prop.id, prop.artifacts);
      console.log(`\n  Contact sheet: ${contactSheet}`);
    }
    console.log(`\n  Promote with: propshop promote ${prop.id} --run ${run.runId} --take <number>\n`);
  });

program.parseAsync().catch((error: unknown) => {
  if (error instanceof ZodError) {
    console.error("\nInvalid Propfile:\n");
    for (const issue of error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  } else {
    console.error(`\nPropShop closed early: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exitCode = 1;
});
