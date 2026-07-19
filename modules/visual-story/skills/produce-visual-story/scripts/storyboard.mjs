#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

function parseArgs(argv) {
  const args = { checkAssets: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--input") args.input = argv[++index];
    else if (value === "--out") args.out = argv[++index];
    else if (value === "--check-assets") args.checkAssets = true;
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  return `Usage: node storyboard.mjs --input story.json [--out board.html] [--check-assets]\n`;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function collectIds(items, path, errors) {
  const ids = new Set();
  if (!Array.isArray(items)) {
    errors.push(`${path} must be an array`);
    return ids;
  }
  for (const [index, item] of items.entries()) {
    if (!isRecord(item) || !hasText(item.id)) {
      errors.push(`${path}[${index}].id must be a non-empty string`);
      continue;
    }
    if (!ID_PATTERN.test(item.id)) errors.push(`${path}[${index}].id '${item.id}' is not a portable lowercase ID`);
    if (ids.has(item.id)) errors.push(`${path} contains duplicate id '${item.id}'`);
    ids.add(item.id);
  }
  return ids;
}

function validateStory(story) {
  const errors = [];
  const warnings = [];
  if (!isRecord(story)) return { errors: ["Story must be a JSON object"], warnings };
  const topLevelKeys = new Set(["schemaVersion", "project", "title", "thesis", "audience", "budget", "outputs", "style", "sources", "facts", "assets", "beats", "decisions", "extensions"]);
  for (const key of Object.keys(story)) {
    if (!topLevelKeys.has(key)) errors.push(`Unknown top-level property '${key}'; use extensions for namespaced data`);
  }
  if (story.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!hasText(story.project)) errors.push("project must be a non-empty string");
  if (!hasText(story.title)) errors.push("title must be a non-empty string");
  if (story.budget !== undefined) {
    if (!isRecord(story.budget) || !/^[A-Z]{3}$/.test(story.budget.currency ?? "")) errors.push("budget.currency must be a three-letter uppercase currency code");
    if (!Number.isFinite(story.budget?.maxExternalSpend) || story.budget.maxExternalSpend < 0) errors.push("budget.maxExternalSpend must be non-negative");
    if (story.budget?.spent !== undefined && (!Number.isFinite(story.budget.spent) || story.budget.spent < 0)) errors.push("budget.spent must be non-negative");
    if (story.budget?.spent > story.budget?.maxExternalSpend) errors.push("budget.spent exceeds maxExternalSpend");
  }

  const outputIds = collectIds(story.outputs, "outputs", errors);
  if (outputIds.size === 0) errors.push("outputs must contain at least one destination");
  const validOutputKinds = new Set(["video", "slides", "scroll", "interactive", "other"]);
  for (const [index, output] of (story.outputs ?? []).entries()) {
    if (!isRecord(output) || !validOutputKinds.has(output.kind)) {
      errors.push(`outputs[${index}].kind must be video, slides, scroll, interactive, or other`);
    }
    for (const field of ["width", "height", "fps", "durationSeconds"]) {
      const minimum = field === "durationSeconds" ? 0 : Number.EPSILON;
      if (output?.[field] !== undefined && (!Number.isFinite(output[field]) || output[field] < minimum)) {
        errors.push(`outputs[${index}].${field} must be ${minimum === 0 ? "non-negative" : "positive"}`);
      }
    }
  }

  const sourceIds = collectIds(story.sources ?? [], "sources", errors);
  const factIds = collectIds(story.facts ?? [], "facts", errors);
  const assetIds = collectIds(story.assets ?? [], "assets", errors);
  collectIds(story.decisions ?? [], "decisions", errors);
  const beatIds = collectIds(story.beats, "beats", errors);
  if (beatIds.size === 0) errors.push("beats must contain at least one beat");

  for (const [index, source] of (story.sources ?? []).entries()) {
    if (!isRecord(source) || !hasText(source.title)) errors.push(`sources[${index}].title must be non-empty`);
  }

  for (const [index, fact] of (story.facts ?? []).entries()) {
    if (!isRecord(fact)) continue;
    if (!hasText(fact.text)) errors.push(`facts[${index}].text must be non-empty`);
    if (!new Set(["draft", "verified"]).has(fact.status)) errors.push(`facts[${index}].status must be draft or verified`);
    if (fact.status === "draft") warnings.push(`Fact '${fact.id}' is still draft`);
    for (const sourceId of fact.sourceIds ?? []) {
      if (!sourceIds.has(sourceId)) errors.push(`Fact '${fact.id}' references unknown source '${sourceId}'`);
    }
    if (fact.status === "verified" && (fact.sourceIds ?? []).length === 0) {
      warnings.push(`Verified fact '${fact.id}' has no sourceIds`);
    }
  }

  for (const asset of story.assets ?? []) {
    if (!isRecord(asset)) continue;
    if (!hasText(asset.path)) errors.push(`Asset '${asset.id ?? "unknown"}' has no path`);
    if (asset.sourceId && !sourceIds.has(asset.sourceId)) {
      errors.push(`Asset '${asset.id}' references unknown source '${asset.sourceId}'`);
    }
    if (!hasText(asset.rights)) warnings.push(`Asset '${asset.id}' has no rights note`);
  }

  const decisionStatuses = new Set(["pending-human", "human-selected", "agent-selected"]);
  for (const [index, decision] of (story.decisions ?? []).entries()) {
    if (!isRecord(decision) || !hasText(decision.question)) errors.push(`decisions[${index}].question must be non-empty`);
    if (!decisionStatuses.has(decision?.status)) errors.push(`decisions[${index}].status is invalid`);
  }

  const elementIds = new Set();
  for (const [beatIndex, beat] of (story.beats ?? []).entries()) {
    if (!isRecord(beat)) continue;
    if (!hasText(beat.purpose)) errors.push(`beats[${beatIndex}].purpose must be non-empty`);
    if (!Array.isArray(beat.elements)) {
      errors.push(`beats[${beatIndex}].elements must be an array`);
      continue;
    }
    for (const factId of beat.factIds ?? []) {
      if (!factIds.has(factId)) errors.push(`Beat '${beat.id}' references unknown fact '${factId}'`);
    }
    for (const [elementIndex, element] of beat.elements.entries()) {
      const path = `beats[${beatIndex}].elements[${elementIndex}]`;
      if (!isRecord(element) || !hasText(element.id) || !hasText(element.type)) {
        errors.push(`${path} must have string id and type`);
        continue;
      }
      if (!ID_PATTERN.test(element.id)) errors.push(`${path}.id '${element.id}' is not a portable lowercase ID`);
      if (!TYPE_PATTERN.test(element.type)) errors.push(`${path}.type '${element.type}' is not an extensible lowercase type`);
      if (elementIds.has(element.id)) errors.push(`Element id '${element.id}' is duplicated`);
      elementIds.add(element.id);
      for (const factId of element.factIds ?? []) {
        if (!factIds.has(factId)) errors.push(`Element '${element.id}' references unknown fact '${factId}'`);
      }
      for (const sourceId of element.sourceIds ?? []) {
        if (!sourceIds.has(sourceId)) errors.push(`Element '${element.id}' references unknown source '${sourceId}'`);
      }
      if (element.assetId && !assetIds.has(element.assetId)) {
        errors.push(`Element '${element.id}' references unknown asset '${element.assetId}'`);
      }
      if (["image", "video", "embed.generated-video", "embed.three-scene"].includes(element.type) && !hasText(element.alt)) {
        warnings.push(`Visual element '${element.id}' has no alt description`);
      }
      for (const [motionIndex, motion] of (element.motion ?? []).entries()) {
        if (!isRecord(motion) || !TYPE_PATTERN.test(motion.preset ?? "")) errors.push(`${path}.motion[${motionIndex}].preset is invalid`);
        if (!new Set(["enter", "exit", "emphasis", "scroll", "click", "time", "other"]).has(motion?.trigger)) {
          errors.push(`${path}.motion[${motionIndex}].trigger is invalid`);
        }
      }
    }
  }

  const pending = (story.decisions ?? []).filter((decision) => decision?.status === "pending-human").length;
  if (pending > 0) warnings.push(`${pending} decision${pending === 1 ? " is" : "s are"} pending human direction`);
  return { errors, warnings };
}

async function checkAssets(story, inputPath) {
  const errors = [];
  for (const asset of story.assets ?? []) {
    if (!hasText(asset.path) || /^[a-z]+:\/\//i.test(asset.path)) continue;
    const path = isAbsolute(asset.path) ? asset.path : resolve(dirname(inputPath), asset.path);
    try {
      await access(path);
    } catch {
      errors.push(`Asset '${asset.id}' does not exist at ${path}`);
    }
  }
  return errors;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeColor(value, fallback) {
  return typeof value === "string" && /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([0-9,. %]+\)|hsla?\([0-9,. %]+\))$/i.test(value)
    ? value
    : fallback;
}

function paletteFor(story) {
  const palette = Array.isArray(story.style?.palette) ? story.style.palette : [];
  return {
    ink: safeColor(palette[0], "#17222b"),
    paper: safeColor(palette[1], "#f5f0e8"),
    accent: safeColor(palette[2], "#e65335"),
    support: safeColor(palette[3], "#2c7580"),
  };
}

function projectCoordinate(coordinate, width = 960, height = 540) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return undefined;
  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined;
  return [((longitude + 180) / 360) * width, ((90 - latitude) / 180) * height];
}

function wrapText(text, max = 28, lines = 4) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const result = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      result.push(line);
      line = word;
      if (result.length === lines) break;
    } else line = next;
  }
  if (result.length < lines && line) result.push(line);
  if (result.length === lines && words.join(" ").length > result.join(" ").length) {
    result[lines - 1] = `${result[lines - 1].replace(/[.…]+$/, "")}…`;
  }
  return result;
}

function svgText(lines, x, y, options = {}) {
  const size = options.size ?? 32;
  const fill = options.fill ?? "#17222b";
  const weight = options.weight ?? 600;
  const anchor = options.anchor ?? "start";
  return `<text x="${x}" y="${y}" fill="${escapeHtml(fill)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * 1.15}">${escapeHtml(line)}</tspan>`)
    .join("")}</text>`;
}

function renderRoute(element, palette) {
  const coordinates = element.data?.coordinates ?? element.data;
  if (!Array.isArray(coordinates)) return "";
  const points = coordinates.map((coordinate) => projectCoordinate(coordinate)).filter(Boolean);
  if (points.length < 2) return "";
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const dots = points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${palette.paper}" stroke="${palette.accent}" stroke-width="4"/>`).join("");
  return `<path d="${path}" fill="none" stroke="${palette.accent}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
}

function renderRegion(element, palette) {
  const geometry = element.data?.geometry ?? element.data;
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.flatMap((polygon) => polygon.slice(0, 1)).map((ring) => {
    const points = ring.map((coordinate) => projectCoordinate(coordinate)).filter(Boolean);
    return points.length > 2 ? `<polygon points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="${palette.support}" fill-opacity=".34" stroke="${palette.support}" stroke-width="3"/>` : "";
  }).join("");
}

function renderMarker(element, palette) {
  const point = projectCoordinate(element.data?.coordinate ?? element.data);
  if (!point) return "";
  const [x, y] = point;
  const label = element.text ?? element.data?.label;
  return `<circle cx="${x}" cy="${y}" r="10" fill="${palette.accent}" stroke="${palette.paper}" stroke-width="4"/>${label ? svgText([label], x + 16, y - 15, { size: 20, fill: palette.ink }) : ""}`;
}

function renderBarChart(element, palette) {
  const values = Array.isArray(element.data) ? element.data : element.data?.values;
  if (!Array.isArray(values) || values.length === 0) return "";
  const maximum = Math.max(...values.map((item) => Number(item.value) || 0), 1);
  const width = Math.min(660 / values.length, 110);
  return values.slice(0, 8).map((item, index) => {
    const height = ((Number(item.value) || 0) / maximum) * 260;
    const x = 145 + index * (width + 12);
    const y = 420 - height;
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${index % 2 ? palette.support : palette.accent}"/>${svgText([String(item.label ?? "")], x + width / 2, 455, { size: 17, fill: palette.ink, anchor: "middle" })}`;
  }).join("");
}

function chartValues(element) {
  const values = Array.isArray(element.data) ? element.data : element.data?.values;
  return Array.isArray(values) ? values.slice(0, 12).map((item, index) => ({
    label: String(item?.label ?? index + 1),
    value: Number(item?.value) || 0,
  })) : [];
}

function renderPointChart(element, palette) {
  const values = chartValues(element);
  if (values.length === 0) return "";
  const maximum = Math.max(...values.map((item) => item.value), 1);
  const minimum = Math.min(...values.map((item) => item.value), 0);
  const span = maximum - minimum || 1;
  const points = values.map((item, index) => ({
    ...item,
    x: 130 + (values.length === 1 ? 330 : index * (660 / (values.length - 1))),
    y: 420 - ((item.value - minimum) / span) * 270,
  }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L${points.at(-1).x.toFixed(1)} 420 L${points[0].x.toFixed(1)} 420 Z`;
  const axes = `<path d="M105 120 V430 H840" fill="none" stroke="${palette.ink}" stroke-opacity=".25" stroke-width="3"/>`;
  const labels = points.map((point) => svgText([point.label], point.x, 458, { size: 16, fill: palette.ink, anchor: "middle" })).join("");
  const marks = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="7" fill="${palette.paper}" stroke="${palette.accent}" stroke-width="4"/>`).join("");
  if (element.type === "chart.scatter") return `${axes}${labels}${marks}`;
  return `${axes}${element.type === "chart.area" ? `<path d="${area}" fill="${palette.support}" fill-opacity=".22"/>` : ""}<path d="${line}" fill="none" stroke="${palette.accent}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>${marks}${labels}`;
}

function renderStage(beat, story, palette) {
  const mapElements = beat.elements.filter((element) => element.type.startsWith("map."));
  const chart = beat.elements.find((element) => ["chart.bar", "chart.line", "chart.area", "chart.scatter"].includes(element.type));
  const headline = beat.elements.find((element) => ["text", "stat"].includes(element.type));
  const unknown = beat.elements.filter((element) => !["text", "stat", "chart.bar", "chart.line", "chart.area", "chart.scatter", "map.route", "map.region", "map.marker", "map.label", "map.camera"].includes(element.type));
  const map = mapElements.length > 0
    ? `<g opacity=".18"><path d="M40 140 Q180 70 330 130 T620 125 T930 175 M70 350 Q250 285 415 335 T760 320 T930 365" fill="none" stroke="${palette.ink}" stroke-width="2" stroke-dasharray="7 12"/></g>${mapElements.map((element) => element.type === "map.route" ? renderRoute(element, palette) : element.type === "map.region" ? renderRegion(element, palette) : element.type === "map.marker" || element.type === "map.label" ? renderMarker(element, palette) : "").join("")}`
    : "";
  const chartMarkup = chart ? chart.type === "chart.bar" ? renderBarChart(chart, palette) : renderPointChart(chart, palette) : "";
  const headlineMarkup = headline ? svgText(wrapText(headline.text ?? headline.data?.value ?? headline.id, mapElements.length || chart ? 22 : 34, 4), mapElements.length || chart ? 55 : 80, mapElements.length || chart ? 80 : 170, { size: headline.type === "stat" ? 54 : 44, fill: palette.ink, weight: 750 }) : "";
  const unknownMarkup = unknown.slice(0, 3).map((element, index) => `<g transform="translate(${80 + index * 275} 330)"><rect width="240" height="105" rx="18" fill="${palette.paper}" stroke="${palette.ink}" stroke-opacity=".18"/><text x="20" y="42" fill="${palette.ink}" font-size="19" font-weight="700">${escapeHtml(element.type)}</text><text x="20" y="72" fill="${palette.ink}" font-size="15" opacity=".7">${escapeHtml(element.id)}</text></g>`).join("");
  return `<svg viewBox="0 0 960 540" role="img" aria-label="Editorial preview for ${escapeHtml(beat.id)}"><rect width="960" height="540" fill="${palette.paper}"/><circle cx="860" cy="75" r="145" fill="${palette.accent}" opacity=".1"/>${map}${chartMarkup}${headlineMarkup}${unknownMarkup}<text x="920" y="505" text-anchor="end" fill="${palette.ink}" font-size="16" opacity=".5">STRUCTURAL PREVIEW · ${escapeHtml(story.project)}</text></svg>`;
}

function renderBoard(story, report) {
  const palette = paletteFor(story);
  const outputs = story.outputs.map((output) => `<span class="badge">${escapeHtml(output.id)} · ${escapeHtml(output.kind)}${output.renderer ? ` · ${escapeHtml(output.renderer)}` : ""}</span>`).join("");
  const budget = story.budget ? `<span class="badge">${escapeHtml(story.budget.currency)} ${escapeHtml(story.budget.spent ?? 0)} / ${escapeHtml(story.budget.maxExternalSpend)} external spend</span>` : "";
  const beats = story.beats.map((beat, index) => `<article class="beat" id="${escapeHtml(beat.id)}"><div class="stage">${renderStage(beat, story, palette)}</div><div class="copy"><div class="eyebrow">Beat ${index + 1} · ${escapeHtml(beat.id)}</div><h2>${escapeHtml(beat.purpose)}</h2>${beat.narration ? `<p>${escapeHtml(beat.narration)}</p>` : ""}<div class="meta">${beat.durationSeconds !== undefined ? `<span>${beat.durationSeconds}s</span>` : ""}${beat.slideCount !== undefined ? `<span>${beat.slideCount} slide${beat.slideCount === 1 ? "" : "s"}</span>` : ""}${beat.scrollScreens !== undefined ? `<span>${beat.scrollScreens} screens</span>` : ""}</div><ul>${beat.elements.map((element) => `<li><code>${escapeHtml(element.type)}</code> ${escapeHtml(element.id)}</li>`).join("")}</ul></div></article>`).join("");
  const facts = (story.facts ?? []).map((fact) => `<li><span class="status ${fact.status}">${escapeHtml(fact.status)}</span><strong>${escapeHtml(fact.display ?? fact.text)}</strong><small>${escapeHtml((fact.sourceIds ?? []).join(", ") || "No source linked")}</small></li>`).join("");
  const decisions = (story.decisions ?? []).map((decision) => `<li><span class="status ${decision.status}">${escapeHtml(decision.status)}</span><strong>${escapeHtml(decision.question)}</strong>${decision.rationale ? `<small>${escapeHtml(decision.rationale)}</small>` : ""}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%23e65335'/%3E%3C/svg%3E"><title>${escapeHtml(story.title)} · editorial board</title><style>:root{--ink:${palette.ink};--paper:${palette.paper};--accent:${palette.accent};--support:${palette.support}}*{box-sizing:border-box}body{margin:0;background:#ded9d1;color:var(--ink);font:16px/1.45 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}header{padding:clamp(2rem,6vw,6rem);background:var(--ink);color:var(--paper)}.eyebrow{text-transform:uppercase;letter-spacing:.13em;font-size:.72rem;font-weight:800;opacity:.68}h1{max-width:13ch;margin:.25rem 0;font-size:clamp(3rem,8vw,7.5rem);line-height:.88;letter-spacing:-.055em}header p{max-width:66ch;font-size:1.15rem}.badges,.meta{display:flex;flex-wrap:wrap;gap:.5rem}.badge,.meta span{border:1px solid currentColor;border-radius:999px;padding:.35rem .65rem;font-size:.75rem}.board{padding:clamp(1rem,3vw,3rem);display:grid;gap:2rem}.beat{overflow:hidden;background:white;border-radius:22px;box-shadow:0 20px 55px #17222b18;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(260px,.7fr)}.stage svg{display:block;width:100%;height:100%;min-height:330px}.copy{padding:clamp(1.5rem,3vw,3rem)}h2{font-size:clamp(1.7rem,3vw,3.1rem);line-height:1;margin:.35rem 0 1rem;letter-spacing:-.035em}.copy p{font-size:1rem}.copy ul{padding:0;list-style:none}.copy li{border-top:1px solid #17222b1c;padding:.45rem 0;font-size:.8rem}.copy code{color:var(--support);font-weight:700}.ledger{display:grid;grid-template-columns:1fr 1fr;gap:2rem;padding:clamp(1rem,3vw,3rem)}.ledger section{background:var(--paper);padding:2rem;border-radius:22px}.ledger ul{list-style:none;padding:0}.ledger li{display:grid;grid-template-columns:auto 1fr;gap:.5rem 1rem;border-top:1px solid #17222b22;padding:.8rem 0}.ledger small{grid-column:2;opacity:.65}.status{align-self:start;border-radius:999px;padding:.2rem .45rem;font-size:.65rem;text-transform:uppercase;font-weight:800;background:#17222b16}.status.verified,.status.human-selected{background:#2c758033}.status.draft,.status.pending-human{background:#e6533533}footer{padding:3rem;text-align:center;font-size:.8rem;opacity:.65}@media(max-width:800px){.beat{grid-template-columns:1fr}.ledger{grid-template-columns:1fr}.stage svg{min-height:0}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head><body><header><div class="eyebrow">PropShop editorial board · portable visual story</div><h1>${escapeHtml(story.title)}</h1>${story.thesis ? `<p>${escapeHtml(story.thesis)}</p>` : ""}<div class="badges">${outputs}${budget}</div></header><main class="board">${beats}</main><aside class="ledger"><section><div class="eyebrow">Fact ledger</div><h2>Claims</h2><ul>${facts || "<li>No facts recorded</li>"}</ul></section><section><div class="eyebrow">Decision ledger</div><h2>Direction</h2><ul>${decisions || "<li>No decisions recorded</li>"}</ul></section></aside><footer>${report.warnings.length} validation warning${report.warnings.length === 1 ? "" : "s"} · This board previews structure, not final cartography or design.</footer></body></html>`;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.input) {
    process.stderr.write(`--input is required\n${usage()}`);
    process.exitCode = 2;
    return;
  }

  const inputPath = resolve(args.input);
  let story;
  try {
    story = JSON.parse(await readFile(inputPath, "utf8"));
  } catch (error) {
    process.stderr.write(`Could not read story: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const validation = validateStory(story);
  if (args.checkAssets) validation.errors.push(...await checkAssets(story, inputPath));
  const report = {
    valid: validation.errors.length === 0,
    schemaVersion: story?.schemaVersion,
    project: story?.project,
    budget: story?.budget,
    outputs: Array.isArray(story?.outputs) ? story.outputs.length : 0,
    beats: Array.isArray(story?.beats) ? story.beats.length : 0,
    elements: Array.isArray(story?.beats) ? story.beats.reduce((count, beat) => count + (Array.isArray(beat?.elements) ? beat.elements.length : 0), 0) : 0,
    errors: validation.errors,
    warnings: validation.warnings,
  };

  if (report.valid && args.out) {
    const outputPath = resolve(args.out);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, renderBoard(story, report), "utf8");
    report.board = outputPath;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

await main();
