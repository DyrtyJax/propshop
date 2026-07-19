# Off the Rails — identical-prompt Fable test

This is a two-run production test, not a leaderboard. It asks whether attaching one specialist PropShop module changes what a general creative coding agent can actually finish.

## Prepare two clean projects

Give both projects the same available credentials, starting budget, machine access, and copy of `PROMPT.md`. Do not reuse artifacts or intermediate reasoning between runs.

In the framework project only, dock the module before starting Fable:

```bash
propshop module attach ../../modules/music-video-explainer \
  --agent claude \
  --project /path/to/off-the-rails-with-propshop
```

Do not mention PropShop in the prompt and do not explicitly tell Fable to invoke the installed skill. The production request itself should trigger it. The scratch project receives no skill, fixture, or workflow hints.

Start a fresh Fable task in each project and paste the exact contents of `PROMPT.md`. Confirm both prompt files have the same hash before starting:

```bash
shasum -a 256 /path/to/scratch/PROMPT.md /path/to/with-propshop/PROMPT.md
```

After both runs finish, inspect what exists rather than what was promised: playable video, source project, lip-sync quality, character continuity, factual sourcing, editable graphics, reproducibility, provider history, and actual spend. The interesting result is which missing production knowledge the module supplied—and which parts still belong in the agent or model rather than PropShop.

## July 2026 result

The scratch arm produced the stronger film. It invented a memorable performer, prop, hook, visual system, provider fallback, editable map, budget ledger, and deterministic assembly without the module. The attached arm correctly discovered and followed the skill, but the prescribed Kling/Revideo/two-take workflow narrowed its shot language, added substantial orchestration overhead, and produced a more corporate result. Its artifact ledger was thorough while final audio still exceeded a publish-safe true-peak warning threshold.

The experiment falsified the first module design. The reworked module now follows a prop-department model:

- provider and composition choices are optional;
- fixtures no longer anchor the production's shot grammar;
- short representative spikes precede expensive batches;
- artifact quality gates include audio true peak and generated-glyph inspection;
- a few human decision packets appear before taste-defining or expensive branches;
- explicit user delegation still permits autonomous completion.

The target is not to outperform the agent's creativity. It is to contribute practitioner memory at the moment it matters without flattening that creativity.
