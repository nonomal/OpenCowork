# Product Design OpenCowork Extension

A bundled OpenCowork Custom Extension that ports the Product Design workflow plugin: research,
audit, ideate, prototype, clone, redesign, design QA, and share — for turning early product ideas,
live URLs, and screenshots into prototypes teams can review.

## Built-in Usage

OpenCowork ships this extension from `resources/extensions/product-design`. On startup it is
initialized into the local extension directory (`~/.open-cowork/extensions/product-design`) and
shown in Settings -> Extensions, enabled by default.

The extension bundles 11 focused skills named `product-design-*`. They are synced into the user
skills directory while the extension is enabled. Start with the `product-design-index` router skill
(it decides which skill to run), or load a specific skill directly when the intent is clear.

## Layout

Each skill is self-contained under `skills/`, so every skill can be installed independently.

- `extension.json` — manifest. Declares the read-only `product_design_guide` tool (the required
  entry tool), `skills: "./skills/"`, `state: true`, and display metadata.
- `index.js` — the `guide` tool handler; names the skills and points at the router.
- `skills/product-design-<name>/` — one folder per skill:
  - `product-design-index` — router
  - `product-design-user-context`, `product-design-get-context`, `product-design-research`,
    `product-design-ideate`, `product-design-prototype`, `product-design-url-to-code`,
    `product-design-image-to-code`, `product-design-audit`, `product-design-design-qa`,
    `product-design-share`
  - Each folder carries `SKILL.md` plus the resources it needs: `references/` (shared behavior
    contracts + any skill-specific reference), and for the build skills (`prototype`,
    `url-to-code`, `image-to-code`) the `scripts/` bootstrap and `templates/` prototype starter.
    `product-design-user-context` also carries its Python `scripts/`.

## Notes

- The shared references (communication protocol, critical overrides, browser order,
  local-prototype preflight) are copied into each skill so every skill resolves them locally —
  independent skills have no shared parent folder at runtime.
- Cross-skill links use sibling paths (`../product-design-<name>/SKILL.md`), which resolve both in
  this repo and once installed under `~/.agents/skills/`.
- Persistent product/design context lives at `~/.open-cowork/state/plugins/product-design/`,
  managed by the `product-design-user-context` skill.
- This is a hand-maintained port of the upstream Product Design plugin (v0.1.47). To update, refresh
  the content and bump `version` in `extension.json` so the native host overwrites the initialized
  user copy on next startup.
