# Template Creator OpenCowork Extension

A bundled OpenCowork Custom Extension that ports the Template Creator plugin: turn a DOCX, PPTX, or
XLSX reference into a reusable personal artifact-template skill, or update an existing personal
artifact template. The generated template retains the source Office file so later artifact creation
can clone or import it precisely.

## Built-in Usage

OpenCowork ships this extension from `resources/extensions/template-creator`. On startup it is
initialized into the local extension directory (`~/.open-cowork/extensions/template-creator`) and
shown in Settings -> Extensions, enabled by default.

This is a single-skill extension: the skill name equals the extension id (`template-creator`). While
the extension is enabled, the skill is synced into the user skills directory
(`~/.open-cowork/skills/template-creator`). Load the `template-creator` skill (via the Skill tool)
and follow its create/update workflow.

## Layout

Because this is a single-skill plugin, the extension uses a flat structure: the extension root *is*
the skill (`SKILL.md` lives at the root, and `extension.json` sets `"skills": "."`). There is no
nested `skills/template-creator/` folder.

- `extension.json` — manifest. Declares the read-only `template_creator_guide` tool (the required
  entry tool), `skills: "."`, `state: true`, and display metadata.
- `index.js` — the `guide` tool handler; summarizes the skill and points the agent at it.
- `SKILL.md` — the `template-creator` skill: routing, create workflow, update workflow, response
  and formatting rules, and constraints.
- `scripts/create-template-skill.mjs` — Node script that stages and atomically writes (or updates)
  the generated `artifact-template-*` skill package under `~/.open-cowork/skills`.
- `agents/openai.yaml` — skill-level agent interface metadata carried over from the source plugin.
- `assets/icon.svg` — plugin icon.

## Notes

- Personal artifact templates are written to `~/.open-cowork/skills` (the script honors the
  `OPEN_COWORK_HOME` env var, defaulting to `~/.open-cowork`).
- Persistent extension state, if used, lives at `~/.open-cowork/state/plugins/template-creator/`.
- This is a hand-maintained port of the upstream Template Creator plugin (v26.630.12135). To update,
  refresh the content and bump `version` in `extension.json` so the native host overwrites the
  initialized user copy on next startup.
