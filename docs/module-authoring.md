# Authoring modules that help without taking over

A PropShop module should increase an agent's option set. It should not replace a capable agent's taste, force a provider, or turn a creative task into compliance theater.

## The prop-department test

Ask what the module knows that a frontier agent is unlikely to know reliably:

- provider-specific failure modes;
- fragile media preparation or finishing steps;
- current pricing and capability boundaries;
- domain-specific quality checks;
- reusable editable assets;
- rights, provenance, and publication constraints;
- moments where a practitioner would ask the client to choose.

Remove generic planning advice, mandatory shot grammar, fixed model choices, and scaffolding the agent can already create better itself.

## Match freedom to fragility

- **High freedom:** creative direction, model selection, visual language, performance, editing, and humor.
- **Medium freedom:** optional recipes, provider-routing heuristics, review packets, and contract examples.
- **Low freedom:** hashing, budget enforcement, media normalization, schema checks, decoding, and destructive or expensive operations.

Default to the highest freedom that is safe for the decision.

## Human decisions are part of the interface

Creative skills should pause at a few high-leverage moments when a human is available:

1. a taste choice will fan out into expensive downstream work;
2. viable candidates differ subjectively;
3. a cheap spike is ready before a paid batch;
4. rights, factual framing, or publication risk needs owner judgment;
5. a rough cut is ready before final-quality generation.

Do not ask about reversible mechanical choices. Combine gates for small work, and honor explicit user delegation.

At a gate, provide the decision, candidate artifacts, recommendation, concise rationale, spend, remaining budget, tradeoffs, and next action. Record whether the outcome was `human-selected` or `agent-selected`; never manufacture approval.

In a noninteractive run, save a resumable decision packet and stop before an undelegated expensive branch. Visible progress means actions, artifacts, uncertainties, costs, and recommendations—not raw private chain-of-thought.

Declare the expected behavior in the module manifest when useful:

```yaml
skills:
  - name: produce-music-video
    path: skills/produce-music-video
    interaction: checkpointed
```

Use `autonomous` for skills that normally run through, `adaptive` when the skill decides whether review helps, and `checkpointed` when human promotion is an intentional part of the workflow.

## Work as branches, not monoliths

Take cues from established creative tools:

- [ComfyUI partial execution](https://docs.comfy.org/interface/features/partial-execution) reruns only the branch leading to a chosen preview or save output and preserves workflow history.
- [ACE-Step](https://github.com/ace-step/ACE-Step) separates generation, retake, repaint, edit, and extend around a selected source track.
- [LTX-Video](https://github.com/Lightricks/LTX-Video) exposes fast iteration and higher-quality paths plus explicit conditioning inputs.
- [Remotion's official skill](https://github.com/remotion-dev/skills/blob/main/skills/remotion/SKILL.md) recommends timeline preview and inexpensive still checks before a full render.

A module should likewise preserve stable candidate IDs, immutable inputs, partial reruns, cheap previews, explicit promotion, and replaceable tools.

## Separate contracts from recipes

Contracts describe durable outcomes: media shape, timing, facts, budget, provenance, approvals, and quality policy. Recipes describe one possible implementation.

- Keep contracts provider-neutral.
- Keep recipes optional and clearly named.
- Never make a mutable model alias part of a stable public capability.
- Do not bundle a large framework template into a broad creative skill unless the user explicitly selected that framework.
- Prefer small deterministic scripts over a prescriptive end-to-end pipeline.

## Validate outcomes

Useful gates inspect the produced artifact:

- full decode succeeds;
- timing and streams match the contract;
- audio true peak and silence are intentional;
- typography is readable at actual playback size;
- factual claims map to sources;
- generated text and accidental brands are absent;
- identity and anatomy survive processing;
- the user can watch, listen, compare, and promote candidates.

Schema validity is not creative quality. A module should say what it cannot judge.

## Anti-patterns

- “Always use model X.”
- “Generate exactly two takes” without adapting to price, quality, or the user's decision.
- A fixture whose shot structure silently becomes the production template.
- A bundled compositor presented as the canonical runtime.
- A headless run that hides all progress until the final reveal.
- Exhaustive ledgers paired with weak artifact QA.
- Claiming a human reviewed or listened when none did.

The best module leaves the agent more capable and the human more involved at the moments that matter—without either one feeling managed by the module.
