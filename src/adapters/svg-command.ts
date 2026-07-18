import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { canonicalJson, sha256 } from "../lib/files.js";
import type { Adapter, GenerateContext, GeneratedOutput, JsonValue, ProviderConfig } from "../types.js";
import { findExecutable } from "../lib/process.js";

const execFileAsync = promisify(execFile);

const licenseSchema = z.object({
  id: z.string().optional(),
  url: z.string().url().optional(),
  restrictions: z.array(z.string()).default([]),
});

const modelSchema = z.object({
  source: z.string().optional(),
  revision: z.string().optional(),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  license: licenseSchema.optional(),
  options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

const optionsSchema = z.object({
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
  timeoutMs: z.number().int().positive().max(3_600_000).default(600_000),
  maxOutputBytes: z.number().int().positive().default(8 * 1024 * 1024),
  passEnv: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).default([]),
  provenanceFiles: z.array(z.string().min(1)).default([]),
  defaultModel: z.string().optional(),
  models: z.record(z.string(), modelSchema).refine((models) => Object.keys(models).length > 0, "configure at least one model"),
});

type SvgCommandOptions = z.infer<typeof optionsSchema>;
type SvgCommandModel = z.infer<typeof modelSchema>;

interface DriverDescriptor {
  protocol: number;
  name: string;
  version: string;
  capabilities: string[];
}

function childEnvironment(options: SvgCommandOptions, providerEnv?: string): NodeJS.ProcessEnv {
  const names = new Set([
    "PATH",
    "PATHEXT",
    "SystemRoot",
    "WINDIR",
    "TMPDIR",
    "TMP",
    "TEMP",
    ...options.passEnv,
    ...(providerEnv ? [providerEnv] : []),
  ]);
  return Object.fromEntries([...names].flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]])) as NodeJS.ProcessEnv;
}

async function describeDriver(executable: string, options: SvgCommandOptions, providerEnv?: string, cwd?: string): Promise<DriverDescriptor> {
  const result = await execFileAsync(executable, [...options.args, "--propshop-describe"], {
    timeout: Math.min(options.timeoutMs, 15_000),
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    env: childEnvironment(options, providerEnv),
    ...(cwd ? { cwd } : {}),
  });
  let descriptor: DriverDescriptor;
  try {
    descriptor = JSON.parse(result.stdout) as DriverDescriptor;
  } catch {
    throw new Error("SVG command driver returned an invalid --propshop-describe response");
  }
  if (descriptor.protocol !== 1) throw new Error(`SVG command driver protocol ${descriptor.protocol} is not supported`);
  if (!descriptor.name || !descriptor.version || !Array.isArray(descriptor.capabilities)) throw new Error("SVG command driver descriptor is incomplete");
  if (!descriptor.capabilities.includes("vector.svg.generate")) throw new Error("SVG command driver does not support vector.svg.generate");
  return descriptor;
}

async function resolveExecutable(command: string, projectRoot?: string): Promise<string> {
  if (projectRoot && !isAbsolute(command) && (command.includes("/") || command.includes("\\"))) {
    return findExecutable(resolve(projectRoot, command));
  }
  return findExecutable(command);
}

async function runDriver(
  executable: string,
  args: string[],
  input: string,
  context: GenerateContext,
  options: SvgCommandOptions,
): Promise<{ stdout: string; stderr: string }> {
  const maximum = options.maxOutputBytes * 2 + 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: context.projectRoot,
      windowsHide: true,
      env: childEnvironment(options, context.provider.env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    };
    timer = setTimeout(() => fail(new Error(`SVG command driver timed out after ${options.timeoutMs}ms`)), options.timeoutMs);
    child.on("error", fail);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maximum) return fail(new Error(`SVG command response exceeded ${maximum} bytes`));
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes <= 1024 * 1024) stderr.push(chunk);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const stderrText = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) return reject(new Error(`SVG command driver exited with ${code ?? signal ?? "unknown"}${stderrText.trim() ? `: ${stderrText.trim().slice(-2_000)}` : ""}`));
      resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: stderrText });
    });
    child.stdin.on("error", fail);
    child.stdin.end(input);
  });
}

function modelProvenance(id: string, model: SvgCommandModel): Record<string, JsonValue> {
  return {
    id,
    ...(model.source ? { source: model.source } : {}),
    ...(model.revision ? { revision: model.revision } : {}),
    ...(model.sha256 ? { sha256: model.sha256.toLowerCase() } : {}),
    ...(model.license
      ? {
          license: {
            ...(model.license.id ? { id: model.license.id } : {}),
            ...(model.license.url ? { url: model.license.url } : {}),
            restrictions: model.license.restrictions,
          },
        }
      : {}),
  };
}

async function provenanceFiles(projectRoot: string, files: string[]): Promise<JsonValue[]> {
  return Promise.all(files.map(async (configuredPath) => {
    const path = isAbsolute(configuredPath) ? configuredPath : resolve(projectRoot, configuredPath);
    const bytes = await readFile(path);
    return { path: configuredPath, bytes: bytes.byteLength, sha256: sha256(bytes) };
  }));
}

function resolvedModel(context: GenerateContext, options: SvgCommandOptions): { id: string; model: SvgCommandModel } {
  const id = context.prop.model ?? options.defaultModel;
  if (!id) throw new Error(`Prop ${context.prop.id} must set model or its provider must set defaultModel`);
  const model = options.models[id];
  if (!model) throw new Error(`SVG command model '${id}' is not configured by provider ${context.providerName}`);
  return { id, model };
}

export class SvgCommandAdapter implements Adapter {
  readonly name = "svg-command";
  readonly version = "1.0.0";
  readonly capabilities = ["vector.svg.generate"] as const;

  async check(config: ProviderConfig, context?: { projectRoot: string }): Promise<{ ok: boolean; message: string }> {
    try {
      const options = optionsSchema.parse(config.options ?? {});
      const executable = await resolveExecutable(options.executable, context?.projectRoot);
      const descriptor = await describeDriver(executable, options, config.env, context?.projectRoot);
      return { ok: true, message: `ready (${descriptor.name}@${descriptor.version}; protocol ${descriptor.protocol})` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async generate(context: GenerateContext): Promise<GeneratedOutput[]> {
    const options = optionsSchema.parse(context.provider.options ?? {});
    const executable = await resolveExecutable(options.executable, context.projectRoot);
    const descriptor = await describeDriver(executable, options, context.provider.env, context.projectRoot);
    const executableBytes = await readFile(executable);
    const files = await provenanceFiles(context.projectRoot, options.provenanceFiles);
    const { id, model } = resolvedModel(context, options);
    const request: Record<string, JsonValue> = {
      protocol: 1,
      capability: context.capability,
      prompt: context.prop.prompt,
      variant: context.variant,
      model: { id, options: model.options },
      parameters: context.parameters,
      ...(context.style ? { style: context.style as unknown as JsonValue } : {}),
    };
    const result = await runDriver(executable, options.args, canonicalJson(request), context, options);
    let body: {
      outputs?: Array<{ svg?: string; metadata?: Record<string, JsonValue> }>;
      metadata?: Record<string, JsonValue>;
    };
    try {
      body = JSON.parse(result.stdout) as typeof body;
    } catch {
      throw new Error("SVG command driver returned invalid JSON");
    }
    if (!body.outputs?.length) throw new Error("SVG command driver returned no outputs");
    return body.outputs.map((output, index) => {
      if (typeof output.svg !== "string" || output.svg.length === 0) throw new Error(`SVG command output ${index + 1} did not contain SVG markup`);
      const bytes = new TextEncoder().encode(output.svg);
      if (bytes.byteLength > options.maxOutputBytes) throw new Error(`SVG command output exceeded ${options.maxOutputBytes} bytes`);
      return {
        bytes,
        extension: "svg",
        mediaType: "image/svg+xml",
        providerMetadata: {
          runtime: "svg-command",
          adapterProtocol: 1,
          driver: { name: descriptor.name, version: descriptor.version },
          executable: { name: options.executable, sha256: sha256(executableBytes) },
          ...(files.length > 0 ? { provenanceFiles: files } : {}),
          argsSha256: sha256(canonicalJson(options.args)),
          requestSha256: sha256(canonicalJson(request)),
          model: modelProvenance(id, model),
          ...(body.metadata ? { driverMetadata: body.metadata } : {}),
          ...(output.metadata ? { outputMetadata: output.metadata } : {}),
          ...(result.stderr.trim() ? { logTail: result.stderr.trim().slice(-2_000) } : {}),
          outputIndex: index,
        },
      };
    });
  }
}
