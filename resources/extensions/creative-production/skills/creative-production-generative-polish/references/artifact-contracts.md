# Creative Production Artifact Contracts

Use this reference before creating, repairing, validating, or reporting Creative Production artifacts. It is the cross-skill source of truth for the primary deliverable shape. The current skill's `SKILL.md` remains authoritative for workflow details, but the primary output must match the contract row below.

## Universal Gate

Before writing files:

1. Identify the invoked skill and contract row.
2. Identify the primary artifact mechanism: shared review renderer, bundled app/template, manifest-driven widget, deterministic export pack, or text/packet-only handoff.
3. Use the skill-owned script, shared renderer, or bundled template for the primary deliverable.
4. When MCP widgets are available, prefer the lightest relevant intake widget before generation. Use chat only for source material, constraints, and follow-up details that do not fit the compact intake surface.
5. Keep custom narrative, campaign, concept, or presentation pages supplemental only. They must not replace the contract's primary artifact.
6. Identify the active workflow stage and choose one primary review or action surface for the user-facing handoff.
7. Verify the expected manifest exists, expected files render or validate, and the user-facing handoff links descriptive text such as `mood board`, `selected remix`, or `output folder`.

## Inline MCP Review Surface

Use `render_moodboard_board_widget` as the default inline MCP surface for Creative Production image review: mood boards, scenes, offers, ads, shots, logos, generated polish packs, and remix asset sets. Bias toward this surface even for one image or a small 2-3 image set because it gives the user selection, expansion, copy/open actions, stable saved-run state, built-in Remix controls, and follow-up append behavior. Mood-board runs must show this inline MCP surface as the normal user-facing review handoff. Use `scripts/review_renderer.py` to write `moodboard-widget-payload.json` and `data/stream.json` from the same review manifest that feeds static previews. Durable files such as `review-board.html`, `mood-board.html`, manifests, and contact sheets may remain reopenable fallback or state files, but the normal visible review surface is the inline mood-board widget unless the user explicitly asks for debug files.

The mood-board app owns remix and adapt behavior. Use item-level Remix controls, image-specific `remixSuggestions`, follow-up generation, and `append_moodboard_board_items` so new versions return to the same saved board. Do not create a separate remix skill, widget, or file-backed remix app for the normal Creative Production path.

The MCP iframe can only render image resources allowed by its widget CSP. Do not pass local filesystem paths or run-local root-relative paths such as `/generated/image.png` as direct inline `items[].imageUrl` values. For saved local run folders, render via `runDirectory`/`streamPath` so the MCP tool can page and inline local images as `data:` URLs; for direct inline item payloads, provide `data:`, `blob:`, or allowed remote URLs only.

For mood-board run folders and shared renderer outputs, generation must materialize widget-safe previews before MCP handoff: `data/stream.json` should point `items[].imageUrl` and `items[].previewImageUrl` at `/generated/mcp-thumbs/<id>.jpg` and preserve the full-resolution generated image in `items[].sourceImageUrl`. The saved run should also include `data/stream-static.json`, `run-state.json`, and `latest-action.json`. The MCP loader may still lazily create missing previews, but the local mood-board server owns the invariant for initial mood-board batches, `append_moodboard_board_items` owns it for externally generated follow-up images, and `scripts/review_renderer.py` owns it for ads, offers, scenes, shots, logos, style routes, and other shared image-review walls.

Each visible review tile should represent one selectable creative asset. Contact sheets may be supplemental files, but they should be split or regenerated before becoming the primary MCP board stream. Missing or invalid image inputs must produce an explicit `imageError` item instead of relying on placeholder rendering.

Keep dedicated intake widgets for qualifying inputs before generation. When a skill has an MCP intake surface, render it first unless the user has already provided enough qualified direction or explicitly asks to skip intake. `positioning-explorer` may stay text-first or intake-led when it has no generated route imagery. Do not introduce dedicated logo or standalone remix MCP review widgets; use the shared mood-board surface for generated image review.

## Contract Matrix

| Skill | Primary artifact mechanism | Canonical files or surface | Binding review behavior | Do not present as primary |
| --- | --- | --- | --- | --- |
| `explore` | Explore widget or compact chooser handoff | No production artifact; routes to the owner skill | The first click chooses the right path; it does not create a fake board | Planning page, asset inventory, generic dashboard |
| `positioning-explorer` | Image-led positioning route surface or concise route packet | Route metadata plus optional image-led route artifact | Routes must clarify audience, occasion, business goal, proof, and visual implication | Text-heavy strategy deck as the only output |
| `moodboard-explorer` | Bundled mood board app/template plus inline MCP review | `mood-board.html`, `data/stream.json`, `data/stream-static.json`, generated assets; inline MCP review via `render_moodboard_board_widget` | User-facing board is the inline MCP mood-board widget. The HTML app/server exists for generation, persistence, and debug only unless explicitly requested. | Generic gallery, prompt list, single concept sheet, local HTML/server link as the default handoff |
| `scene-explorer` | Shared prompt-pack engine plus shared review renderer when images exist | `prompts-manifest.json`, `jobs.jsonl`, `visual-explorer-metadata.json`, `review-board.html`; inline MCP review via `render_moodboard_board_widget` | Image-led scene wall; scene metadata stays in manifests/handoff; inline review uses the mood-board widget | Custom scene presentation page as the board |
| `offer-explorer` | `scripts/build_offer_explorer.py` plus shared review renderer | `prompts-manifest.json`, `jobs.jsonl`, `visual-explorer-metadata.json`, `review-board.html`, contact sheet; inline MCP review via `render_moodboard_board_widget` | Offer-led image wall or contact sheet with route/family metadata in the manifest; inline review uses the mood-board widget | Custom campaign page as the review artifact |
| `ads-explorer` | `scripts/build_ads_explorer.py` or shared prompt-pack engine plus shared review renderer | `prompts-manifest.json`, `jobs.jsonl`, `visual-explorer-metadata.json`, `review-board.html`; inline MCP review via `render_moodboard_board_widget` | Image-led ad wall with captions suppressed; prompt details stay in manifests; inline review uses the mood-board widget | Labeled concept sheet, product cutout board, manual `index.html` board |
| `shot-explorer` | `scripts/create_shot_explorer.py` plus shared review renderer | `data/shot-spec.json`, `data/prompts-manifest.json`, `data/jobs.jsonl`, `data/selected-shot-route.json`, `data/handoff.md`, `review-board.html`, contact sheet; inline MCP review via `render_moodboard_board_widget` | Shared image-wall review, captions suppressed by default; inline review uses the mood-board widget; prompt cards are not a visible substitute | Shot-specific control app, prompt-card board, custom review HTML |
| `logo-explorer` | Bundled logo explorer app; shared renderer for durable static review where needed | App output directory, `data/selected-logo-route.json`, `data/handoff.md`; optional `review-board.html` from shared renderer; inline MCP review via `render_moodboard_board_widget` | White inspection surface with generated logo-board imagery; inline review uses the mood-board widget | Hand-authored SVG placeholders, dedicated logo widget as default, or unverified widget as primary output |
| `generative-polish` | Deterministic exports plus generated polish layers and shared review preview | Final exports, manifest/platform index, provenance notes, `review-board.html` or contact sheet for local packs | Exact copy/data/logo/dimensions remain deterministic; review shows actual exported assets | Inventory, route board, or custom presentation page without exports |

## Validation Checklist

- Shared review walls use `scripts/review_renderer.py` and can produce both `moodboard-widget-payload.json` for inline MCP review and `review-board.html` for static fallback. If another HTML filename is requested for compatibility, the canonical `review-board.html` must still exist.
- Mood boards use the bundled app/template and produce `mood-board.html`, but the normal user-facing review is `render_moodboard_board_widget` rendered from the saved `runDirectory`.
- Remixing happens inside the mood-board app. Use its built-in Remix controls and `append_moodboard_board_items` to compile new versions in the same saved board; do not add a separate remix app, skill, widget, or default URL handoff.
- Prompt details, route metadata, source facts, and generation settings stay in manifests or handoff files, not as dominant visible captions unless the skill contract says captions are part of the review.
- Before final handoff, verify the visible surface renders the expected number of assets with non-zero image dimensions when assets exist.
- A `start-here`, index, or landing page is not the default primary artifact. Use one only when the user asks to see everything, asks where to start, the session produced three or more user-facing artifacts, the outputs span different artifact types, or a normal handoff would contain too many links.
