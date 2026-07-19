import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { attachModule, checkoutGitModule, listAttachments, loadModule } from "../src/modules/index.js";

const execFileAsync = promisify(execFile);

const roots: string[] = [];

async function fixture(): Promise<{ moduleRoot: string; projectRoot: string }> {
  const root = await mkdtemp(resolve(tmpdir(), "propshop-module-test-"));
  roots.push(root);
  const moduleRoot = resolve(root, "module");
  const projectRoot = resolve(root, "project");
  await mkdir(resolve(moduleRoot, "skills/produce-example/agents"), { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    resolve(moduleRoot, "propshop.module.yaml"),
    `schemaVersion: 1
name: example-module
version: 0.1.0
description: A test module.
license: MIT
capabilities: [example.production]
skills:
  - name: produce-example
    path: skills/produce-example
    interaction: checkpointed
upstreams:
  - name: Example upstream
    url: https://example.com/upstream
    revision: abc123
    license: MIT
    integration: adapted
`,
    "utf8",
  );
  await writeFile(
    resolve(moduleRoot, "skills/produce-example/SKILL.md"),
    "---\nname: produce-example\ndescription: Produce an example.\n---\n\n# Produce\n",
    "utf8",
  );
  await writeFile(resolve(moduleRoot, "skills/produce-example/agents/openai.yaml"), "interface:\n  display_name: \"Example\"\n", "utf8");
  return { moduleRoot, projectRoot };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("dockable modules", () => {
  it("resolves first-party modules bundled with the package by name", async () => {
    const loaded = await loadModule("music-video-explainer");
    expect(loaded.manifest.name).toBe("music-video-explainer");
  });

  it("loads and validates a local module", async () => {
    const { moduleRoot } = await fixture();
    const loaded = await loadModule(moduleRoot);
    expect(loaded.manifest.name).toBe("example-module");
    expect(loaded.manifest.skills[0]?.interaction).toBe("checkpointed");
    expect(loaded.manifest.upstreams[0]?.revision).toBe("abc123");
  });

  it("attaches skills project-locally and records provenance", async () => {
    const { moduleRoot, projectRoot } = await fixture();
    const record = await attachModule({ modulePath: moduleRoot, project: projectRoot, agent: "claude" });
    expect(record.skills[0]?.destination).toBe(resolve(projectRoot, ".claude/skills/produce-example"));
    expect(await readFile(resolve(projectRoot, ".claude/skills/produce-example/SKILL.md"), "utf8")).toContain("name: produce-example");
    const attached = await listAttachments(projectRoot);
    expect(attached).toHaveLength(1);
    expect(attached[0]?.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(attached[0]?.upstreams[0]?.license).toBe("MIT");
    expect(attached[0]?.origin.kind).toBe("local");
    expect(attached[0]?.skills[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(attached[0]?.skills[0]?.interaction).toBe("checkpointed");
    expect(attached[0]?.skills[0]?.files).toBe(2);
  });

  it("refuses to replace an attached skill without force", async () => {
    const { moduleRoot, projectRoot } = await fixture();
    await attachModule({ modulePath: moduleRoot, project: projectRoot, agent: "codex" });
    await expect(attachModule({ modulePath: moduleRoot, project: projectRoot, agent: "codex" })).rejects.toThrow("Skill already attached");
  });

  it("refuses symbolic links in an attached skill", async () => {
    const { moduleRoot, projectRoot } = await fixture();
    await symlink("SKILL.md", resolve(moduleRoot, "skills/produce-example/link.md"));
    await expect(attachModule({ modulePath: moduleRoot, project: projectRoot, agent: "codex" })).rejects.toThrow("symbolic links");
  });

  it("does not attach dependency caches", async () => {
    const { moduleRoot, projectRoot } = await fixture();
    const cache = resolve(moduleRoot, "skills/produce-example/node_modules/example");
    await mkdir(cache, { recursive: true });
    await symlink("../example", resolve(cache, "self"));
    const record = await attachModule({ modulePath: moduleRoot, project: projectRoot, agent: "codex" });
    await expect(readFile(resolve(record.skills[0]!.destination, "node_modules/example/self"))).rejects.toThrow();
  });

  it("checks out Git modules and records an immutable revision", async () => {
    const { moduleRoot, projectRoot } = await fixture();
    await execFileAsync("git", ["init", "--quiet"], { cwd: moduleRoot });
    await execFileAsync("git", ["add", "."], { cwd: moduleRoot });
    await execFileAsync("git", ["-c", "user.name=PropShop Test", "-c", "user.email=test@propshop.dev", "commit", "--quiet", "-m", "fixture"], { cwd: moduleRoot });
    const source = await checkoutGitModule(new URL(`file://${moduleRoot}`).toString());
    try {
      expect(source.origin.revision).toMatch(/^[a-f0-9]{40}$/);
      expect((await loadModule(source.root)).manifest.name).toBe("example-module");
      const record = await attachModule({ modulePath: source.root, project: projectRoot, agent: "claude", origin: source.origin });
      expect(record.origin).toEqual(source.origin);
    } finally {
      await source.cleanup();
    }
  });
});
