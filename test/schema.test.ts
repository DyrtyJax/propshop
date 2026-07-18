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

  it("parses integer-micro budget guardrails with strict defaults", () => {
    const parsed = parsePropfile({
      ...valid,
      budget: { maxTotalMicros: 20_000, maxPerTakeMicros: 5_000 },
    });
    expect(parsed.budget).toEqual({
      maxTotalMicros: 20_000,
      maxPerTakeMicros: 5_000,
      allowUnknown: false,
      allowStale: false,
      onExceeded: "fail",
    });
    expect(() => parsePropfile({ ...valid, budget: { maxTotalMicros: 0.01 } })).toThrow();
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
