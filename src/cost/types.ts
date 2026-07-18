import type { JsonValue } from "../types.js";

/** One US dollar is exactly 1,000,000 micros. No floating-point money is stored. */
export interface MoneyRange {
  currency: "USD";
  minimumMicros: number;
  maximumMicros: number;
}

/** Provider-native credits are kept alongside money rather than silently converted. */
export interface CreditRange {
  unit: string;
  minimumCredits: number;
  maximumCredits: number;
}

export type CostConfidence = "exact" | "bounded" | "estimated" | "unknown" | "local";

export type CostSourceType =
  | "live-provider-api"
  | "official-price-page"
  | "provider-reported"
  | "measured-runtime"
  | "user-configured"
  | "local-runtime"
  | "unknown";

export interface CostSource {
  type: CostSourceType;
  url?: string;
  description?: string;
}

export interface CostQuote {
  schemaVersion: 1;
  provider: string;
  capability?: string;
  model: {
    id: string;
    revision?: string;
  };
  variants: number;
  perTake?: MoneyRange;
  total?: MoneyRange;
  credits?: {
    perTake: CreditRange;
    total: CreditRange;
    /** Present only when the provider publishes a stable USD conversion. */
    microsPerCredit?: number;
  };
  confidence: CostConfidence;
  source: CostSource;
  fetchedAt: string;
  expiresAt: string;
  assumptions: Record<string, JsonValue>;
}

export interface IntegerRange {
  minimum: number;
  maximum: number;
}

interface PricingSpecBase {
  provider: string;
  capability?: string;
  model: string;
  revision?: string;
  source: CostSource;
  fetchedAt: string;
  expiresAt: string;
  assumptions?: Record<string, JsonValue>;
}

export interface FlatPricingSpec extends PricingSpecBase {
  kind: "flat";
  perTakeMicros: IntegerRange;
}

export interface CreditPricingSpec extends PricingSpecBase {
  kind: "credits";
  creditUnit: string;
  perTakeCredits: IntegerRange;
  /** Omit when a credit has no authoritative fixed USD value. */
  microsPerCredit?: number;
}

export interface TokenPricingSpec extends PricingSpecBase {
  kind: "tokens";
  inputMicrosPerMillionTokens: number;
  outputMicrosPerMillionTokens: number;
  estimatedInputTokens: IntegerRange;
  estimatedOutputTokens: IntegerRange;
}

export interface RuntimePricingSpec extends PricingSpecBase {
  kind: "runtime";
  microsPerSecond: number;
  estimatedRuntimeMilliseconds: IntegerRange;
  /** Provider billing increments; for example 1,000 means whole seconds. */
  billingIncrementMilliseconds?: number;
  minimumBillableMilliseconds?: number;
}

export interface LocalPricingSpec extends PricingSpecBase {
  kind: "local";
  /** Optional reminder that electricity and owned hardware are outside provider cost. */
  note?: string;
}

export interface UnknownPricingSpec extends PricingSpecBase {
  kind: "unknown";
  reason: string;
}

export type PricingSpec =
  | FlatPricingSpec
  | CreditPricingSpec
  | TokenPricingSpec
  | RuntimePricingSpec
  | LocalPricingSpec
  | UnknownPricingSpec;

export interface QuoteRequest {
  variants: number;
  capability?: string;
  model?: string;
  revision?: string;
  assumptions?: Record<string, JsonValue>;
}

export interface BudgetPolicy {
  maxTotalMicros?: number;
  maxPerTakeMicros?: number;
  allowUnknown: boolean;
  allowStale: boolean;
  onExceeded: "fail";
}

export interface CostAggregate {
  currency: "USD";
  quotes: number;
  variants: number;
  complete: boolean;
  knownTotal: MoneyRange;
  total?: MoneyRange;
  confidence: CostConfidence;
  staleQuotes: number;
  unknownQuotes: number;
  credits: CreditRange[];
}

export interface BudgetDecision {
  allowed: boolean;
  aggregate: CostAggregate;
  errors: string[];
  warnings: string[];
}

export interface ActualCost {
  provider: string;
  model?: { id: string; revision?: string };
  amount?: { currency: "USD"; micros: number };
  credits?: { unit: string; credits: number };
  source: CostSource;
  measuredAt: string;
  providerJobId?: string;
  usage?: Record<string, JsonValue>;
}

export interface CostReconciliation {
  quote: CostQuote;
  actual: ActualCost;
  status: "within-quote" | "below-quote" | "above-quote" | "unpriced" | "credits-only";
  deltaFromMaximumMicros?: number;
  notes: string[];
}
