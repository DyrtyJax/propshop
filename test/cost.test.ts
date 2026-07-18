import { describe, expect, it } from "vitest";
import {
  BudgetExceededError,
  PricingRegistry,
  aggregateQuotes,
  assertBudget,
  evaluateBudget,
  formatAggregate,
  formatMicros,
  formatQuote,
  isQuoteStale,
  quoteFromPricingSpec,
  reconcileCost,
  parseUsdToMicros,
  type PricingSpec,
} from "../src/cost/index.js";

const fetchedAt = "2026-07-18T20:00:00.000Z";
const expiresAt = "2026-07-19T20:00:00.000Z";
const now = "2026-07-18T21:00:00.000Z";

function source() {
  return {
    type: "official-price-page" as const,
    url: "https://provider.example/pricing",
  };
}

describe("cost quotes", () => {
  it("quotes fixed and bounded per-take prices using integer micros", () => {
    const quote = quoteFromPricingSpec(
      {
        kind: "flat",
        provider: "specialist",
        model: "vector-pro",
        revision: "2026-07",
        source: source(),
        fetchedAt,
        expiresAt,
        perTakeMicros: { minimum: 200_000, maximum: 200_000 },
      },
      { variants: 3 },
    );
    expect(quote.perTake).toEqual({ currency: "USD", minimumMicros: 200_000, maximumMicros: 200_000 });
    expect(quote.total).toEqual({ currency: "USD", minimumMicros: 600_000, maximumMicros: 600_000 });
    expect(quote.confidence).toBe("exact");
    expect(quote.model).toEqual({ id: "vector-pro", revision: "2026-07" });
  });

  it("keeps provider credits without inventing a dollar conversion", () => {
    const quote = quoteFromPricingSpec(
      {
        kind: "credits",
        provider: "credit-host",
        model: "arrow",
        source: source(),
        fetchedAt,
        expiresAt,
        creditUnit: "quiver-credit",
        perTakeCredits: { minimum: 20, maximum: 20 },
      },
      { variants: 2 },
    );
    expect(quote.total).toBeUndefined();
    expect(quote.credits?.total).toEqual({ unit: "quiver-credit", minimumCredits: 40, maximumCredits: 40 });
    expect(quote.confidence).toBe("unknown");
    expect(quote.assumptions.usdConversion).toMatch(/unavailable/);
  });

  it("converts credits only when an authoritative conversion is supplied", () => {
    const quote = quoteFromPricingSpec(
      {
        kind: "credits",
        provider: "credit-host",
        model: "arrow",
        source: source(),
        fetchedAt,
        expiresAt,
        creditUnit: "quiver-credit",
        perTakeCredits: { minimum: 18, maximum: 22 },
        microsPerCredit: 10_000,
      },
      { variants: 2 },
    );
    expect(quote.total).toEqual({ currency: "USD", minimumMicros: 360_000, maximumMicros: 440_000 });
    expect(quote.confidence).toBe("bounded");
  });

  it("marks token and hardware runtime ranges as estimates", () => {
    const token = quoteFromPricingSpec(
      {
        kind: "tokens",
        provider: "text-host",
        model: "svg-coder",
        source: source(),
        fetchedAt,
        expiresAt,
        inputMicrosPerMillionTokens: 2_000,
        outputMicrosPerMillionTokens: 8_000,
        estimatedInputTokens: { minimum: 1_000, maximum: 2_000 },
        estimatedOutputTokens: { minimum: 500, maximum: 1_500 },
      },
      { variants: 1 },
    );
    const runtime = quoteFromPricingSpec(
      {
        kind: "runtime",
        provider: "gpu-host",
        model: "open-vector",
        source: source(),
        fetchedAt,
        expiresAt,
        microsPerSecond: 225,
        estimatedRuntimeMilliseconds: { minimum: 30_000, maximum: 30_100 },
        billingIncrementMilliseconds: 1_000,
      },
      { variants: 1 },
    );
    expect(token.perTake).toEqual({ currency: "USD", minimumMicros: 6, maximumMicros: 16 });
    expect(token.confidence).toBe("estimated");
    expect(runtime.perTake).toEqual({ currency: "USD", minimumMicros: 6_750, maximumMicros: 6_975 });
    expect(runtime.confidence).toBe("estimated");
    expect(runtime.assumptions.billedRuntimeMilliseconds).toEqual({ minimum: 30_000, maximum: 31_000 });
  });

  it("represents local provider cost without claiming compute is free", () => {
    const quote = quoteFromPricingSpec(
      {
        kind: "local",
        provider: "local",
        model: "star-vector",
        source: { type: "local-runtime" },
        fetchedAt,
        expiresAt,
      },
      { variants: 4 },
    );
    expect(quote.total?.maximumMicros).toBe(0);
    expect(quote.confidence).toBe("local");
    expect(quote.assumptions.excludes).toMatch(/electricity/);
  });

  it("validates evidence and timestamps", () => {
    const spec: PricingSpec = {
      kind: "flat",
      provider: "bad",
      model: "bad",
      source: { type: "official-price-page" },
      fetchedAt,
      expiresAt,
      perTakeMicros: { minimum: 1, maximum: 1 },
    };
    expect(() => quoteFromPricingSpec(spec, { variants: 1 })).toThrow(/source URL/);
    expect(() => quoteFromPricingSpec({ ...spec, source: source(), expiresAt: fetchedAt }, { variants: 1 })).toThrow(/later/);
    expect(() => quoteFromPricingSpec({ ...spec, source: source() }, { variants: 0 })).toThrow(/variants/);
  });
});

describe("pricing registry", () => {
  it("resolves the most specific model, revision, and capability price", () => {
    const registry = new PricingRegistry();
    registry.register({
      kind: "unknown",
      provider: "host",
      model: "*",
      source: { type: "unknown" },
      fetchedAt,
      expiresAt,
      reason: "no model-specific price",
    });
    registry.register({
      kind: "flat",
      provider: "host",
      capability: "vector.svg.generate",
      model: "svg-artist",
      revision: "abc123",
      source: source(),
      fetchedAt,
      expiresAt,
      perTakeMicros: { minimum: 400, maximum: 400 },
    });
    const quote = registry.quoteProvider("host", {
      model: "svg-artist",
      revision: "abc123",
      capability: "vector.svg.generate",
      variants: 2,
    });
    expect(quote.total?.maximumMicros).toBe(800);
    expect(quote.model.revision).toBe("abc123");
  });
});

describe("aggregation and budgets", () => {
  const priced = quoteFromPricingSpec(
    {
      kind: "flat",
      provider: "host",
      model: "model",
      source: source(),
      fetchedAt,
      expiresAt,
      perTakeMicros: { minimum: 1_000, maximum: 3_000 },
    },
    { variants: 3 },
  );
  const unknown = quoteFromPricingSpec(
    {
      kind: "unknown",
      provider: "mystery",
      model: "future-model",
      source: { type: "unknown" },
      fetchedAt,
      expiresAt,
      reason: "provider exposes no pricing",
    },
    { variants: 1 },
  );

  it("preserves known subtotal when one route is unpriced", () => {
    const aggregate = aggregateQuotes([priced, unknown], now);
    expect(aggregate.complete).toBe(false);
    expect(aggregate.total).toBeUndefined();
    expect(aggregate.knownTotal).toEqual({ currency: "USD", minimumMicros: 3_000, maximumMicros: 9_000 });
    expect(aggregate.unknownQuotes).toBe(1);
  });

  it("blocks unknown, stale, per-take, and total overages before generation", () => {
    const strict = { maxTotalMicros: 8_000, maxPerTakeMicros: 2_000, allowUnknown: false, allowStale: false, onExceeded: "fail" as const };
    const decision = evaluateBudget([priced, unknown], strict, "2026-07-20T00:00:00.000Z");
    expect(decision.allowed).toBe(false);
    expect(decision.errors.join(" ")).toMatch(/stale/);
    expect(decision.errors.join(" ")).toMatch(/unknown USD/);
    expect(decision.errors.join(" ")).toMatch(/per take/);
    expect(decision.errors.join(" ")).toMatch(/total budget/);
    expect(() => assertBudget([priced, unknown], strict, "2026-07-20T00:00:00.000Z")).toThrow(BudgetExceededError);
  });

  it("allows explicitly accepted uncertainty but keeps warnings", () => {
    const decision = assertBudget(
      [priced, unknown],
      { allowUnknown: true, allowStale: true, onExceeded: "fail" },
      "2026-07-20T00:00:00.000Z",
    );
    expect(decision.allowed).toBe(true);
    expect(decision.warnings).toHaveLength(2);
  });
});

describe("reconciliation and display", () => {
  const quote = quoteFromPricingSpec(
    {
      kind: "runtime",
      provider: "gpu-host",
      model: "creative-model",
      source: source(),
      fetchedAt,
      expiresAt,
      microsPerSecond: 1_000,
      estimatedRuntimeMilliseconds: { minimum: 1_000, maximum: 3_000 },
    },
    { variants: 2 },
  );

  it("records actual cost above a probabilistic estimate without mutating the quote", () => {
    const result = reconcileCost(quote, {
      provider: "gpu-host",
      model: { id: "creative-model" },
      amount: { currency: "USD", micros: 7_000 },
      source: { type: "provider-reported" },
      measuredAt: "2026-07-18T21:01:00.000Z",
      usage: { runtimeMilliseconds: 7_000 },
    });
    expect(result.status).toBe("above-quote");
    expect(result.deltaFromMaximumMicros).toBe(1_000);
    expect(result.quote.total?.maximumMicros).toBe(6_000);
  });

  it("formats sub-cent ranges and visibly labels stale evidence", () => {
    expect(parseUsdToMicros("$0.0004")).toBe(400);
    expect(parseUsdToMicros("2.50")).toBe(2_500_000);
    expect(() => parseUsdToMicros("0.0000001")).toThrow(/at most 6/);
    expect(formatMicros(400)).toBe("$0.0004");
    expect(formatMicros(6_750)).toBe("$0.007");
    expect(formatQuote(quote, "2026-07-20T00:00:00.000Z")).toMatch(/\[ESTIMATED; STALE\]/);
    expect(formatAggregate(aggregateQuotes([quote], now))).toMatch(/\$0.002–\$0.006 total/);
    expect(isQuoteStale(quote, expiresAt)).toBe(true);
  });
});
