# Open vector backend field guide

Snapshot: July 2026. Separate code, model-weight, training-data, service, and generated-output terms before production use.

| Backend | Best use | Strengths | Shortcomings |
| --- | --- | --- | --- |
| [QuiverAI Arrow](https://docs.quiver.ai/api) | Hosted text-to-SVG and vectorization | Native editable SVG API, reference images, explicit viewBox, multiple fidelity/cost tiers, request credit accounting | Closed hosted models, credit cost, no public seed control, public-beta API |
| [StarVector](https://github.com/joanrod/star-vector) | Local text/image-to-SVG baseline | Apache-2.0 project, 1B/8B paths, code-native SVG, HF and vLLM inference | Older 2025 baseline, GPU/Python stack, model wrappers need production hardening |
| [InternSVG](https://github.com/hmwang2002/InternSVG) | Unified SVG understanding/editing/generation | ICLR 2026, Apache-2.0 repository, 8B model, icons through long illustrations and animation | Young integration surface, heavy deployment, only a small public commit history so far |
| [IntroSVG](https://arxiv.org/abs/2603.09312) | Render-feedback research | Generator/critic correction loop targets the exact failure mode of plausible code with poor rendering | Research workflow rather than a compact production server |
| [OpenPencil](https://github.com/open-pencil/open-pencil) | Editable design workshop and export | MIT, headless CLI, MCP, Figma/Pencil document support, SVG export, linting and design analysis | Excellent editor/framework, not itself a one-shot SVG foundation model |
| [Iconify](https://github.com/iconify/iconify) | Retrieval before generation | Huge normalized open icon ecosystem with license metadata and very strict cleanup | Finds existing icon vocabulary rather than inventing bespoke illustrations or marks |
| [SVGO](https://github.com/svg/svgo) | Deterministic optimization | Mature Node API/CLI, broad optimization plugin surface | Optimization is not sanitization or visual QA; pin versions/config because transformations can change semantics |

## Recommended routing

1. Search a licensed icon corpus before generating a generic UI symbol.
2. Use Quiver when native hosted SVG quality and rapid iteration matter most.
3. Wrap StarVector or InternSVG behind `svg-command` when local control, open weights, or custom fine-tuning matter more.
4. Use OpenPencil as an optional human/agent editing station between generated raw SVG and final promotion.
5. Keep inspection and policy in PropShop so every route faces the same safety and production constraints.

The next serious quality step is render-in-the-loop comparison: rasterize each take in an isolated renderer, produce a contact sheet, measure clipping/empty-space/salience, and let a vision critic advise—not automatically decide—which take deserves human promotion.
