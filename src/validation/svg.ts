import { SaxesParser } from "saxes";
import type { ArtifactCheck, JsonValue, SvgChecks } from "../types.js";

const HARD_MAX_SVG_BYTES = 16 * 1024 * 1024;
const FORBIDDEN_ELEMENTS = new Set([
  "script",
  "handler",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "canvas",
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
  "discard",
]);
const PAINT_ATTRIBUTES = new Set(["fill", "stroke", "color", "stop-color", "flood-color", "lighting-color"]);

export interface SvgInspection {
  container: "svg";
  bytes: number;
  rootElement: string;
  width?: string;
  height?: string;
  viewBox?: { minX: number; minY: number; width: number; height: number };
  aspectRatio?: number;
  elements: number;
  attributes: number;
  maxDepth: number;
  paths: number;
  pathCommands: number;
  groups: number;
  gradients: number;
  filters: number;
  textElements: number;
  rasterImages: number;
  transforms: number;
  definitions: number;
  colors: string[];
  ids: number;
  duplicateIds: string[];
  hasTitle: boolean;
  hasDescription: boolean;
  hasAccessibleName: boolean;
  externalReferences: number;
  eventHandlers: number;
  styleElements: number;
  unsafeFeatures: string[];
  elementCounts: Record<string, number>;
}

function viewBox(value: string | undefined): SvgInspection["viewBox"] {
  if (!value) return undefined;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;
  const [minX, minY, width, height] = parts;
  if (minX === undefined || minY === undefined || width === undefined || height === undefined || width <= 0 || height <= 0) return undefined;
  return { minX, minY, width, height };
}

function hrefKind(value: string): "fragment" | "embedded-raster" | "external" {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "").trim();
  if (normalized.startsWith("#")) return "fragment";
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);/i.test(normalized)) return "embedded-raster";
  return "external";
}

function paintValues(value: string): string[] {
  const values = new Set<string>();
  for (const match of value.matchAll(/#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)|\b(?:currentColor|transparent|black|white|red|green|blue|gray|grey)\b/g)) {
    const color = match[0]?.toLowerCase();
    if (color && color !== "none" && color !== "inherit" && color !== "currentcolor") values.add(color);
  }
  const direct = value.trim().toLowerCase();
  if (/^[a-z][a-z0-9-]*$/.test(direct) && !["none", "inherit", "currentcolor", "context-fill", "context-stroke"].includes(direct)) values.add(direct);
  for (const match of value.matchAll(/(?:^|[;{])\s*(?:fill|stroke|color|stop-color|flood-color|lighting-color)\s*:\s*([^;}]+)/gi)) {
    for (const color of paintValues(match[1] ?? "")) values.add(color);
  }
  return [...values];
}

function check(
  name: string,
  passed: boolean,
  actual: JsonValue,
  expected: JsonValue,
  message: string,
): ArtifactCheck {
  return { name, status: passed ? "passed" : "failed", actual, expected, message };
}

export function inspectSvg(bytes: Uint8Array): SvgInspection {
  if (bytes.byteLength === 0) throw new Error("SVG artifact is empty");
  if (bytes.byteLength > HARD_MAX_SVG_BYTES) throw new Error(`SVG artifact exceeds hard limit of ${HARD_MAX_SVG_BYTES} bytes`);
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parser = new SaxesParser({ xmlns: false, position: true });
  const elementCounts: Record<string, number> = {};
  const colors = new Set<string>();
  const ids = new Set<string>();
  const duplicateIds = new Set<string>();
  const unsafe = new Set<string>();
  const stack: string[] = [];
  let rootElement = "";
  let rootAttributes: Record<string, string> = {};
  let elements = 0;
  let attributes = 0;
  let maxDepth = 0;
  let paths = 0;
  let pathCommands = 0;
  let groups = 0;
  let gradients = 0;
  let filters = 0;
  let textElements = 0;
  let rasterImageElements = 0;
  let embeddedRasterReferences = 0;
  let transforms = 0;
  let definitions = 0;
  let externalReferences = 0;
  let eventHandlers = 0;
  let styleElements = 0;
  let hasTitle = false;
  let hasDescription = false;

  const inspectReference = (value: string): void => {
    const kind = hrefKind(value);
    if (kind === "external") externalReferences += 1;
    if (kind === "embedded-raster") embeddedRasterReferences += 1;
  };

  const inspectCss = (value: string): void => {
    if (/@import\b|expression\s*\(|javascript\s*:/i.test(value)) unsafe.add("active CSS");
    for (const match of value.matchAll(/url\(([^)]+)\)/gi)) {
      if (match[1]) inspectReference(match[1]);
    }
    for (const color of paintValues(value)) colors.add(color);
  };

  parser.on("doctype", () => unsafe.add("doctype"));
  parser.on("processinginstruction", (instruction) => {
    if (instruction.target.toLowerCase() !== "xml") unsafe.add(`processing instruction: ${instruction.target}`);
  });
  parser.on("opentag", (tag) => {
    const name = tag.name.toLowerCase();
    const tagAttributes = tag.attributes as Record<string, string>;
    stack.push(name);
    elements += 1;
    maxDepth = Math.max(maxDepth, stack.length);
    elementCounts[name] = (elementCounts[name] ?? 0) + 1;
    if (!rootElement) {
      rootElement = name;
      rootAttributes = { ...tagAttributes };
    }
    if (FORBIDDEN_ELEMENTS.has(name)) unsafe.add(`element <${name}>`);
    if (name === "path") {
      paths += 1;
      pathCommands += (tagAttributes.d?.match(/[AaCcHhLlMmQqSsTtVvZz]/g) ?? []).length;
    }
    if (name === "g") groups += 1;
    if (name === "lineargradient" || name === "radialgradient") gradients += 1;
    if (name === "filter") filters += 1;
    if (name === "text" || name === "tspan" || name === "textpath") textElements += 1;
    if (name === "image") rasterImageElements += 1;
    if (name === "defs") definitions += 1;
    if (name === "title") hasTitle = true;
    if (name === "desc") hasDescription = true;
    if (name === "style") styleElements += 1;

    for (const [rawName, value] of Object.entries(tagAttributes)) {
      const attributeName = rawName.toLowerCase();
      attributes += 1;
      if (attributeName.startsWith("on")) {
        eventHandlers += 1;
        unsafe.add(`event handler ${rawName}`);
      }
      if (attributeName === "id") {
        if (ids.has(value)) duplicateIds.add(value);
        ids.add(value);
      }
      if (attributeName === "href" || attributeName === "xlink:href" || attributeName === "src") inspectReference(value);
      if (attributeName === "style") inspectCss(value);
      if (attributeName === "transform") transforms += 1;
      if (PAINT_ATTRIBUTES.has(attributeName)) for (const color of paintValues(value)) colors.add(color);
      if (/javascript\s*:/i.test(value)) unsafe.add(`javascript URI in ${rawName}`);
      if (attributeName !== "style") {
        for (const match of value.matchAll(/url\(([^)]+)\)/gi)) {
          if (match[1]) inspectReference(match[1]);
        }
      }
    }
  });
  parser.on("text", (text) => {
    if (stack.at(-1) === "style") inspectCss(text);
  });
  parser.on("cdata", (text) => {
    if (stack.at(-1) === "style") inspectCss(text);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("error", (error) => {
    throw error;
  });
  parser.write(source).close();

  if (rootElement !== "svg") throw new Error(`Expected <svg> root element, received <${rootElement || "none"}>`);
  if (externalReferences > 0) unsafe.add("external references");
  if (eventHandlers > 0) unsafe.add("event handlers");
  const parsedViewBox = viewBox(rootAttributes.viewBox ?? rootAttributes.viewbox);
  const aspectRatio = parsedViewBox ? parsedViewBox.width / parsedViewBox.height : undefined;
  const hasAccessibleName = hasTitle || Boolean(rootAttributes["aria-label"] || rootAttributes["aria-labelledby"]);
  return {
    container: "svg",
    bytes: bytes.byteLength,
    rootElement,
    ...(rootAttributes.width ? { width: rootAttributes.width } : {}),
    ...(rootAttributes.height ? { height: rootAttributes.height } : {}),
    ...(parsedViewBox ? { viewBox: parsedViewBox } : {}),
    ...(aspectRatio !== undefined ? { aspectRatio } : {}),
    elements,
    attributes,
    maxDepth,
    paths,
    pathCommands,
    groups,
    gradients,
    filters,
    textElements,
    rasterImages: Math.max(rasterImageElements, embeddedRasterReferences),
    transforms,
    definitions,
    colors: [...colors].sort(),
    ids: ids.size,
    duplicateIds: [...duplicateIds].sort(),
    hasTitle,
    hasDescription,
    hasAccessibleName,
    externalReferences,
    eventHandlers,
    styleElements,
    unsafeFeatures: [...unsafe].sort(),
    elementCounts,
  };
}

export function checkSvg(inspection: SvgInspection, rules?: SvgChecks): ArtifactCheck[] {
  const results: ArtifactCheck[] = [
    check("svg.safe", inspection.unsafeFeatures.length === 0, inspection.unsafeFeatures, [], inspection.unsafeFeatures.length === 0 ? "SVG contains no active or external content" : `unsafe SVG features: ${inspection.unsafeFeatures.join(", ")}`),
    check("svg.unique-ids", inspection.duplicateIds.length === 0, inspection.duplicateIds, [], inspection.duplicateIds.length === 0 ? "SVG IDs are unique" : `duplicate SVG IDs: ${inspection.duplicateIds.join(", ")}`),
  ];
  const policy = { allowRasterImages: false, ...rules };
  if (policy.requireViewBox !== undefined) results.push(check("svg.viewbox", !policy.requireViewBox || Boolean(inspection.viewBox), Boolean(inspection.viewBox), policy.requireViewBox, policy.requireViewBox ? "SVG must define a valid viewBox" : "viewBox is optional"));
  if (policy.requireTitle !== undefined) results.push(check("svg.title", !policy.requireTitle || inspection.hasTitle, inspection.hasTitle, policy.requireTitle, policy.requireTitle ? "SVG must contain a title" : "title is optional"));
  if (policy.requireDescription !== undefined) results.push(check("svg.description", !policy.requireDescription || inspection.hasDescription, inspection.hasDescription, policy.requireDescription, policy.requireDescription ? "SVG must contain a description" : "description is optional"));
  if (policy.allowText !== undefined) results.push(check("svg.text", policy.allowText || inspection.textElements === 0, inspection.textElements, policy.allowText ? { allowed: true } : { max: 0 }, policy.allowText ? "text elements are allowed" : `SVG must not contain text elements (${inspection.textElements} found)`));
  results.push(check("svg.raster-images", policy.allowRasterImages || inspection.rasterImages === 0, inspection.rasterImages, policy.allowRasterImages ? { allowed: true } : { max: 0 }, policy.allowRasterImages ? "embedded raster images are allowed" : `SVG must remain native vector geometry (${inspection.rasterImages} raster image references found)`));
  if (policy.maxBytes !== undefined) results.push(check("svg.bytes", inspection.bytes <= policy.maxBytes, inspection.bytes, { max: policy.maxBytes }, `SVG size ${inspection.bytes} bytes must not exceed ${policy.maxBytes}`));
  if (policy.minElements !== undefined) results.push(check("svg.elements-min", inspection.elements >= policy.minElements, inspection.elements, { min: policy.minElements }, `SVG must contain at least ${policy.minElements} elements`));
  if (policy.maxElements !== undefined) results.push(check("svg.elements-max", inspection.elements <= policy.maxElements, inspection.elements, { max: policy.maxElements }, `SVG must contain no more than ${policy.maxElements} elements`));
  if (policy.minPaths !== undefined) results.push(check("svg.paths-min", inspection.paths >= policy.minPaths, inspection.paths, { min: policy.minPaths }, `SVG must contain at least ${policy.minPaths} paths`));
  if (policy.maxPaths !== undefined) results.push(check("svg.paths-max", inspection.paths <= policy.maxPaths, inspection.paths, { max: policy.maxPaths }, `SVG must contain no more than ${policy.maxPaths} paths`));
  if (policy.maxPathCommands !== undefined) results.push(check("svg.path-commands", inspection.pathCommands <= policy.maxPathCommands, inspection.pathCommands, { max: policy.maxPathCommands }, `SVG must contain no more than ${policy.maxPathCommands} path commands`));
  if (policy.maxDepth !== undefined) results.push(check("svg.depth", inspection.maxDepth <= policy.maxDepth, inspection.maxDepth, { max: policy.maxDepth }, `SVG depth must not exceed ${policy.maxDepth}`));
  if (policy.maxColors !== undefined) results.push(check("svg.colors", inspection.colors.length <= policy.maxColors, inspection.colors.length, { max: policy.maxColors }, `SVG must use no more than ${policy.maxColors} detected colors`));
  if (policy.maxGradients !== undefined) results.push(check("svg.gradients", inspection.gradients <= policy.maxGradients, inspection.gradients, { max: policy.maxGradients }, `SVG must use no more than ${policy.maxGradients} gradients`));
  if (policy.maxFilters !== undefined) results.push(check("svg.filters", inspection.filters <= policy.maxFilters, inspection.filters, { max: policy.maxFilters }, `SVG must use no more than ${policy.maxFilters} filters`));
  if (policy.aspectRatio) {
    const { min = 0, max = Number.POSITIVE_INFINITY } = policy.aspectRatio;
    const actual = inspection.aspectRatio;
    results.push(check("svg.aspect-ratio", actual !== undefined && actual >= min && actual <= max, actual ?? null, { min, ...(Number.isFinite(max) ? { max } : {}) }, `SVG aspect ratio must be between ${min} and ${Number.isFinite(max) ? max : "∞"}`));
  }
  return results;
}
