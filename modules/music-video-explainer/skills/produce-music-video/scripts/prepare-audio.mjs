#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--master", "--vocals", "--shots", "--out-dir"].includes(arg)) options[arg.slice(2).replace("-", "")] = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.master || !options.vocals || !options.shots || !options.outdir) {
    throw new Error("Usage: prepare-audio.mjs --master <song> --vocals <stem> --shots <shots.json> --out-dir <directory>");
  }
  return options;
}

function run(command, args, capture = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.on("error", (error) => reject(new Error(`Cannot run ${command}: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${command} exited with ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

async function probe(path) {
  const output = await run("ffprobe", [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
    "-of", "json", path,
  ], true);
  const parsed = JSON.parse(output);
  if (!parsed.streams?.[0]) throw new Error(`No audio stream found in ${path}`);
  return {
    codec: parsed.streams[0].codec_name,
    sampleRate: Number(parsed.streams[0].sample_rate),
    channels: Number(parsed.streams[0].channels),
    durationSeconds: Number(parsed.format.duration),
  };
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function canonicalize(input, output, channels) {
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input,
    "-map", "0:a:0", "-vn", "-map_metadata", "-1",
    "-ar", "48000", "-ac", String(channels), "-c:a", "pcm_s24le",
    "-fflags", "+bitexact", "-flags:a", "+bitexact", output,
  ]);
}

const options = parseArgs(process.argv.slice(2));
const masterInput = resolve(options.master);
const vocalsInput = resolve(options.vocals);
const shotsPath = resolve(options.shots);
const outDir = resolve(options.outdir);
const shots = JSON.parse(await readFile(shotsPath, "utf8"));
const performanceShots = (shots.shots ?? []).filter((shot) => shot.kind === "performance" && shot.vocal);
if (performanceShots.length === 0) throw new Error("Shot manifest has no performance shots with vocal intervals");

const [masterInputProbe, vocalsInputProbe] = await Promise.all([probe(masterInput), probe(vocalsInput)]);
const expectedDuration = Number(shots?.render?.durationSeconds);
if (!Number.isFinite(expectedDuration)) throw new Error("Shot manifest has no numeric render.durationSeconds");
if (masterInputProbe.durationSeconds + 0.05 < expectedDuration) throw new Error(`Master is ${masterInputProbe.durationSeconds}s, shorter than the ${expectedDuration}s timeline`);
const finalVocalEnd = Math.max(...performanceShots.map((shot) => Number(shot?.vocal?.endSeconds)));
if (!Number.isFinite(finalVocalEnd) || vocalsInputProbe.durationSeconds + 0.05 < finalVocalEnd) throw new Error("Vocal stem is shorter than a requested performance interval");

await mkdir(outDir, { recursive: true });
const masterOutput = resolve(outDir, "master-48k-s24.wav");
const vocalsOutput = resolve(outDir, "vocals-48k-mono-s24.wav");
await canonicalize(masterInput, masterOutput, 2);
await canonicalize(vocalsInput, vocalsOutput, 1);

const clips = [];
for (const shot of performanceShots) {
  const start = Number(shot.vocal.startSeconds);
  const end = Number(shot.vocal.endSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error(`Invalid vocal interval for ${shot.id}`);
  const output = resolve(outDir, `${shot.id}.wav`);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", vocalsOutput,
    "-af", `atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`,
    "-map_metadata", "-1", "-c:a", "pcm_s24le",
    "-fflags", "+bitexact", "-flags:a", "+bitexact", output,
  ]);
  const metadata = await probe(output);
  clips.push({ shotId: shot.id, file: basename(output), sha256: await sha256(output), ...metadata });
}

const [master, vocals] = await Promise.all([probe(masterOutput), probe(vocalsOutput)]);
const audioManifest = {
  schemaVersion: 1,
  inputs: {
    master: { file: options.master, ...masterInputProbe },
    vocals: { file: options.vocals, ...vocalsInputProbe },
    shots: options.shots,
  },
  canonical: {
    master: { file: basename(masterOutput), sha256: await sha256(masterOutput), ...master },
    vocals: { file: basename(vocalsOutput), sha256: await sha256(vocalsOutput), ...vocals },
  },
  clips,
};
await writeFile(resolve(outDir, "audio-manifest.json"), `${JSON.stringify(audioManifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(audioManifest, null, 2));
