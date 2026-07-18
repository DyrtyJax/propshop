import { Command } from "commander";
import { attachModule, listAttachments, loadModule } from "./loader.js";
import { checkoutGitModule } from "./source.js";

function agentName(value: string): "codex" | "claude" {
  if (value !== "codex" && value !== "claude") throw new Error("--agent must be codex or claude");
  return value;
}

function printAttachment(record: Awaited<ReturnType<typeof attachModule>>): void {
  console.log(`\n  Docked ${record.name}@${record.version} for ${record.agent}.`);
  for (const skill of record.skills) console.log(`  → ${skill.destination}`);
  console.log("");
}

export function registerModuleCommands(program: Command): void {
  const module = program.command("module").description("Inspect and attach dockable PropShop modules");

  module
    .command("inspect")
    .description("Validate and print a local module manifest")
    .argument("<path>", "local module directory")
    .action(async (path: string) => {
      const loaded = await loadModule(path);
      console.log(JSON.stringify(loaded.manifest, null, 2));
    });

  module
    .command("attach")
    .description("Attach a local module's skills to a project")
    .argument("<path>", "local module directory")
    .requiredOption("--agent <agent>", "target agent: codex or claude")
    .option("--project <directory>", "target project directory", ".")
    .option("--force", "replace skills already attached by name")
    .action(async (path: string, options: { agent: string; project: string; force?: boolean }) => {
      const record = await attachModule({
        modulePath: path,
        project: options.project,
        agent: agentName(options.agent),
        force: options.force ?? false,
      });
      printAttachment(record);
    });

  module
    .command("add")
    .description("Attach a module from a Git repository and pin its exact commit")
    .argument("<url>", "https:// Git repository URL")
    .requiredOption("--agent <agent>", "target agent: codex or claude")
    .option("--project <directory>", "target project directory", ".")
    .option("--ref <revision>", "branch, tag, or commit to check out")
    .option("--subdir <path>", "module directory inside the repository")
    .option("--force", "replace skills already attached by name")
    .action(async (url: string, options: { agent: string; project: string; ref?: string; subdir?: string; force?: boolean }) => {
      const source = await checkoutGitModule(url, {
        ...(options.ref ? { ref: options.ref } : {}),
        ...(options.subdir ? { subdir: options.subdir } : {}),
      });
      try {
        const record = await attachModule({
          modulePath: source.root,
          project: options.project,
          agent: agentName(options.agent),
          force: options.force ?? false,
          origin: source.origin,
        });
        printAttachment(record);
      } finally {
        await source.cleanup();
      }
    });

  module
    .command("list")
    .description("List modules attached to a project")
    .option("--project <directory>", "target project directory", ".")
    .action(async (options: { project: string }) => {
      const records = await listAttachments(options.project);
      if (records.length === 0) return console.log("\n  No modules docked in this project.\n");
      console.log("");
      for (const record of records) {
        const origin = record.origin.kind === "git" ? `  ${record.origin.revision.slice(0, 10)}` : "  local";
        console.log(`  ${record.name}@${record.version}  ${record.agent}  ${record.skills.length} skill${record.skills.length === 1 ? "" : "s"}${origin}`);
      }
      console.log("");
    });
}
