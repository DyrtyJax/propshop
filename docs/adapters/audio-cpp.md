# audio.cpp adapter

The `audio-cpp` adapter connects the portable `audio.sfx.generate` and `audio.music.generate` capabilities to [audio.cpp](https://github.com/0xShug0/audio.cpp).

It supports two transports:

- `cli` — recommended default for isolated and repeatable builds;
- `http` — useful for a trusted long-lived server that keeps models warm;
- `auto` — prefer a healthy configured server, otherwise use the CLI. It never retries a failed generation on another transport.

## Install audio.cpp

Build the CLI on Linux/CUDA:

```bash
scripts/build_linux.sh --backend cuda --target audiocpp_cli
```

Build on Apple Silicon/Metal:

```bash
scripts/build_metal.sh --target audiocpp_cli
```

Install Stable Audio Small SFX explicitly from the audio.cpp checkout:

```bash
python3 tools/model_manager.py info stable_audio_3_small_sfx
python3 tools/model_manager.py install stable_audio_3_small_sfx --models-root /absolute/path/to/models
```

The model is gated on Hugging Face. Accept its terms yourself. PropShop never downloads weights during `build`.

## CLI provider

```yaml
providers:
  local-audio:
    adapter: audio-cpp
    options:
      transport: cli
      executable: /absolute/path/to/audiocpp_cli
      backend: cuda
      device: 0
      threads: 4
      timeoutMs: 600000
      defaultModel: stable-audio-sfx
      models:
        stable-audio-sfx:
          family: stable_audio
          path: /absolute/path/to/models/stable-audio-3-small-sfx
          task: gen
          source: stabilityai/stable-audio-3-small-sfx
          revision: YOUR_HUGGING_FACE_COMMIT
          sha256: OPTIONAL_WEIGHT_PACKAGE_SHA256
          license:
            id: Stability-AI-Community
            url: https://huggingface.co/stabilityai/stable-audio-3-small-sfx
            restrictions: [model terms apply]
```

Avoid `backend: best` for locked production builds. Explicit backend, engine digest, model revision, and generated-byte hash are stronger evidence.

## HTTP provider

```yaml
providers:
  warm-audio:
    adapter: audio-cpp
    options:
      transport: http
      serverUrl: http://127.0.0.1:8080
      models:
        stable-audio-sfx:
          family: stable_audio
          serverId: sfx
          task: gen
```

Remote hosts are rejected unless `allowRemote: true` is explicit. The upstream server has no authentication, so use it only on loopback or behind a trusted authenticated proxy. Responses are size-limited and time-limited.

## Prop

```yaml
props:
  - id: menu-hover
    kind: sfx
    capability: audio.sfx.generate
    provider: local-audio
    model: stable-audio-sfx
    prompt: Short glassy arcade hover with a dusty CRT click
    variants: 4
    input:
      durationSeconds: 0.8
      seed: locked
      negativePrompt: music, speech, long reverb tail
      inferenceSteps: 8
      guidanceScale: 1
      sampler: pingpong
    checks:
      audio:
        durationSeconds: { min: 0.7, max: 0.9 }
        sampleRates: [44100, 48000]
        channels: [1, 2]
        minRmsDbfs: -45
        maxClippedRatio: 0.0001
        maxLeadingSilenceSeconds: 0.1
        maxTrailingSilenceSeconds: 0.15
```

Run:

```bash
propshop doctor
propshop build menu-hover
propshop compare menu-hover --run <run-id>
propshop promote menu-hover --run <run-id> --take 3
```

Every WAV is parsed directly by PropShop. Its format, sample rate, channel count, bit depth, duration, RMS, peak, DC offset, clipping, and boundary silence are written to the run record. Failed checks preserve the raw take for diagnosis but prevent promotion from that failed prop.

## Provenance

The adapter records:

- adapter protocol, transport, and normalized request digest;
- actual take seed;
- executable SHA-256 for CLI builds;
- backend, device, and threads;
- model ID, family, source, revision, optional weight hash, and license;
- server model identity/backend/timing for HTTP builds;
- exact output bytes and audio inspection in PropShop's run record.

audio.cpp is Apache-2.0. That does not change the license of Stable Audio or any other model it loads.
