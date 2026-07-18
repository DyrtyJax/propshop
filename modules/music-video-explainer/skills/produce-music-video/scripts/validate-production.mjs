#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, resolve } from "node:path";

function parseArgs(argv) {
  const options = { checkAssets: false, publication: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check-assets") options.checkAssets = true;
    else if (arg === "--publication") options.publication = true;
    else if (arg === "--shots" || arg === "--facts") options[arg.slice(2)] = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.shots || !options.facts) throw new Error("Usage: validate-production.mjs --shots <shots.json> --facts <facts.json> [--check-assets] [--publication]");
  return options;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const errors = [];
const warnings = [];
const requireValue = (condition, message) => {
  if (!condition) errors.push(message);
};
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const unique = (values) => new Set(values).size === values.length;

function safeRelativePath(value, label) {
  requireValue(nonEmpty(value), `${label} must be a non-empty path`);
  if (!nonEmpty(value)) return false;
  const parts = normalize(value).split(/[\\/]/);
  const safe = !isAbsolute(value) && !parts.includes("..");
  requireValue(safe, `${label} must stay inside the production directory: ${value}`);
  return safe;
}

const options = parseArgs(process.argv.slice(2));
const shotPath = resolve(options.shots);
const factPath = resolve(options.facts);
const [manifest, factPack] = await Promise.all([readJson(shotPath), readJson(factPath)]);

requireValue(manifest?.schemaVersion === 1, "shots.schemaVersion must be 1");
requireValue(factPack?.schemaVersion === 1, "facts.schemaVersion must be 1");
requireValue(nonEmpty(manifest?.project), "shots.project is required");
requireValue(nonEmpty(factPack?.project), "facts.project is required");
requireValue(manifest?.project === factPack?.project, "shots.project and facts.project must match");
requireValue(/^\d{4}-\d{2}-\d{2}$/.test(factPack?.asOf ?? ""), "facts.asOf must use YYYY-MM-DD");

const sources = Array.isArray(factPack?.sources) ? factPack.sources : [];
const claims = Array.isArray(factPack?.claims) ? factPack.claims : [];
requireValue(Array.isArray(factPack?.sources), "facts.sources must be an array");
requireValue(Array.isArray(factPack?.claims), "facts.claims must be an array");
const sourceIds = sources.map((source) => source?.id);
const claimIds = claims.map((claim) => claim?.id);
requireValue(sourceIds.every(nonEmpty), "every source needs an id");
requireValue(claimIds.every(nonEmpty), "every claim needs an id");
requireValue(unique(sourceIds), "source ids must be unique");
requireValue(unique(claimIds), "claim ids must be unique");
const sourceIdSet = new Set(sourceIds);
const claimById = new Map(claims.map((claim) => [claim.id, claim]));

for (const source of sources) {
  requireValue(nonEmpty(source.title), `source ${source.id ?? "<unknown>"} needs a title`);
  requireValue(nonEmpty(source.publisher), `source ${source.id ?? "<unknown>"} needs a publisher`);
  try {
    const url = new URL(source.url);
    requireValue(url.protocol === "https:" || url.protocol === "http:", `source ${source.id} URL must use HTTP(S)`);
  } catch {
    errors.push(`source ${source.id ?? "<unknown>"} has an invalid URL`);
  }
}

for (const claim of claims) {
  requireValue(nonEmpty(claim.text), `claim ${claim.id ?? "<unknown>"} needs text`);
  requireValue(claim.status === "draft" || claim.status === "verified", `claim ${claim.id ?? "<unknown>"} status must be draft or verified`);
  requireValue(Array.isArray(claim.sourceIds), `claim ${claim.id ?? "<unknown>"} sourceIds must be an array`);
  for (const sourceId of claim.sourceIds ?? []) requireValue(sourceIdSet.has(sourceId), `claim ${claim.id} references unknown source ${sourceId}`);
  if (claim.status === "verified") requireValue((claim.sourceIds ?? []).length > 0, `verified claim ${claim.id} needs a source`);
}

const render = manifest?.render ?? {};
requireValue(Number.isInteger(render.width) && render.width > 0, "render.width must be a positive integer");
requireValue(Number.isInteger(render.height) && render.height > 0, "render.height must be a positive integer");
requireValue(Number.isInteger(render.fps) && render.fps > 0, "render.fps must be a positive integer");
requireValue(Number.isFinite(render.durationSeconds) && render.durationSeconds > 0, "render.durationSeconds must be positive");
requireValue(["std", "pro"].includes(manifest?.performer?.mode), "performer.mode must be std or pro");
requireValue(manifest?.performer?.provider === "replicate", "performer.provider must be replicate");
requireValue(manifest?.performer?.model === "kwaivgi/kling-avatar-v2", "performer.model must be kwaivgi/kling-avatar-v2");
requireValue(nonEmpty(manifest?.performer?.canonicalPrompt), "performer.canonicalPrompt is required");
requireValue(manifest?.budget?.currency === "USD", "budget.currency must be USD");
requireValue(Number.isFinite(manifest?.budget?.maximum) && manifest.budget.maximum >= 0, "budget.maximum must be non-negative");
requireValue(Number.isInteger(manifest?.budget?.takesPerPerformanceShot) && manifest.budget.takesPerPerformanceShot > 0, "budget.takesPerPerformanceShot must be positive");

const assetPaths = [manifest?.audio?.master, manifest?.audio?.vocals, manifest?.performer?.referenceImage];
safeRelativePath(manifest?.audio?.master, "audio.master");
safeRelativePath(manifest?.audio?.vocals, "audio.vocals");
safeRelativePath(manifest?.performer?.referenceImage, "performer.referenceImage");

const shots = Array.isArray(manifest?.shots) ? manifest.shots : [];
requireValue(shots.length > 0, "shots must contain at least one shot");
requireValue(unique(shots.map((shot) => shot?.id)), "shot ids must be unique");
const tolerance = 1 / Math.max(render.fps ?? 1, 1) / 10;
let cursor = 0;
let generatedSeconds = 0;

for (const [index, shot] of shots.entries()) {
  const label = `shot ${shot?.id ?? index}`;
  requireValue(nonEmpty(shot?.id), `${label} needs an id`);
  requireValue(["performance", "map", "metric", "title"].includes(shot?.kind), `${label} has an unsupported kind`);
  requireValue(Number.isFinite(shot?.startSeconds) && Number.isFinite(shot?.endSeconds), `${label} needs numeric startSeconds and endSeconds`);
  requireValue(shot?.endSeconds > shot?.startSeconds, `${label} must have positive duration`);
  if (Number.isFinite(shot?.startSeconds)) requireValue(Math.abs(shot.startSeconds - cursor) <= tolerance, `${label} creates a gap or overlap at ${cursor}s`);
  cursor = shot?.endSeconds ?? cursor;
  requireValue(Array.isArray(shot?.factIds), `${label}.factIds must be an array`);
  requireValue(Array.isArray(shot?.assets), `${label}.assets must be an array`);
  requireValue(Array.isArray(shot?.onScreenText), `${label}.onScreenText must be an array`);
  for (const factId of shot?.factIds ?? []) {
    requireValue(claimById.has(factId), `${label} references unknown fact ${factId}`);
    const claim = claimById.get(factId);
    if (claim?.status === "draft") {
      const message = `${label} uses draft claim ${factId}`;
      if (options.publication) errors.push(message);
      else warnings.push(message);
    }
  }
  for (const asset of shot?.assets ?? []) {
    if (safeRelativePath(asset, `${label} asset`)) assetPaths.push(asset);
  }
  if (shot?.kind === "map" || shot?.kind === "metric") requireValue((shot.factIds ?? []).length > 0, `${label} must cite at least one fact`);
  if (shot?.kind === "performance") {
    generatedSeconds += shot.endSeconds - shot.startSeconds;
    requireValue(nonEmpty(shot.performanceDirection), `${label} needs performanceDirection`);
    requireValue(Number.isFinite(shot?.vocal?.startSeconds) && Number.isFinite(shot?.vocal?.endSeconds), `${label} needs a vocal interval`);
    requireValue(shot?.vocal?.endSeconds > shot?.vocal?.startSeconds, `${label} vocal interval must have positive duration`);
    const videoDuration = shot.endSeconds - shot.startSeconds;
    const vocalDuration = (shot?.vocal?.endSeconds ?? 0) - (shot?.vocal?.startSeconds ?? 0);
    requireValue(Math.abs(videoDuration - vocalDuration) <= tolerance, `${label} vocal and video durations must match`);
  }
}
requireValue(Math.abs(cursor - render.durationSeconds) <= tolerance, `timeline ends at ${cursor}s, expected ${render.durationSeconds}s`);

const pricePerSecond = manifest?.performer?.mode === "pro" ? 0.11 : 0.056;
const estimatedCost = generatedSeconds * (manifest?.budget?.takesPerPerformanceShot ?? 0) * pricePerSecond;
requireValue(estimatedCost <= (manifest?.budget?.maximum ?? -1) + 1e-9, `estimated performer cost $${estimatedCost.toFixed(2)} exceeds budget $${manifest?.budget?.maximum}`);

if (options.checkAssets) {
  const base = dirname(shotPath);
  for (const asset of [...new Set(assetPaths.filter(nonEmpty))]) {
    try {
      await access(resolve(base, asset));
    } catch {
      errors.push(`missing asset: ${asset}`);
    }
  }
}

for (const warning of warnings) console.error(`warning: ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    valid: true,
    shots: shots.length,
    durationSeconds: render.durationSeconds,
    performanceSeconds: generatedSeconds,
    takesPerPerformanceShot: manifest.budget.takesPerPerformanceShot,
    estimatedPerformerCostUsd: Number(estimatedCost.toFixed(4)),
    warnings: warnings.length,
  }, null, 2));
}
