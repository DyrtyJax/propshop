# Open audio backend field guide

Snapshot: July 2026. This is a routing guide, not a claim that every model listed is suitable for commercial use. Verify current code, weight, dataset, and dependency terms before promotion.

The audio.cpp integration was checked against upstream commit `670d00a023128e65dd474fd1db6c603e8cd3be9b`; that runtime is moving quickly, so treat the commit as part of the research record rather than a permanent compatibility promise.

| Backend | Best use | Strengths | Shortcomings / license posture |
| --- | --- | --- | --- |
| [audio.cpp](https://github.com/0xShug0/audio.cpp) | Shared local runtime | Native C++/ggml; CLI and HTTP; CPU/CUDA/Vulkan/Metal; Stable Audio, ACE-Step, speech, separation; seeds, inspection, batch requests | Created June 2026 and changing quickly. CUDA is best-tested. Server lacks auth/cancellation/queue control. Apache runtime, but loaded models retain separate terms. |
| [Stable Audio 3](https://github.com/Stability-AI/stable-audio-3) | Production SFX baseline and audio editing | Dedicated Small-SFX model, 44.1 kHz stereo, audio-to-audio, continuation, inpainting, multiple runtimes | Weights are gated under Stability Community/Gemma terms, including a commercial revenue threshold; not an unconditional open-model default. |
| [MOSS-SoundEffect v2](https://github.com/OpenMOSS/MOSS-TTS/tree/main/moss_soundeffect_v2) | Permissive specialist SFX | 48 kHz, English/Chinese, up to 30 seconds, Apache-2.0 repository/model posture; community [MLX port](https://github.com/xocialize/moss-soundeffect-mlx) | New and lightly battle-tested; Python/NVIDIA-first upstream, heavier default inference, no documented editing or loop workflow. |
| [Dasheng-AudioGen](https://github.com/xiaomi-research/dasheng-audiogen) | Structured mixed scenes | Speech, transcript, SFX, music, and ambience in one structured prompt; Apache-2.0 | Brand new, limited operations evidence, thin deployment documentation, 16 kHz output. |
| [Woosh](https://github.com/SonyResearch/Woosh) | Research text/video-to-SFX | Purpose-built SFX and video conditioning; API server and distilled models | Weight license is noncommercial. No production editing or loop contract. |
| [HunyuanVideo-Foley](https://github.com/Tencent-Hunyuan/HunyuanVideo-Foley) | Video-synchronized Foley | Strong temporal Foley conditioning at 48 kHz | Custom license includes geographic and scale restrictions; significant GPU requirements; not a universal default. |
| [MMAudio](https://github.com/hkchengrex/MMAudio) | Lightweight video-to-audio baseline | Roughly 6 GB VRAM; established video/text conditioning | Weights are noncommercial and authors do not guarantee commercial suitability; fixed-duration bias and older model quality. |
| [ThinkSound](https://github.com/FunAudioLLM/ThinkSound) | Research audio reasoning/editing | Any-to-audio, object-centric refinement, interesting editing design | Complex dependency surface and research/education restrictions; useful inspiration, poor default adapter. |
| [ACE-Step 1.5](https://github.com/ACE-Step/ACE-Step-1.5) | Music | Strong multilingual music, covers, repaint, stems, layers, broad hardware/API surface; MIT | Not a general SFX model and does not promise seamless loops. |
| [AudioCraft / AudioGen](https://github.com/facebookresearch/audiocraft) | Historical environmental-audio baseline | Familiar Python API and continuation | Older stack, 16 kHz AudioGen path, noncommercial model weights, behind 2026 specialists. |
| [TangoFlux](https://github.com/declare-lab/TangoFlux) | Fast experimentation | Fast 44.1 kHz stereo generation; Python, CLI, ComfyUI, and hosted examples | Explicitly research/noncommercial due training-data and dependency terms. |

## Recommended stack

1. Use audio.cpp as the first local runtime driver, initially with Stable Audio Small SFX.
2. Add MOSS-SoundEffect v2 as the first permissively licensed specialist model path.
3. Keep hosted APIs as peers, not special cases: Replicate, fal, and vendor APIs should implement the same capability request and artifact contract.
4. Route ACE-Step to `audio.music.generate`; do not pretend one model serves every audio capability.
5. Keep Woosh, MMAudio, ThinkSound, and Hunyuan Foley explicitly opt-in with visible license restrictions.

## What PropShop must own

Models do not reliably provide a universal seamless-loop contract. PropShop should own deterministic post-processing and validation:

- decode/container validity;
- duration tolerance, sample rate, channels, clipping, DC offset, silence, RMS, and peak;
- optional two-pass loudness normalization with pinned FFmpeg;
- optional resampling and channel conversion;
- loop seam search, equal-power crossfade, and seam scoring;
- raw/master/derivative lineage;
- advisory semantic alignment, with human promotion as the taste gate.

Every run should distinguish runtime license, model license, and dataset-derived restrictions. The safe claim is “this exact artifact is preserved and attributable,” not “the same seed will regenerate identical PCM forever.”
