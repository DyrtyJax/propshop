import { isQuoteStale } from "./quote.js";
import type { CostAggregate, CostQuote, MoneyRange } from "./types.js";

/** Parse a CLI/YAML decimal without passing money through floating-point arithmetic. */
export function parseUsdToMicros(value: string): number {
  const match = value.trim().match(/^\$?(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error("USD value must be a non-negative decimal with at most 6 fractional digits");
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(6, "0"));
  const micros = whole * 1_000_000 + fraction;
  if (!Number.isSafeInteger(micros)) throw new Error("USD value exceeds safe integer precision");
  return micros;
}

export function formatMicros(micros: number): string {
  if (!Number.isSafeInteger(micros) || micros < 0) throw new Error("micros must be a non-negative safe integer");
  if (micros === 0) return "$0";
  if (micros >= 10_000) return `$${(micros / 1_000_000).toFixed(2)}`;
  if (micros >= 1_000) return `$${(micros / 1_000_000).toFixed(3)}`;
  return `$${(micros / 1_000_000).toFixed(6).replace(/0+$/, "")}`;
}

export function formatMoneyRange(value: MoneyRange): string {
  const minimum = formatMicros(value.minimumMicros);
  const maximum = formatMicros(value.maximumMicros);
  return minimum === maximum ? minimum : `${minimum}–${maximum}`;
}

/** Compact, single-line output suitable for `propshop quote` and setup tables. */
export function formatQuote(quote: CostQuote, now: Date | string | number = new Date()): string {
  const amount = quote.total ? formatMoneyRange(quote.total) : "USD unknown";
  const credits = quote.credits
    ? `; ${quote.credits.total.minimumCredits === quote.credits.total.maximumCredits
      ? quote.credits.total.minimumCredits
      : `${quote.credits.total.minimumCredits}–${quote.credits.total.maximumCredits}`} ${quote.credits.total.unit}`
    : "";
  const stale = isQuoteStale(quote, now) ? "; STALE" : "";
  return `${quote.provider}/${quote.model.id}: ${amount} total for ${quote.variants} take${quote.variants === 1 ? "" : "s"} [${quote.confidence.toUpperCase()}${stale}]${credits}`;
}

export function formatAggregate(aggregate: CostAggregate): string {
  const priced = formatMoneyRange(aggregate.knownTotal);
  const qualifier = aggregate.complete ? "total" : "known subtotal";
  const suffix = [
    aggregate.unknownQuotes ? `${aggregate.unknownQuotes} unknown` : undefined,
    aggregate.staleQuotes ? `${aggregate.staleQuotes} stale` : undefined,
  ].filter(Boolean).join(", ");
  return `${priced} ${qualifier} for ${aggregate.variants} take${aggregate.variants === 1 ? "" : "s"} [${aggregate.confidence.toUpperCase()}${suffix ? `; ${suffix}` : ""}]`;
}
