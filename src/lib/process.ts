import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";

export async function findExecutable(command: string): Promise<string> {
  const candidates = isAbsolute(command) || command.includes("/") || command.includes("\\")
    ? [resolve(command)]
    : (process.env.PATH ?? "").split(delimiter).flatMap((directory) => {
        const base = join(directory, command);
        return process.platform === "win32" ? [base, `${base}.exe`, `${base}.cmd`] : [base];
      });
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through PATH.
    }
  }
  throw new Error(`Could not find executable '${command}'`);
}
