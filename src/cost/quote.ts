import type {
  CostConfidence,
  CostQuote,
  CreditRange,
  IntegerRange,
  MoneyRange,
  PricingSpec,
  QuoteRequest,
} from "./types.js";

function integer(value: number, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}

function range(value: IntegerRange, name: string): IntegerRange {
  integer(value.minimum, `${name}.minimum`);
  integer(value.maximum, `${name}.maximum`);
  if (value.minimum > value.maximum) throw new Error(`${name}.minimum must not exceed maximum`);
  return value;
}

function money(minimumMicros: number, maximumMicros: number): MoneyRange {
  integer(minimumMicros, "minimumMicros");
  integer(maximumMicros, "maximumMicros");
  if (minimumMicros > maximumMicros) throw new Error("minimumMicros must not exceed maximumMicros");
  return { currency: "USD", minimumMicros, maximumMicros };
}

function multiply(left: number, right: number, name: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new Error(`${name} exceeds safe integer precision`);
  return result;
}

function add(left: number, right: number, name: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(`${name} exceeds safe integer precision`);
  return result;
}

function scaleMoney(perTake: MoneyRange, variants: number): MoneyRange {
  return money(
    multiply(perTake.minimumMicros, variants, "total minimum"),
    multiply(perTake.maximumMicros, variants, "total maximum"),
  );
}

function scaleCredits(perTake: CreditRange, variants: number): CreditRange {
  return {
    unit: perTake.unit,
    minimumCredits: multiply(perTake.minimumCredits, variants, "total minimum credits"),
    maximumCredits: multiply(perTake.maximumCredits, variants, "total maximum credits"),
  };
}

function microsForTokens(tokens: number, microsPerMillionTokens: number): number {
  const product = multiply(tokens, microsPerMillionTokens, "token price product");
  return Math.ceil(product / 1_000_000);
}

function billedMilliseconds(milliseconds: number, increment: number, minimum: number): number {
  const atLeastMinimum = Math.max(milliseconds, minimum);
  return Math.ceil(atLeastMinimum / increment) * increment;
}

function validateDates(fetchedAt: string, expiresAt: string): void {
  const fetched = Date.parse(fetchedAt);
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(fetched)) throw new Error("fetchedAt must be an ISO timestamp");
  if (!Number.isFinite(expires)) throw new Error("expiresAt must be an ISO timestamp");
  if (expires <= fetched) throw new Error("expiresAt must be later than fetchedAt");
}

function sourceRequirements(spec: PricingSpec): void {
  if (
    (spec.source.type === "live-provider-api" || spec.source.type === "official-price-page") &&
    !spec.source.url
  ) {
    throw new Error(`${spec.source.type} pricing requires a source URL`);
  }
}

/**
 * Turn an immutable, timestamped pricing observation into a preflight quote.
 * Token and runtime pricing remain estimates even when the unit rate is exact.
 */
export function quoteFromPricingSpec(spec: PricingSpec, request: QuoteRequest): CostQuote {
  const variants = integer(request.variants, "variants", 1);
  validateDates(spec.fetchedAt, spec.expiresAt);
  sourceRequirements(spec);
  const base = {
    schemaVersion: 1 as const,
    provider: spec.provider,
    ...(request.capability ?? spec.capability ? { capability: request.capability ?? spec.capability } : {}),
    model: {
      id: request.model ?? spec.model,
      ...(request.revision ?? spec.revision ? { revision: request.revision ?? spec.revision } : {}),
    },
    variants,
    source: spec.source,
    fetchedAt: spec.fetchedAt,
    expiresAt: spec.expiresAt,
    assumptions: { ...(spec.assumptions ?? {}), ...(request.assumptions ?? {}) },
  };

  if (spec.kind === "unknown") {
    return {
      ...base,
      confidence: "unknown",
      assumptions: { ...base.assumptions, reason: spec.reason },
    };
  }

  if (spec.kind === "local") {
    const perTake = money(0, 0);
    return {
      ...base,
      perTake,
      total: scaleMoney(perTake, variants),
      confidence: "local",
      assumptions: {
        ...base.assumptions,
        providerCostOnly: true,
        excludes: "owned hardware, electricity, and operator time",
        ...(spec.note ? { note: spec.note } : {}),
      },
    };
  }

  if (spec.kind === "flat") {
    const price = range(spec.perTakeMicros, "perTakeMicros");
    const perTake = money(price.minimum, price.maximum);
    const confidence: CostConfidence = price.minimum === price.maximum ? "exact" : "bounded";
    return { ...base, perTake, total: scaleMoney(perTake, variants), confidence };
  }

  if (spec.kind === "credits") {
    const prices = range(spec.perTakeCredits, "perTakeCredits");
    const perTakeCredits: CreditRange = {
      unit: spec.creditUnit,
      minimumCredits: prices.minimum,
      maximumCredits: prices.maximum,
    };
    if (spec.microsPerCredit === undefined) {
      return {
        ...base,
        credits: { perTake: perTakeCredits, total: scaleCredits(perTakeCredits, variants) },
        confidence: "unknown",
        assumptions: {
          ...base.assumptions,
          usdConversion: "unavailable; provider credits are not assumed to equal dollars",
        },
      };
    }
    const microsPerCredit = integer(spec.microsPerCredit, "microsPerCredit");
    const perTake = money(
      multiply(prices.minimum, microsPerCredit, "minimum credit price"),
      multiply(prices.maximum, microsPerCredit, "maximum credit price"),
    );
    return {
      ...base,
      perTake,
      total: scaleMoney(perTake, variants),
      credits: {
        perTake: perTakeCredits,
        total: scaleCredits(perTakeCredits, variants),
        microsPerCredit,
      },
      confidence: prices.minimum === prices.maximum ? "exact" : "bounded",
    };
  }

  if (spec.kind === "tokens") {
    const inputs = range(spec.estimatedInputTokens, "estimatedInputTokens");
    const outputs = range(spec.estimatedOutputTokens, "estimatedOutputTokens");
    const inputRate = integer(spec.inputMicrosPerMillionTokens, "inputMicrosPerMillionTokens");
    const outputRate = integer(spec.outputMicrosPerMillionTokens, "outputMicrosPerMillionTokens");
    const perTake = money(
      add(
        microsForTokens(inputs.minimum, inputRate),
        microsForTokens(outputs.minimum, outputRate),
        "minimum token price",
      ),
      add(
        microsForTokens(inputs.maximum, inputRate),
        microsForTokens(outputs.maximum, outputRate),
        "maximum token price",
      ),
    );
    return {
      ...base,
      perTake,
      total: scaleMoney(perTake, variants),
      confidence: "estimated",
      assumptions: {
        ...base.assumptions,
        inputTokens: { minimum: inputs.minimum, maximum: inputs.maximum },
        outputTokens: { minimum: outputs.minimum, maximum: outputs.maximum },
        inputMicrosPerMillionTokens: inputRate,
        outputMicrosPerMillionTokens: outputRate,
      },
    };
  }

  const runtime = range(spec.estimatedRuntimeMilliseconds, "estimatedRuntimeMilliseconds");
  const rate = integer(spec.microsPerSecond, "microsPerSecond");
  const increment = integer(spec.billingIncrementMilliseconds ?? 1, "billingIncrementMilliseconds", 1);
  const minimum = integer(spec.minimumBillableMilliseconds ?? 0, "minimumBillableMilliseconds");
  const minimumRuntime = billedMilliseconds(runtime.minimum, increment, minimum);
  const maximumRuntime = billedMilliseconds(runtime.maximum, increment, minimum);
  const perTake = money(
    Math.ceil(multiply(minimumRuntime, rate, "minimum runtime price product") / 1_000),
    Math.ceil(multiply(maximumRuntime, rate, "maximum runtime price product") / 1_000),
  );
  return {
    ...base,
    perTake,
    total: scaleMoney(perTake, variants),
    confidence: "estimated",
    assumptions: {
      ...base.assumptions,
      runtimeMilliseconds: { minimum: runtime.minimum, maximum: runtime.maximum },
      billedRuntimeMilliseconds: { minimum: minimumRuntime, maximum: maximumRuntime },
      microsPerSecond: rate,
      billingIncrementMilliseconds: increment,
      minimumBillableMilliseconds: minimum,
    },
  };
}

export function isQuoteStale(quote: CostQuote, now: Date | string | number = new Date()): boolean {
  const instant = now instanceof Date ? now.getTime() : typeof now === "string" ? Date.parse(now) : now;
  if (!Number.isFinite(instant)) throw new Error("now must be a valid date");
  return instant >= Date.parse(quote.expiresAt);
}
