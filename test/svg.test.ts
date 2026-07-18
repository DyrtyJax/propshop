import { describe, expect, it } from "vitest";
import { checkSvg, inspectSvg } from "../src/validation/svg.js";

function bytes(svg: string): Uint8Array {
  return new TextEncoder().encode(svg);
}

describe("SVG inspection", () => {
  it("measures editable vector structure and accessibility", () => {
    const inspection = inspectSvg(bytes(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32" role="img">
        <title>Portal</title><desc>A glowing geometric portal</desc>
        <defs><linearGradient id="glow"><stop stop-color="#ff5a47"/></linearGradient></defs>
        <g fill="url(#glow)"><path d="M4 16 C12 2 52 2 60 16 C52 30 12 30 4 16 Z"/></g>
      </svg>`));
    expect(inspection.viewBox).toEqual({ minX: 0, minY: 0, width: 64, height: 32 });
    expect(inspection.aspectRatio).toBe(2);
    expect(inspection.paths).toBe(1);
    expect(inspection.pathCommands).toBe(4);
    expect(inspection.gradients).toBe(1);
    expect(inspection.colors).toContain("#ff5a47");
    expect(inspection.hasAccessibleName).toBe(true);
    expect(inspection.unsafeFeatures).toEqual([]);
  });

  it("rejects active content, event handlers, and external resources", () => {
    const inspection = inspectSvg(bytes(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)">
        <script>alert(1)</script><animate attributeName="opacity" values="0;1"/><image href="https://tracker.example/pixel.png"/>
      </svg>`));
    const checks = checkSvg(inspection);
    expect(inspection.externalReferences).toBe(1);
    expect(inspection.eventHandlers).toBe(1);
    expect(inspection.unsafeFeatures).toContain("element <animate>");
    expect(checks.find((item) => item.name === "svg.safe")?.status).toBe("failed");
    expect(checks.find((item) => item.name === "svg.raster-images")?.status).toBe("failed");
  });

  it("enforces structural budgets without pretending they measure taste", () => {
    const inspection = inspectSvg(bytes(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 0L10 10L0 10Z" fill="#000"/></svg>`));
    const checks = checkSvg(inspection, {
      requireViewBox: true,
      minPaths: 2,
      maxPathCommands: 3,
      maxColors: 1,
      aspectRatio: { min: 0.9, max: 1.1 },
    });
    expect(checks.find((item) => item.name === "svg.paths-min")?.status).toBe("failed");
    expect(checks.find((item) => item.name === "svg.path-commands")?.status).toBe("failed");
    expect(checks.find((item) => item.name === "svg.aspect-ratio")?.status).toBe("passed");
  });

  it("rejects malformed XML and non-SVG roots", () => {
    expect(() => inspectSvg(bytes("<svg><path></svg>"))).toThrow();
    expect(() => inspectSvg(bytes("<html></html>"))).toThrow(/Expected <svg>/);
  });
});
