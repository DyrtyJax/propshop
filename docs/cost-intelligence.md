# The Till: cost intelligence

PropShop treats price as provenance, not marketing copy. A route can be inexpensive, expensive, locally run, or unknowable. The Till preserves what is known, where it came from, when it expires, and what assumptions produced the range.

The design does not assume generation is deterministic. Models can make better creative decisions than a built-in asset generator, provider runtimes vary, and retries may produce different work. PropShop's durable guarantees are preflight guardrails plus preserved, hashed artifacts and reconciled provider charges—not identical regeneration.

## Money and confidence

USD values are stored as integer micros (`$1 = 1_000_000 micros`). Provider-native credits are separate integer ranges. A credit is never treated as a dollar unless the provider publishes an authoritative conversion.

Every quote has one confidence label:

- `exact`: a fixed per-operation USD price from current evidence;
- `bounded`: an authoritative minimum and maximum;
- `estimated`: a range based on tokens, runtime, or measured behavior;
- `unknown`: no defensible USD bound exists;
- `local`: zero provider charge; hardware, electricity, and operator time are explicitly excluded.

Every quote also records the provider, model and optional revision, variants, source type and URL, fetch and expiry timestamps, and calculation assumptions. `official-price-page` and `live-provider-api` evidence requires a URL. An expired quote is stale; its old amount remains visible, but strict builds reject it unless stale evidence is explicitly allowed.

## Pricing shapes

`quoteFromPricingSpec` supports the common billing models without collapsing all of them into a fake exact number:

```ts
import { quoteFromPricingSpec } from "propshop/dist/cost/index.js";

const quote = quoteFromPricingSpec({
  kind: "runtime",
  provider: "gpu-host",
  model: "org/open-vector-model",
  revision: "sha256:...",
  microsPerSecond: 225,
  estimatedRuntimeMilliseconds: { minimum: 5_000, maximum: 30_000 },
  billingIncrementMilliseconds: 1_000,
  source: {
    type: "official-price-page",
    url: "https://provider.example/pricing",
  },
  fetchedAt: "2026-07-18T20:00:00.000Z",
  expiresAt: "2026-07-19T20:00:00.000Z",
}, { variants: 4 });
```

Available specifications are:

- `flat`: fixed or bounded cost per take;
- `credits`: provider credits, with an optional authoritative USD conversion;
- `tokens`: exact token rates applied to estimated input/output token ranges;
- `runtime`: exact hardware rate applied to estimated, increment-rounded runtime;
- `local`: zero external provider charge with exclusions;
- `unknown`: an honest reason rather than a fabricated price.

The in-memory `PricingRegistry` resolves the most specific provider/model/revision/capability entry. Registry entries are timestamped observations. Network fetching and cache refresh belong in provider integrations, making the cost math deterministic and independently testable.

## Budgets fail before generation

A Propfile may declare strict provider-cost guardrails:

```yaml
budget:
  maxTotalMicros: 20000    # $0.02 for the selected build
  maxPerTakeMicros: 5000   # $0.005 per take
  allowUnknown: false
  allowStale: false
  onExceeded: fail
```

The execution order is important:

```text
resolve routes → quote every selected prop → assertBudget → call providers → preserve artifacts → reconcile actual cost
```

`assertBudget(quotes, policy)` uses quoted upper bounds. Unknown and stale prices fail closed by default. If explicitly allowed, the build may proceed but the decision retains warnings. A missing price never counts as zero, and a cheap route never silently falls back to a more expensive route.

## Reconciliation

After a provider responds, `reconcileCost` records the provider-reported USD micros and/or native credits alongside the immutable quote. Actual usage may land below or above an estimated range; that is recorded as `below-quote`, `within-quote`, or `above-quote` rather than rewritten away.

Runtime-backed hosts should record measured billable runtime. Token hosts should record actual input and output tokens. Credit providers should preserve the debit in its native unit even if no trustworthy USD conversion is available. The run ledger should retain both quote and actual cost with the provider job ID.

This allows useful reporting without false precision:

```text
gpu-host/org/open-vector-model: $0.0045–$0.027 total for 4 takes [ESTIMATED]
Quoted: $0.0045–$0.027
Actual: $0.0182 (80.9 billable seconds)
Evidence: official price page, fetched 2026-07-18
```

## Provider integration checklist

An adapter or pricing plugin should:

1. prefer the model author's direct API or published weights;
2. pin model identity and revision separately from the execution host;
3. obtain prices from an authenticated provider API or official page when possible;
4. give evidence a short, explicit expiry;
5. use measured p50/p95 runtime for hosted open models and label the result `estimated`;
6. record actual provider usage after generation;
7. never serialize credentials, billing tokens, or signed URLs into a quote;
8. return `unknown` when it cannot make a defensible claim.

Cost confidence and output-quality confidence are independent. A brilliant model may have uncertain runtime cost; a fixed-price model may still produce an unhelpful asset. PropShop should expose both facts and let the user—or a more capable future agent—exercise judgment.
