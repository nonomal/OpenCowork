# HyperFrames OpenCowork Extension

A bundled OpenCowork Custom Extension that ports the HyperFrames video framework (by HeyGen):
write HTML, render video. Author compositions with HTML + CSS + GSAP, drive the CLI, install
reusable registry blocks and components, and turn any website into a finished video.

## Built-in Usage

OpenCowork ships this extension from `resources/extensions/hyperframes`. On startup it is
initialized into the local extension directory (`~/.open-cowork/extensions/hyperframes`) and shown
in Settings -> Extensions, enabled by default.

The extension bundles 5 focused skills named `hyperframes-*`. They are synced into the user skills
directory while the extension is enabled. Start with the `hyperframes` skill (composition
authoring), or load a specific skill directly when the intent is clear.

## Layout

Each skill is self-contained under `skills/`, so every skill can be installed independently.

- `extension.json` — manifest. Declares the read-only `hyperframes_guide` tool (the required entry
  tool), `skills: "./skills/"`, `state: true`, and display metadata.
- `index.js` — the `guide` tool handler; names the skills and points at the main `hyperframes` skill.
- `skills/hyperframes-<name>/` — one folder per skill:
  - `hyperframes` — main composition-authoring skill: visual styles, palettes, house style, motion
    principles, transitions, captions, TTS, audio-reactive visuals. Carries its `references/`,
    `palettes/`, `scripts/`, and top-level guides (`patterns.md`, `visual-styles.md`, etc.).
  - `hyperframes-cli` — the `hyperframes` CLI (init, lint, inspect, preview, render, transcribe,
    tts, doctor, browser).
  - `hyperframes-registry` — `hyperframes add` to install and wire reusable blocks and components.
    Carries its `references/` and `examples/`.
  - `hyperframes-gsap` — GSAP animation reference (tweens, timelines, easing, stagger,
    performance). Carries `references/effects.md` and `scripts/extract-audio-data.py`.
  - `hyperframes-website-to-hyperframes` — 7-step capture-to-video pipeline. Carries its per-step
    `references/`.

## Notes

- Each skill resolves its own resources locally (`references/`, `scripts/`, `palettes/`,
  `examples/`) — there is no shared parent folder at runtime.
- The one cross-skill reference (the `hyperframes` audio-reactive guide points at the
  `hyperframes-gsap` skill's `extract-audio-data.py`) uses the renamed skill name so it resolves
  as a sibling skill once installed.
- The skills invoke the `hyperframes` CLI via `npx hyperframes`, which requires Node.js >= 22 and
  FFmpeg on `PATH`. See https://hyperframes.heygen.com/quickstart for setup.
- `state: true`; persistent state lives at `~/.open-cowork/state/plugins/hyperframes/`.
- This is a hand-maintained port of the upstream HyperFrames plugin (v0.1.2). To update, refresh
  the content and bump `version` in `extension.json` so the native host overwrites the initialized
  user copy on next startup.
