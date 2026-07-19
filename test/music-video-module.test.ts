import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skill = resolve(root, "modules/music-video-explainer/skills/produce-music-video");

describe("music-video module props", () => {
  it("validates a provider-neutral version 2 shot contract", async () => {
    const { stdout, stderr } = await execFileAsync("node", [
      resolve(skill, "scripts/validate-production.mjs"),
      "--shots", resolve(root, "test/fixtures/music-video/shots.json"),
      "--facts", resolve(root, "test/fixtures/music-video/facts.json"),
    ]);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({ valid: true, schemaVersion: 2, shots: 1 });
  });

  it("creates a resumable review packet without copying candidates", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "propshop-review-test-"));
    const first = resolve(directory, "first.txt");
    const second = resolve(directory, "second.txt");
    const output = resolve(directory, "review");
    await Promise.all([writeFile(first, "one", "utf8"), writeFile(second, "two", "utf8")]);

    await execFileAsync("node", [
      resolve(skill, "scripts/create-review-pack.mjs"),
      "--id", "direction",
      "--question", "Which direction should continue?",
      "--candidate", `first=${first}`,
      "--candidate", `second=${second}`,
      "--recommend", "second",
      "--reason", "It has the stronger hook.",
      "--out-dir", output,
    ]);

    const packet = JSON.parse(await readFile(resolve(output, "decision.json"), "utf8"));
    expect(packet).toMatchObject({
      status: "pending-human",
      recommendation: { candidateId: "second", rationale: "It has the stronger hook." },
    });
    expect(packet.candidates).toHaveLength(2);
    expect(packet.candidates[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(resolve(output, "REVIEW.md"), "utf8")).toContain("Which direction should continue?");
  });

  it("keeps provider and compositor choices out of the core skill", async () => {
    const instructions = await readFile(resolve(skill, "SKILL.md"), "utf8");
    expect(instructions).toContain("Act as the prop department, not the director");
    expect(instructions).toContain("Do not default to a provider, model, shot grammar, take count, or composition framework");
    expect(instructions).not.toContain("kwaivgi/kling-avatar-v2");
    expect(instructions).not.toContain("Use the tested Revideo");
  });
});
