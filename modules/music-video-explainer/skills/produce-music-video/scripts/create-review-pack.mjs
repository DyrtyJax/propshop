#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

function parseArgs(argv) {
  const options = { candidates: [], stage: "review", spent: null, remaining: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--candidate") options.candidates.push(argv[++index]);
    else if (["--id", "--stage", "--question", "--recommend", "--reason", "--out-dir"].includes(arg)) options[arg.slice(2).replace("-", "")] = argv[++index];
    else if (arg === "--spent" || arg === "--remaining") options[arg.slice(2)] = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.id || !options.question || !options.outdir || options.candidates.length === 0) {
    throw new Error("Usage: create-review-pack.mjs --id <id> --question <question> --candidate <id=path> [--candidate <id=path> ...] --out-dir <dir> [--stage <stage>] [--recommend <id>] [--reason <text>] [--spent <usd>] [--remaining <usd>]");
  }
  return options;
}

function mediaKind(path) {
  const extension = extname(path).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extension)) return "image";
  if ([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"].includes(extension)) return "audio";
  if ([".mp4", ".mov", ".webm", ".mkv"].includes(extension)) return "video";
  return "file";
}

async function describeCandidate(spec, cwd) {
  const separator = spec.indexOf("=");
  if (separator < 1 || separator === spec.length - 1) throw new Error(`Candidate must use id=path: ${spec}`);
  const id = spec.slice(0, separator).trim();
  const path = resolve(spec.slice(separator + 1));
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Candidate id must use lowercase letters, numbers, and hyphens: ${id}`);
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`Candidate is not a file: ${path}`);
  return {
    id,
    kind: mediaKind(path),
    path: relative(cwd, path) || path,
    bytes: metadata.size,
    sha256: createHash("sha256").update(await readFile(path)).digest("hex"),
  };
}

const options = parseArgs(process.argv.slice(2));
const outDir = resolve(options.outdir);
const cwd = process.cwd();
const candidates = await Promise.all(options.candidates.map((candidate) => describeCandidate(candidate, cwd)));
if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) throw new Error("Candidate ids must be unique");
if (options.recommend && !candidates.some((candidate) => candidate.id === options.recommend)) throw new Error(`Recommended candidate does not exist: ${options.recommend}`);

const packet = {
  schemaVersion: 1,
  id: options.id,
  stage: options.stage,
  status: "pending-human",
  question: options.question,
  recommendation: options.recommend ? { candidateId: options.recommend, rationale: options.reason ?? null } : null,
  budget: {
    spentUsd: Number.isFinite(options.spent) ? options.spent : null,
    remainingUsd: Number.isFinite(options.remaining) ? options.remaining : null,
  },
  candidates,
  selection: null,
  humanNote: null,
  createdAt: new Date().toISOString(),
};

const money = (value) => value === null ? "not recorded" : `$${value.toFixed(2)}`;
const lines = [
  `# Review: ${options.id}`,
  "",
  `**Decision:** ${options.question}`,
  "",
  `**Stage:** ${options.stage}`,
  `**Status:** pending human selection`,
  `**Spend:** ${money(packet.budget.spentUsd)} · **Remaining:** ${money(packet.budget.remainingUsd)}`,
  "",
];

if (packet.recommendation) {
  lines.push(`## Recommendation`, "", `Choose **${packet.recommendation.candidateId}**.${packet.recommendation.rationale ? ` ${packet.recommendation.rationale}` : ""}`, "");
}

lines.push("## Candidates", "");
for (const candidate of candidates) {
  lines.push(`- **${candidate.id}** (${candidate.kind}, ${candidate.bytes} bytes): \`${candidate.path}\``, `  - SHA-256: \`${candidate.sha256}\``);
}
lines.push("", "## Respond", "", "Select a candidate ID, combine or redirect the options, reject all candidates, or explicitly delegate the choice back to the agent.", "", "After the decision, update `decision.json` without deleting candidates and resume from the approved branch.", "");

await mkdir(outDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outDir, "decision.json"), `${JSON.stringify(packet, null, 2)}\n`, "utf8"),
  writeFile(resolve(outDir, "REVIEW.md"), `${lines.join("\n")}\n`, "utf8"),
]);

console.log(JSON.stringify({ outDir, decision: resolve(outDir, "decision.json"), review: resolve(outDir, "REVIEW.md"), candidates: candidates.length }, null, 2));
