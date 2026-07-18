import {spawn} from 'node:child_process';
import {access, copyFile, mkdir, readFile, rename, rm} from 'node:fs/promises';
import {extname, resolve} from 'node:path';

import type {FactPack, GeoJson, Manifest} from './types.js';

interface Options {
  shots?: string;
  facts?: string;
  geojson?: string;
  clips?: string;
  master?: string;
  outdir?: string;
  outfile?: string;
  smoke?: boolean;
}

function parseArgs(argv: string[]) {
  const options: Options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--smoke') options.smoke = true;
    else if (['--shots', '--facts', '--geojson', '--clips', '--master', '--out-dir', '--out-file'].includes(arg)) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()) as keyof Options;
      (options as Record<string, unknown>)[key] = argv[++index];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.shots || !options.facts) throw new Error('Usage: render.js --shots <shots.json> --facts <facts.json> [--geojson <file>] [--clips <json>] [--master <audio>] [--out-dir <dir>] [--out-file <mp4>] [--smoke]');
  return options;
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {stdio: 'inherit'});
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T;
}

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser path.
    }
  }
  return undefined;
}

async function mediaBinary(name: 'ffmpeg' | 'ffprobe') {
  const environment = name === 'ffmpeg' ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  const candidates = [environment, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`]
    .filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next conventional location.
    }
  }
  return undefined;
}

function smokeManifest(manifest: Manifest): Manifest {
  let cursor = 0;
  return {
    ...manifest,
    render: {...manifest.render, width: 640, height: 360, durationSeconds: manifest.shots.length * 0.5},
    shots: manifest.shots.map(shot => {
      const next = {...shot, startSeconds: cursor, endSeconds: cursor + 0.5};
      cursor += 0.5;
      return next;
    }),
  };
}

process.env.DISABLE_TELEMETRY = 'true';
const options = parseArgs(process.argv.slice(2));
const manifestInput = await json<Manifest>(options.shots!);
const manifest = options.smoke ? smokeManifest(manifestInput) : manifestInput;
const facts = await json<FactPack>(options.facts!);
const geojson = options.geojson ? await json<GeoJson>(options.geojson) : {};
const clipsInput = options.clips ? await json<Record<string, string>>(options.clips) : {};
const outDir = resolve(options.outdir ?? './out');
const outFile = options.outfile ?? 'propshop-proof.mp4';
await mkdir(outDir, {recursive: true});
const runtimeDir = resolve('public/.propshop-runtime');
await rm(runtimeDir, {recursive: true, force: true});
await mkdir(runtimeDir, {recursive: true});
const [browserExecutable, ffmpegPath, ffprobePath] = await Promise.all([
  chromePath(), mediaBinary('ffmpeg'), mediaBinary('ffprobe'),
]);
if (!ffmpegPath || !ffprobePath) throw new Error('ffmpeg and ffprobe are required; set FFMPEG_PATH and FFPROBE_PATH if they are not in a conventional location');
const masterExtension = options.master ? extname(options.master) || '.wav' : '.wav';
const masterPath = resolve(runtimeDir, `master${masterExtension}`);
if (options.master) {
  await copyFile(resolve(options.master), masterPath);
} else {
  await run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(manifest.render.durationSeconds),
    '-c:a', 'pcm_s16le', masterPath,
  ]);
}
const masterAudio = `.propshop-runtime/master${masterExtension}`;
const performanceClips: Record<string, string> = {};
for (const [id, source] of Object.entries(clipsInput)) {
  if (/^https?:/.test(source)) {
    performanceClips[id] = source;
    continue;
  }
  const extension = extname(source) || '.mp4';
  const filename = `${id.replace(/[^a-z0-9-]/gi, '-')}${extension}`;
  await copyFile(resolve(source), resolve(runtimeDir, filename));
  performanceClips[id] = `.propshop-runtime/${filename}`;
}

const {renderVideo} = await import('@revideo/renderer');
const rendered = await renderVideo({
  projectFile: resolve('src/project.ts'),
  variables: {manifest, facts, geojson, performanceClips, masterAudio},
  settings: {
    outDir,
    outFile: outFile as `${string}.mp4`,
    workers: 1,
    logProgress: !options.smoke,
    ffmpeg: {ffmpegPath, ffprobePath, ffmpegLogLevel: 'error'},
    puppeteer: {
      ...(browserExecutable ? {executablePath: browserExecutable} : {}),
      args: ['--disable-dev-shm-usage'],
    },
    projectSettings: {
      size: {x: manifest.render.width, y: manifest.render.height},
      exporter: {name: '@revideo/core/wasm'},
    },
  },
});

const destination = resolve(outDir, outFile);
if (resolve(rendered) !== destination) {
  await rename(rendered, destination);
}
await rm(runtimeDir, {recursive: true, force: true});
console.log(destination);
