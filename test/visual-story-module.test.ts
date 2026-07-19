import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { loadModule } from "../src/modules/index.js";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleRoot = resolve(root, "modules/visual-story");
const skill = resolve(moduleRoot, "skills/produce-visual-story");
const fixture = resolve(skill, "examples/portable-story.json");

describe("visual-story module", () => {
  it("loads as an adaptive, provider-neutral module with pinned upstream routes", async () => {
    const loaded = await loadModule(moduleRoot);
    expect(loaded.manifest).toMatchObject({
      name: "visual-story",
      version: "0.1.0",
      skills: [{ name: "produce-visual-story", interaction: "adaptive" }],
    });
    expect(loaded.manifest.upstreams).toHaveLength(3);
    expect(loaded.manifest.upstreams.every((upstream) => upstream.revision.length >= 40)).toBe(true);
  });

  it("validates one story across video, slides, scroll, and interactive outputs", async () => {
    const { stdout } = await execFileAsync("node", [resolve(skill, "scripts/storyboard.mjs"), "--input", fixture]);
    const report = JSON.parse(stdout);
    expect(report).toMatchObject({
      valid: true,
      schemaVersion: 1,
      budget: { currency: "USD", maxExternalSpend: 0, spent: 0 },
      outputs: 4,
      beats: 3,
      elements: 6,
    });
    expect(report.warnings).toContain("1 decision is pending human direction");
  });

  it("creates a self-contained editorial board with maps and charts", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "propshop-story-test-"));
    const board = resolve(directory, "board.html");
    await execFileAsync("node", [resolve(skill, "scripts/storyboard.mjs"), "--input", fixture, "--out", board]);
    const html = await readFile(board, "utf8");
    expect(html).toContain("The Harbor After Dark");
    expect(html).toContain("route-explorer");
    expect(html).toContain("USD 0 / 0 external spend");
    expect(html).toContain("harbor-route");
    expect(html).toContain("STRUCTURAL PREVIEW");
    expect(html).toContain("<svg");
    expect(html).not.toContain("https://cdn");
  });

  it("rejects dangling fact references", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "propshop-story-invalid-"));
    const invalid = resolve(directory, "story.json");
    const story = JSON.parse(await readFile(fixture, "utf8"));
    story.beats[0].factIds = ["missing-fact"];
    await writeFile(invalid, JSON.stringify(story), "utf8");
    await expect(execFileAsync("node", [resolve(skill, "scripts/storyboard.mjs"), "--input", invalid])).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining("unknown fact 'missing-fact'"),
    });
  });

  it("keeps renderer choices conditional and preserves human steering", async () => {
    const instructions = await readFile(resolve(skill, "SKILL.md"), "utf8");
    expect(instructions).toContain("No route is mandatory");
    expect(instructions).toContain("adaptive checkpoints");
    expect(instructions).toContain("Never ask it to be the source of truth for factual text, charts, or maps");
    expect(instructions).not.toContain("Always use HyperFrames");
    expect(instructions).not.toContain("Always use MapLibre");
  });
});
