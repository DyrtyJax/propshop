---
name: produce-music-video
description: Help produce original AI-assisted music videos, performance clips, and factual visual sequences by supplying optional production props, provider failure memory, sparse human-review checkpoints, media QA, budget/provenance helpers, and editable composition patterns. Use when an agent is directing, generating, assembling, reviewing, or repairing a music video—especially when music selection, character identity, nonhuman lip sync, factual graphics, expensive model calls, or a final human watch/listen matter.
---

# Produce a music video

Act as the prop department, not the director. Preserve the agent's creative judgment and the user's taste. Supply hard-won knowledge, inspection tools, and reusable parts only where they improve the work.

Do not default to a provider, model, shot grammar, take count, or composition framework. If the agent can produce an asset better with its own capabilities, let it. Treat every bundled script and reference as optional.

## Keep the work visible

At each stage boundary, tell the user what exists, what changed, what was spent, what is uncertain, and what happens next. Show concise decision rationale and playable or viewable artifacts; do not dump private chain-of-thought or hide behind a final reveal.

Maintain a short `STATUS.md` or equivalent production record when work spans multiple calls or sessions. Preserve candidates instead of overwriting them.

## Invite the right human decisions

Read [references/decision-gates.md](references/decision-gates.md) before a paid or multi-stage production.

Pause when taste has large downstream consequences, a paid branch is about to scale, two viable candidates differ subjectively, rights or factual framing need owner judgment, or a defect requires a quality/budget tradeoff. Combine gates for short proofs; do not ask about mechanical choices.

Unless the user already delegated the decision, offer a recommendation and two or three concrete choices at these natural moments:

1. direction and hook;
2. music take and usable lyric window;
3. performer identity or visual system;
4. a short motion/lip-sync spike before full generation;
5. the rough cut before final-quality renders.

Use `scripts/create-review-pack.mjs` to make a resumable decision packet. In a noninteractive run, save the packet and stop cleanly at an undelegated gate. If the user explicitly requests autonomous completion, record the agent-selected choice and continue.

## Work in replaceable branches

Build only the branch needed for the next decision. Reuse approved artifacts and rerun changed branches rather than restarting the production.

- Generate cheap demos before finals.
- Lock a hero reference before multiplying performance shots.
- Test two to four difficult seconds before buying a long lip-sync render.
- Assemble a low-resolution or placeholder rough cut before final generation.
- Keep factual text, maps, charts, citations, and typography editable.

For current routing cautions, read [references/performance-routing.md](references/performance-routing.md). Re-check provider capabilities and pricing before paid work because model behavior changes.

## Reach for props selectively

- **Human review packet:** `scripts/create-review-pack.mjs`
- **Media integrity, contact sheet, and audio peak check:** `scripts/inspect-media.mjs`
- **Exact master/vocal normalization and clip extraction:** `scripts/prepare-audio.mjs`
- **Optional factual and timing contracts:** `schemas/fact-pack.schema.json`, `schemas/shot-manifest.schema.json`, and `scripts/validate-production.mjs`

Read [references/contracts.md](references/contracts.md) only when exact timing or factual claims justify structured contracts. Read [references/quality-gates.md](references/quality-gates.md) before promoting a rough cut or final.

Choose FFmpeg, Remotion, Revideo, Blender, a nonlinear editor, ComfyUI, or another runtime based on the production. No compositor is privileged by this skill.

## Non-negotiable guardrails

- Quote an upper cost bound before each paid call and never silently exceed the approved budget.
- Do not silently switch providers after a failure; expose the failure, price, and proposed fallback.
- Do not trust generated footage to spell factual or branded text. Reject, repair, or deliberately reframe unwanted glyphs.
- Never claim lip sync, identity continuity, factual accuracy, or audio quality is flawless without inspection.
- Keep the canonical master audio authoritative unless the creative plan explicitly changes it.
- Preserve provider IDs, prompts, hashes, spend, retries, source rights, and human or agent selections.
- Require a human watch and listen before publication whenever a human is available.

The finished artifact matters more than schema compliance. Validation can prevent known failures; it cannot supply taste.
