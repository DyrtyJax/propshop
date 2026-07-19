import type { ActualCost, CostQuote, CostReconciliation } from "./types.js";

function validateActual(actual: ActualCost): void {
  if (!actual.amount && !actual.credits) throw new Error("actual cost requires an amount or credits");
  if (actual.amount && (!Number.isSafeInteger(actual.amount.micros) || actual.amount.micros < 0)) {
    throw new Error("actual amount must use non-negative integer micros");
  }
  if (actual.credits && (!Number.isSafeInteger(actual.credits.credits) || actual.credits.credits < 0)) {
    throw new Error("actual credits must be a non-negative integer");
  }
  if (!Number.isFinite(Date.parse(actual.measuredAt))) throw new Error("measuredAt must be an ISO timestamp");
}

/** Reconciliation records surprises; it never rewrites the original quote. */
export function reconcileCost(quote: CostQuote, actual: ActualCost): CostReconciliation {
  validateActual(actual);
  if (actual.provider !== quote.provider) throw new Error("actual cost provider does not match quote provider");
  const notes: string[] = [];
  if (actual.credits && quote.credits && actual.credits.unit !== quote.credits.total.unit) {
    notes.push(`actual credit unit ${actual.credits.unit} differs from quoted ${quote.credits.total.unit}`);
  } else if (actual.credits && quote.credits) {
    if (actual.credits.credits > quote.credits.total.maximumCredits) {
      notes.push("actual provider credit debit exceeded the quoted upper bound");
    } else if (actual.credits.credits < quote.credits.total.minimumCredits) {
      notes.push("actual provider credit debit was below the quoted lower bound");
    }
  }
  if (!actual.amount) {
    return { quote, actual, status: actual.credits ? "credits-only" : "unpriced", notes };
  }
  if (!quote.total) {
    return { quote, actual, status: "unpriced", notes: [...notes, "quote had no USD range"] };
  }
  const micros = actual.amount.micros;
  const deltaFromMaximumMicros = micros - quote.total.maximumMicros;
  const status =
    micros < quote.total.minimumMicros
      ? "below-quote"
      : micros > quote.total.maximumMicros
        ? "above-quote"
        : "within-quote";
  if (status === "above-quote") notes.push("actual provider charge exceeded the quoted upper bound");
  if (status === "below-quote") notes.push("actual provider charge was below the quoted lower bound");
  return { quote, actual, status, deltaFromMaximumMicros, notes };
}
