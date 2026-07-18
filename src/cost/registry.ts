import { quoteFromPricingSpec } from "./quote.js";
import type { CostQuote, PricingSpec, QuoteRequest } from "./types.js";

function keyPart(value: string | undefined): string {
  return value ?? "*";
}

function score(spec: PricingSpec, request: QuoteRequest): number {
  if (request.model && spec.model !== request.model && spec.model !== "*") return -1;
  if (request.revision && spec.revision && spec.revision !== request.revision) return -1;
  if (request.capability && spec.capability && spec.capability !== request.capability) return -1;
  return (
    (spec.model === request.model ? 4 : 0) +
    (spec.revision === request.revision && spec.revision !== undefined ? 2 : 0) +
    (spec.capability === request.capability && spec.capability !== undefined ? 1 : 0)
  );
}

/** In-memory registry. Loading and refreshing price observations belongs outside this module. */
export class PricingRegistry {
  readonly #entries = new Map<string, PricingSpec>();

  register(spec: PricingSpec): void {
    const key = [spec.provider, keyPart(spec.model), keyPart(spec.revision), keyPart(spec.capability)].join(":");
    this.#entries.set(key, spec);
  }

  entries(provider?: string): PricingSpec[] {
    return [...this.#entries.values()].filter((entry) => provider === undefined || entry.provider === provider);
  }

  resolve(provider: string, request: QuoteRequest): PricingSpec | undefined {
    return this.entries(provider)
      .map((entry) => ({ entry, score: score(entry, request) }))
      .filter((candidate) => candidate.score >= 0)
      .sort((left, right) => right.score - left.score)[0]?.entry;
  }

  quoteProvider(provider: string, request: QuoteRequest): CostQuote {
    const spec = this.resolve(provider, request);
    if (!spec) {
      throw new Error(
        `No pricing registered for ${provider}/${request.model ?? "*"}/${request.capability ?? "*"}`,
      );
    }
    return quoteFromPricingSpec(spec, request);
  }
}

export function quoteProvider(
  registry: PricingRegistry,
  provider: string,
  request: QuoteRequest,
): CostQuote {
  return registry.quoteProvider(provider, request);
}
