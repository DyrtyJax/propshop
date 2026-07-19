import { isQuoteStale } from "./quote.js";
import type {
  BudgetDecision,
  BudgetPolicy,
  CostAggregate,
  CostConfidence,
  CostQuote,
  CreditRange,
  MoneyRange,
} from "./types.js";

export const DEFAULT_BUDGET_POLICY: BudgetPolicy = {
  allowUnknown: false,
  allowStale: false,
  onExceeded: "fail",
};

function sumRanges(ranges: MoneyRange[]): MoneyRange {
  return {
    currency: "USD",
    minimumMicros: ranges.reduce((sum, value) => sum + value.minimumMicros, 0),
    maximumMicros: ranges.reduce((sum, value) => sum + value.maximumMicros, 0),
  };
}

function aggregateCredits(quotes: CostQuote[]): CreditRange[] {
  const totals = new Map<string, CreditRange>();
  for (const quote of quotes) {
    if (!quote.credits) continue;
    const current = totals.get(quote.credits.total.unit);
    totals.set(quote.credits.total.unit, {
      unit: quote.credits.total.unit,
      minimumCredits: (current?.minimumCredits ?? 0) + quote.credits.total.minimumCredits,
      maximumCredits: (current?.maximumCredits ?? 0) + quote.credits.total.maximumCredits,
    });
  }
  return [...totals.values()].sort((left, right) => left.unit.localeCompare(right.unit));
}

function aggregateConfidence(quotes: CostQuote[]): CostConfidence {
  if (quotes.length > 0 && quotes.every((quote) => quote.confidence === "local")) return "local";
  if (quotes.some((quote) => quote.confidence === "unknown")) return "unknown";
  if (quotes.some((quote) => quote.confidence === "estimated")) return "estimated";
  if (quotes.some((quote) => quote.confidence === "bounded")) return "bounded";
  return "exact";
}

export function aggregateQuotes(
  quotes: CostQuote[],
  now: Date | string | number = new Date(),
): CostAggregate {
  const priced = quotes.flatMap((quote) => (quote.total ? [quote.total] : []));
  const complete = priced.length === quotes.length;
  const knownTotal = sumRanges(priced);
  return {
    currency: "USD",
    quotes: quotes.length,
    variants: quotes.reduce((sum, quote) => sum + quote.variants, 0),
    complete,
    knownTotal,
    ...(complete ? { total: knownTotal } : {}),
    confidence: aggregateConfidence(quotes),
    staleQuotes: quotes.filter((quote) => isQuoteStale(quote, now)).length,
    unknownQuotes: quotes.filter((quote) => !quote.total).length,
    credits: aggregateCredits(quotes),
  };
}

export function evaluateBudget(
  quotes: CostQuote[],
  policy: BudgetPolicy,
  now: Date | string | number = new Date(),
): BudgetDecision {
  const aggregate = aggregateQuotes(quotes, now);
  const errors: string[] = [];
  const warnings: string[] = [];
  const stale = quotes.filter((quote) => isQuoteStale(quote, now));
  const unknown = quotes.filter((quote) => !quote.total);

  if (stale.length > 0) {
    const message = `${stale.length} price quote${stale.length === 1 ? " is" : "s are"} stale`;
    (policy.allowStale ? warnings : errors).push(message);
  }
  if (unknown.length > 0) {
    const message = `${unknown.length} quote${unknown.length === 1 ? " has" : "s have"} unknown USD cost`;
    (policy.allowUnknown ? warnings : errors).push(message);
  }
  if (policy.maxPerTakeMicros !== undefined) {
    for (const quote of quotes) {
      if (quote.perTake && quote.perTake.maximumMicros > policy.maxPerTakeMicros) {
        errors.push(
          `${quote.provider}/${quote.model.id} can cost ${quote.perTake.maximumMicros}µ per take, above ${policy.maxPerTakeMicros}µ`,
        );
      }
    }
  }
  if (
    policy.maxTotalMicros !== undefined &&
    aggregate.knownTotal.maximumMicros > policy.maxTotalMicros
  ) {
    errors.push(
      `quoted maximum ${aggregate.knownTotal.maximumMicros}µ exceeds total budget ${policy.maxTotalMicros}µ`,
    );
  }
  return { allowed: errors.length === 0, aggregate, errors, warnings };
}

export class BudgetExceededError extends Error {
  readonly decision: BudgetDecision;

  constructor(decision: BudgetDecision) {
    super(`Cost policy blocked generation: ${decision.errors.join("; ")}`);
    this.name = "BudgetExceededError";
    this.decision = decision;
  }
}

/** Call after quote resolution and before adapter check/generate makes a provider request. */
export function assertBudget(
  quotes: CostQuote[],
  policy: BudgetPolicy,
  now: Date | string | number = new Date(),
): BudgetDecision {
  const decision = evaluateBudget(quotes, policy, now);
  if (!decision.allowed && policy.onExceeded === "fail") throw new BudgetExceededError(decision);
  return decision;
}
