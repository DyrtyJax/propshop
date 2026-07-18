import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { canonicalJson, sha256 } from "../../lib/files.js";
import { findExecutable } from "../../lib/process.js";
import type { GenerateContext, GeneratedOutput, JsonValue } from "../../types.js";
import type { AudioCppModel, AudioCppOptions } from "./config.js";
import { modelProvenance, resolveModelPath } from "./config.js";
import { normalizeAudioRequest, requestCliArgs } from "./request.js";

const execFileAsync = promisify(execFile);

export async function checkCli(options: AudioCppOptions): Promise<string> {
  const executable = await findExecutable(options.executable);
  await execFileAsync(executable, ["--list-loaders"], {
    timeout: Math.min(options.timeoutMs, 15_000),
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return executable;
}

function optionArgs(flag: string, values: Record<string, string | number | boolean>): string[] {
  return Object.entries(values).flatMap(([key, value]) => [flag, `${key}=${value}`]);
}

export async function generateWithCli(
  context: GenerateContext,
  options: AudioCppOptions,
  id: string,
  model: AudioCppModel,
): Promise<GeneratedOutput[]> {
  const executable = await findExecutable(options.executable);
  const executableBytes = await readFile(executable);
  const modelPath = resolveModelPath(context.projectRoot, model);
  let modelStats;
  try {
    modelStats = await stat(modelPath);
  } catch {
    throw new Error(`audio.cpp model '${id}' path is not readable: ${modelPath}`);
  }
  if (!modelStats.isDirectory() && !modelStats.isFile()) {
    throw new Error(`audio.cpp model '${id}' path is not a file or directory: ${modelPath}`);
  }
  const { request, seed } = normalizeAudioRequest(context, id);
  if (typeof request.audio === "string" && !isAbsolute(request.audio)) {
    request.audio = resolve(context.projectRoot, request.audio);
  }
  const temporary = await mkdtemp(join(tmpdir(), "propshop-audiocpp-"));
  const outputPath = join(temporary, "output.wav");
  const args = [
    "--task",
    model.task,
    "--family",
    model.family,
    "--model",
    modelPath,
    "--backend",
    options.backend,
    "--device",
    String(options.device),
    "--threads",
    String(options.threads),
    ...optionArgs("--load-option", model.loadOptions),
    ...optionArgs("--session-option", model.sessionOptions),
    ...requestCliArgs(request),
    "--out",
    outputPath,
  ];

  try {
    const result = await execFileAsync(executable, args, {
      cwd: context.projectRoot,
      timeout: options.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    const bytes = await readFile(outputPath);
    if (bytes.byteLength > options.maxOutputBytes) {
      throw new Error(`audio.cpp output exceeded ${options.maxOutputBytes} bytes`);
    }
    return [
      {
        bytes,
        extension: "wav",
        mediaType: "audio/wav",
        providerMetadata: {
          runtime: "audio.cpp",
          transport: "cli",
          adapterProtocol: 1,
          executable: {
            name: options.executable,
            sha256: sha256(executableBytes),
          },
          backend: options.backend,
          device: options.device,
          threads: options.threads,
          seed,
          request,
          requestSha256: sha256(canonicalJson(request)),
          model: modelProvenance(id, model),
          ...(result.stderr.trim() ? { logTail: result.stderr.trim().slice(-2_000) } : {}),
        } as Record<string, JsonValue>,
      },
    ];
  } catch (error) {
    const detail = error as Error & { stderr?: string };
    const stderr = detail.stderr?.trim().slice(-2_000);
    throw new Error(`audio.cpp CLI failed: ${detail.message}${stderr ? `\n${stderr}` : ""}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
