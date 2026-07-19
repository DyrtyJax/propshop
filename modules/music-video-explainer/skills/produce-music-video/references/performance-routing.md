# Performance routing memory

Use this as dated failure memory, not a provider ranking. Verify current model documentation, supported subjects, prices, and terms before spending.

## Select by constraint

Start with the shot's hardest requirement: nonhuman anatomy, identity continuity, phoneme accuracy, body motion, camera motion, duration, resolution, or editability. A model that wins one dimension may fail another.

Prefer the agent's built-in capability when it already meets the requirement. Add an external model only for a specific missing capability.

## Cheap spike before scale

Test two to four seconds containing:

- rapid consonants and a sustained vowel;
- the intended face angle and any prop near the mouth;
- representative camera and body motion;
- the actual character species and realism target.

Inspect at normal speed and frame-by-frame. Reject unwanted text, face replacement, muzzle deformation, frozen eyes, identity drift, extra cuts, audio leakage, or framing changes. Ask for human promotion when candidates differ mainly by performance or taste.

## Nonhuman faces

Human-avatar lip-sync models may reject animal faces or force them toward human/cartoon anatomy. Do not infer support from a marketing example.

Observed in the July 2026 Off the Rails experiment:

- `kwaivgi/kling-lip-sync` rejected a raccoon because it did not detect a human face;
- `pixverse/lipsync` accepted the same nonhuman performance footage;
- `kwaivgi/kling-avatar-v2` rendered a raccoon but hallucinated pseudo-caption glyphs in every tested take.

These observations are not permanent truths. They justify a species-specific spike and output inspection, not a universal default.

## Recovery after failure

Do not repeat a failed route automatically. Report:

1. what failed and whether it was billed;
2. the remaining budget;
3. the cheapest honest fallback;
4. what visual or creative tradeoff the fallback introduces.

Cropping can hide unwanted glyphs but may destroy composition. Prefer a provider change, a different source shot, deterministic cleanup, or an explicit human-approved crop based on the actual defect.

Strip or mute generated clip audio before assembling against a canonical master unless the generated audio is intentionally part of the piece.
