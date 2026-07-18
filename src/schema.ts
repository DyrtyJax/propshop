import { z } from "zod";
import { isAbsolute, normalize } from "node:path";
import type { Propfile } from "./types.js";

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

const providerSchema = z.object({
  adapter: z.string().min(1),
  env: z.string().min(1).optional(),
  options: z.record(z.string(), jsonValue).optional(),
});

const propSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, numbers, and hyphens"),
  kind: z.string().min(1),
  prompt: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
  variants: z.number().int().min(1).max(16).default(1),
  input: z.record(z.string(), jsonValue).default({}),
  output: z
    .object({
      extension: z.string().regex(/^\.?[a-zA-Z0-9]+$/).optional(),
      mediaType: z.string().min(1).optional(),
    })
    .optional(),
  tags: z.array(z.string()).default([]),
});

export const propfileSchema = z
  .object({
    version: z.literal(1),
    project: z.string().min(1),
    description: z.string().optional(),
    outputDir: z
      .string()
      .min(1)
      .refine(
        (value) => !isAbsolute(value) && !normalize(value).split(/[\\/]/).includes(".."),
        "must stay inside the project directory",
      )
      .default("props"),
    style: z
      .object({
        description: z.string().optional(),
        references: z.array(z.string()).default([]),
        palette: z.array(z.string()).default([]),
      })
      .optional(),
    providers: z.record(z.string(), providerSchema),
    props: z.array(propSchema).min(1),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, prop] of value.props.entries()) {
      if (ids.has(prop.id)) {
        context.addIssue({
          code: "custom",
          path: ["props", index, "id"],
          message: `duplicate prop id: ${prop.id}`,
        });
      }
      ids.add(prop.id);
      if (!(prop.provider in value.providers)) {
        context.addIssue({
          code: "custom",
          path: ["props", index, "provider"],
          message: `unknown provider: ${prop.provider}`,
        });
      }
    }
  });

export function parsePropfile(value: unknown): Propfile {
  return propfileSchema.parse(value) as Propfile;
}
