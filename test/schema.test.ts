import { describe, expect, it } from "vitest";
import { parsePropfile } from "../src/schema.js";

const valid = {
  version: 1,
  project: "test-shop",
  providers: { preview: { adapter: "mock" } },
  props: [{ id: "tiny-bell", kind: "sfx", prompt: "a tiny bell", provider: "preview" }],
};

describe("Propfile schema", () => {
  it("applies portable defaults", () => {
    const parsed = parsePropfile(valid);
    expect(parsed.outputDir).toBe("props");
    expect(parsed.props[0]?.variants).toBe(1);
    expect(parsed.props[0]?.input).toEqual({});
  });

  it("rejects duplicate IDs", () => {
    expect(() => parsePropfile({ ...valid, props: [valid.props[0], valid.props[0]] })).toThrow(/duplicate prop id/);
  });

  it("rejects unknown providers", () => {
    expect(() => parsePropfile({ ...valid, props: [{ ...valid.props[0], provider: "missing" }] })).toThrow(/unknown provider/);
  });

  it("keeps promoted output inside the project", () => {
    expect(() => parsePropfile({ ...valid, outputDir: "../../elsewhere" })).toThrow(/inside the project/);
  });
});
