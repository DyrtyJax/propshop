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
