import { isAbsolute, normalize } from "node:path";
import { z } from "zod";

const relativePath = z
  .string()
  .min(1)
  .refine(
    (value) => !isAbsolute(value) && !normalize(value).split(/[\\/]/).includes(".."),
    "must stay inside the module directory",
  );

const slug = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, numbers, and hyphens");

export const moduleManifestSchema = z.object({
  schemaVersion: z.literal(1),
  name: slug,
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "use a semantic version"),
  description: z.string().min(1),
  license: z.string().min(1),
  source: z
    .object({
      url: z.string().url(),
      revision: z.string().min(1),
    })
    .optional(),
  capabilities: z.array(z.string().regex(/^[a-z0-9][a-z0-9.-]+$/)).default([]),
  skills: z
    .array(
      z.object({
        name: slug,
        path: relativePath,
      }),
    )
    .min(1),
  upstreams: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        revision: z.string().min(1),
        license: z.string().min(1),
        integration: z.enum(["adapted", "external", "vendored"]),
      }),
    )
    .default([]),
});

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

export function parseModuleManifest(value: unknown): ModuleManifest {
  return moduleManifestSchema.parse(value);
}
