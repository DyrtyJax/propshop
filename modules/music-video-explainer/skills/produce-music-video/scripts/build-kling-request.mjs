#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--shots", "--shot", "--image", "--audio", "--out"].includes(arg)) options[arg.slice(2)] = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.shots || !options.shot || !options.image || !options.audio) {
    throw new Error("Usage: build-kling-request.mjs --shots <shots.json> --shot <id> --image <reference> --audio <clip> [--out <plan.json>]");
  }
  return options;
}

async function describeFile(path, allowedExtensions, maximumBytes, label) {
  const absolutePath = resolve(path);
  const extension = extname(path).toLowerCase();
  if (!allowedExtensions.includes(extension)) throw new Error(`${label} extension ${extension || "<none>"} is unsupported`);
  const metadata = await stat(absolutePath);
  if (!metadata.isFile()) throw new Error(`${label} is not a file: ${path}`);
  if (metadata.size > maximumBytes) throw new Error(`${label} is ${(metadata.size / 1_000_000).toFixed(2)} MB; maximum is ${(maximumBytes / 1_000_000).toFixed(0)} MB`);
  return {
    filePath: absolutePath,
    sizeBytes: metadata.size,
    sha256: createHash("sha256").update(await readFile(absolutePath)).digest("hex"),
  };
}

const options = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(await readFile(resolve(options.shots), "utf8"));
const shot = (manifest.shots ?? []).find((candidate) => candidate.id === options.shot);
if (!shot) throw new Error(`Unknown shot: ${options.shot}`);
if (shot.kind !== "performance") throw new Error(`${options.shot} is ${shot.kind}, not a performance shot`);
const durationSeconds = Number(shot.endSeconds) - Number(shot.startSeconds);
if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error(`${options.shot} has invalid timing`);
const mode = manifest?.performer?.mode;
if (mode !== "std" && mode !== "pro") throw new Error("performer.mode must be std or pro");

const [image, audio] = await Promise.all([
  describeFile(options.image, [".jpg", ".jpeg", ".png"], 10_000_000, "image"),
  describeFile(options.audio, [".mp3", ".wav", ".m4a", ".aac"], 5_000_000, "audio"),
]);
const prompt = `${manifest.performer.canonicalPrompt.trim()} ${shot.performanceDirection.trim()}`;
const unitPrice = mode === "pro" ? 0.11 : 0.056;
const plan = {
  schemaVersion: 1,
  networkCall: false,
  provider: "replicate",
  model: "kwaivgi/kling-avatar-v2",
  shotId: shot.id,
  input: { mode, image, audio, prompt },
  estimate: {
    declaredUsdPerOutputSecond: unitPrice,
    outputSeconds: durationSeconds,
    takes: manifest?.budget?.takesPerPerformanceShot ?? 1,
    totalUsd: Number((durationSeconds * unitPrice * (manifest?.budget?.takesPerPerformanceShot ?? 1)).toFixed(4)),
  },
  executionNote: "Pass the image and audio file contents as Buffer values to replicate.run; this plan does not submit a prediction.",
};
const serialized = `${JSON.stringify(plan, null, 2)}\n`;
if (options.out) await writeFile(resolve(options.out), serialized, "utf8");
else process.stdout.write(serialized);
