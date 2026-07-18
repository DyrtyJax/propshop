import type { Adapter, GenerateContext, GeneratedOutput, ProviderConfig } from "../types.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export class MockAdapter implements Adapter {
  readonly name = "mock";

  async check(_config: ProviderConfig): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "ready (deterministic local preview)" };
  }

  async generate(context: GenerateContext): Promise<GeneratedOutput[]> {
    const { prop, variant, style } = context;
    const palette = style?.palette ?? [];
    const background = palette[0] ?? "#17121f";
    const accent = palette[1] ?? "#ff4db8";
    const foreground = palette[2] ?? "#f4efff";
    const label = `${prop.kind.toUpperCase()} · TAKE ${variant}`;
    const prompt = prop.prompt.length > 68 ? `${prop.prompt.slice(0, 65)}…` : prop.prompt;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(prop.id)}</title>
  <desc id="desc">PropShop preview card for ${escapeXml(prop.prompt)}</desc>
  <rect width="960" height="540" rx="36" fill="${escapeXml(background)}"/>
  <path d="M0 414L252 261L455 352L665 172L960 321V540H0Z" fill="${escapeXml(accent)}" opacity=".14"/>
  <circle cx="817" cy="113" r="58" fill="none" stroke="${escapeXml(accent)}" stroke-width="12"/>
  <path d="M790 113h54M817 86v54" stroke="${escapeXml(accent)}" stroke-width="12" stroke-linecap="round"/>
  <text x="72" y="92" fill="${escapeXml(accent)}" font-family="ui-monospace, monospace" font-size="22" font-weight="700" letter-spacing="3">PROP SHOP</text>
  <text x="72" y="217" fill="${escapeXml(foreground)}" font-family="system-ui, sans-serif" font-size="64" font-weight="800">${escapeXml(prop.id)}</text>
  <text x="72" y="277" fill="${escapeXml(foreground)}" opacity=".68" font-family="system-ui, sans-serif" font-size="25">${escapeXml(prompt)}</text>
  <rect x="72" y="390" width="260" height="62" rx="31" fill="${escapeXml(accent)}"/>
  <text x="202" y="429" text-anchor="middle" fill="${escapeXml(background)}" font-family="ui-monospace, monospace" font-size="18" font-weight="800">${escapeXml(label)}</text>
</svg>`;
    return [
      {
        bytes: new TextEncoder().encode(svg),
        extension: "svg",
        mediaType: "image/svg+xml",
        providerMetadata: { deterministic: true },
      },
    ];
  }
}
