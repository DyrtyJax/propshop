#!/usr/bin/env node

if (process.argv.includes("--propshop-describe")) {
  process.stdout.write(JSON.stringify({
    protocol: 1,
    name: "propshop-svg-demo",
    version: "1.0.0",
    capabilities: ["vector.svg.generate"],
  }));
  process.exit(0);
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const palette = request.style?.palette ?? ["#201827", "#ff5a47", "#fff0c7"];
const take = Number(request.variant ?? 1);
const rotation = (take - 1) * 11;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title desc">
  <title id="title">${String(request.prompt).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</title>
  <desc id="desc">Deterministic PropShop SVG command protocol demonstration</desc>
  <rect width="256" height="256" rx="48" fill="${palette[0]}"/>
  <g transform="translate(128 128) rotate(${rotation})">
    <path d="M0-82 71-41 71 41 0 82-71 41-71-41Z" fill="none" stroke="${palette[1]}" stroke-width="18" stroke-linejoin="round"/>
    <circle r="39" fill="${palette[2]}"/>
    <path d="M-15 0H15M0-15V15" stroke="${palette[0]}" stroke-width="10" stroke-linecap="round"/>
  </g>
</svg>`;
process.stdout.write(JSON.stringify({ outputs: [{ svg, metadata: { deterministic: true, take } }] }));
