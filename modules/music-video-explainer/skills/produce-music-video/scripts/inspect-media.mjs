#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const options = { interval: 1, thumbWidth: 320, maxTruePeak: -1, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") options.strict = true;
    else if (["--input", "--out", "--contact-sheet"].includes(arg)) options[arg.slice(2).replace("-", "")] = argv[++index];
    else if (["--interval", "--thumb-width", "--max-true-peak"].includes(arg)) options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.input) throw new Error("Usage: inspect-media.mjs --input <media> [--out <report.json>] [--contact-sheet <sheet.png>] [--interval <seconds>] [--thumb-width <pixels>] [--max-true-peak <dBTP>] [--strict]");
  if (!(options.interval > 0)) throw new Error("--interval must be positive");
  if (!Number.isInteger(options.thumbWidth) || options.thumbWidth < 64) throw new Error("--thumb-width must be an integer of at least 64");
  if (!Number.isFinite(options.maxTruePeak)) throw new Error("--max-true-peak must be numeric");
  return options;
}

function run(command, args, allowFailure = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new Error(`Cannot run ${command}: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0 || allowFailure) resolvePromise({ code, stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function numberMatch(value, pattern) {
  const match = value.match(pattern);
  return match ? Number(match[1]) : null;
}

const options = parseArgs(process.argv.slice(2));
const input = resolve(options.input);
const probeResult = await run("ffprobe", [
  "-v", "error",
  "-show_entries", "format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels",
  "-of", "json", input,
]);
const probe = JSON.parse(probeResult.stdout);
const video = probe.streams?.find((stream) => stream.codec_type === "video") ?? null;
const audio = probe.streams?.find((stream) => stream.codec_type === "audio") ?? null;
const durationSeconds = Number(probe.format?.duration);
const warnings = [];
const errors = [];

const decode = await run("ffmpeg", ["-v", "error", "-i", input, "-f", "null", "-"], true);
if (decode.code !== 0 || decode.stderr.trim()) errors.push(`decode: ${decode.stderr.trim() || `ffmpeg exited ${decode.code}`}`);

let audioAnalysis = null;
if (audio) {
  const analysis = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], true);
  const summary = analysis.stderr.slice(analysis.stderr.lastIndexOf("Summary:"));
  const integratedLufs = numberMatch(summary, /Integrated loudness:[\s\S]*?I:\s*(-?\d+(?:\.\d+)?)\s+LUFS/);
  const loudnessRangeLu = numberMatch(summary, /Loudness range:[\s\S]*?LRA:\s*(-?\d+(?:\.\d+)?)\s+LU/);
  const truePeakDbtp = numberMatch(summary, /True peak:[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?)\s+dBFS/);
  audioAnalysis = { integratedLufs, loudnessRangeLu, truePeakDbtp, maximumTruePeakDbtp: options.maxTruePeak };
  if (truePeakDbtp === null) warnings.push("audio true peak could not be measured");
  else if (truePeakDbtp > options.maxTruePeak) warnings.push(`audio true peak ${truePeakDbtp.toFixed(1)} dBTP exceeds ${options.maxTruePeak.toFixed(1)} dBTP`);
}

let contactSheet = null;
if (options.contactsheet) {
  if (!video) warnings.push("contact sheet requested but no video stream exists");
  else if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) warnings.push("contact sheet requested but duration is unavailable");
  else {
    contactSheet = resolve(options.contactsheet);
    await mkdir(dirname(contactSheet), { recursive: true });
    const frames = Math.max(1, Math.ceil(durationSeconds / options.interval));
    const columns = Math.min(4, frames);
    const rows = Math.ceil(frames / columns);
    const filter = `fps=1/${options.interval},scale=${options.thumbWidth}:-2:flags=lanczos,tile=${columns}x${rows}:padding=4:margin=4:color=black`;
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vf", filter, "-frames:v", "1", contactSheet]);
  }
}

const report = {
  schemaVersion: 1,
  input,
  generatedAt: new Date().toISOString(),
  format: {
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    sizeBytes: Number(probe.format?.size) || null,
    bitrate: Number(probe.format?.bit_rate) || null,
  },
  video,
  audio,
  audioAnalysis,
  contactSheet,
  decodeOk: errors.length === 0,
  warnings,
  errors,
  note: "Mechanical inspection does not replace a human watch and listen.",
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (options.out) {
  const output = resolve(options.out);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serialized, "utf8");
}
process.stdout.write(serialized);
if (errors.length > 0 || (options.strict && warnings.length > 0)) process.exitCode = 1;
