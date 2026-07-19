# Human decision gates

Creative workflows work best as resumable branches with a few high-leverage human promotions. Do not turn every parameter into a question.

## Pause when

- a taste decision will fan out into many expensive assets;
- two or three viable candidates differ subjectively;
- a cheap spike is ready before a paid batch;
- rights, factual framing, brand use, or publication risk needs owner judgment;
- a defect forces a quality, budget, or schedule tradeoff;
- the rough cut is coherent enough that feedback will be cheaper than more generation.

Continue autonomously through reversible mechanical work, factual research, format conversion, hashing, low-cost diagnostics, and decisions the user explicitly delegated.

## Default music-video moments

Combine or skip these based on scope:

1. **Direction:** two or three treatments, each with hook, visual premise, and cost shape.
2. **Music:** short playable takes and the proposed lyric window.
3. **Identity:** performer reference, palette, typography, and realism target.
4. **Motion spike:** two to four representative seconds before full performance generation.
5. **Rough cut:** low-resolution edit with placeholders before final-quality calls.
6. **Publication:** a final human watch/listen and explicit release decision.

For a short proof, direction+music and identity+motion may be combined. For a high-cost production, keep them separate.

## Decision packet

Present:

- the single decision needed now;
- why it matters at this moment;
- two or three playable/viewable candidates with stable IDs;
- the agent's recommendation and concise rationale;
- spend to date, remaining budget, and the next call's upper bound;
- the consequences of each choice;
- what will happen after selection.

Use `scripts/create-review-pack.mjs` to preserve this information. The human may select a candidate, combine directions, reject all candidates, or delegate the choice back to the agent.

Do not expose raw private chain-of-thought. Transparency means visible actions, evidence, uncertainty, costs, recommendations, and artifacts.

## Noninteractive runs

If the user did not delegate the decision and no interactive channel exists:

1. finish the reversible work needed for the choice;
2. write the review packet;
3. stop before the expensive or irreversible branch;
4. explain how to resume from the preserved state.

If the user explicitly requested autonomous completion, record `agent-selected` with the recommendation and continue. Never pretend a human approved it.

## Public workflow patterns

These projects inform the protocol without becoming dependencies:

- ComfyUI runs only the branch leading to a selected preview/save output and keeps workflow history: https://docs.comfy.org/interface/features/partial-execution
- ACE-Step separates generate, retake, repaint, edit, and extend around a chosen source audio: https://github.com/ace-step/ACE-Step
- LTX exposes fast/distilled and higher-quality paths plus explicit conditioning inputs: https://github.com/Lightricks/LTX-Video
- Remotion supports timeline preview and inexpensive one-frame checks before full render: https://github.com/remotion-dev/skills/blob/main/skills/remotion/SKILL.md

PropShop should preserve the same virtues: visible state, partial reruns, cheap previews, human promotion, and replaceable tools.
