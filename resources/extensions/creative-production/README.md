# Creative Production OpenCowork Extension

A bundled OpenCowork Custom Extension that ports the Creative Production workflow plugin: explore
campaign ideas, concept images, mood boards, product placements, ad directions, listing images,
social posts, logos, and reusable styles — turning a brief, product image, offer, or existing asset
into visual options a team can review.

## Built-in Usage

OpenCowork ships this extension from `resources/extensions/creative-production`. On startup it is
initialized into the local extension directory (`~/.open-cowork/extensions/creative-production`) and
shown in Settings -> Extensions, enabled by default.

The extension bundles 9 focused skills named `creative-production-*`. They are synced into the user
skills directory while the extension is enabled. Start with the `creative-production-explore`
front-door skill (it routes a broad brief to the right exploration), or load a specific skill
directly when the intent is clear.

## Layout

Each skill is self-contained under `skills/`, so every skill can be installed independently.

- `extension.json` — manifest. Declares the read-only `creative_production_guide` tool (the required
  entry tool), `skills: "./skills/"`, `state: true`, the `creative_production_mcp` MCP server, and
  display metadata.
- `index.js` — the `guide` tool handler; names the skills and points at the Explore front door.
- `skills/creative-production-<name>/` — one folder per skill:
  - `creative-production-explore` — front-door chooser
  - `creative-production-positioning-explorer`, `creative-production-moodboard-explorer`,
    `creative-production-scene-explorer`, `creative-production-offer-explorer`,
    `creative-production-ads-explorer`, `creative-production-shot-explorer`,
    `creative-production-logo-explorer`, `creative-production-generative-polish`
  - Each folder carries `SKILL.md` plus the resources it needs: `references/` (the shared behavior
    contracts + any skill-specific reference), and where a skill uses them, local `scripts/`,
    `assets/` (local review apps and/or a copied asset library).
- `mcp/` — the `creative_production_mcp` server (`node ./mcp/server.bundle.mjs`). It renders the
  in-chat mood board, shot-intake, and style-intake widgets. The bundle reads
  `.codex-plugin/plugin.json` at startup for its version, so that file is kept at the extension root.
- `runtime/codex_exec_image_batch.py` — the image-generation batch runner used by the explorer
  skills.
- `scripts/` — shared Python helpers (`review_renderer.py`) imported by several skill build scripts,
  kept at the extension root as a peer of `runtime/`.
- `package.json`, `requirements.txt` — runtime dependency descriptors. Python image scripts require
  Pillow (`pip install -r requirements.txt`); the MCP server runs on Node with no extra install
  because `mcp/server.bundle.mjs` is pre-bundled.

## Notes

- The shared references (experience contract, artifact contracts, image-building strategy, the
  Codex exec image-generation contract, and the review renderer) are copied into each skill's
  `references/` so every skill resolves them locally — independent skills have no shared parent
  folder at runtime.
- The shared asset libraries are copied into the skills that use them:
  `creative-production-ads-explorer/assets/image-ad-library/`,
  `creative-production-scene-explorer/assets/scene-library/`, and
  `creative-production-offer-explorer/assets/offer-library/`.
- Skill links use skill-relative paths (`references/<file>.md`, `assets/<library>/...`), which resolve
  both in this repo and once a skill is installed standalone under `~/.open-cowork/skills/`.
- Persistent state lives at `~/.open-cowork/state/plugins/creative-production/`.
- Image generation uses the bundled `codex exec` image-batch runner; that command mechanism, its
  runner filenames, and the `CREATIVE_PRODUCTION_*` environment overrides are preserved verbatim from
  upstream so the pipeline behaves as designed.
- This is a hand-maintained port of the upstream Creative Production plugin (v0.1.23). To update,
  refresh the content and bump `version` in `extension.json` so the native host overwrites the
  initialized user copy on next startup.
