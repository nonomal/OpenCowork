# Creative Production Review Renderer

Creative Production explorers should emit review manifests and use the shared renderer in `scripts/review_renderer.py` instead of hand-writing review HTML or ad hoc widget payloads.

## Contract

- Skills output structured review items: image path, href, label/title, prompt, route metadata, and caption preference.
- The renderer applies a named preset. Use the preset to intentionally vary layout between skills.
- The default inline MCP review surface is `render_moodboard_board_widget`. Generate `moodboard-widget-payload.json` and `data/stream.json` through `write_moodboard_widget_payload(...)` instead of hand-assembling widget items.
- `write_moodboard_widget_payload(...)` owns saved-run normalization for local review images. It must copy source images into `generated/`, create widget-safe JPEG previews under `generated/mcp-thumbs/`, write `items[].imageUrl` and `items[].previewImageUrl` to the preview, preserve the full-resolution source in `items[].sourceImageUrl`, and write `data/stream-static.json`, `run-state.json`, and `latest-action.json`.
- Treat generated files, absolute local files, data URLs, and legacy manifest image fields as inputs to normalization. Do not pass raw local filesystem paths, run-local root-relative source images, or contact sheets directly as final widget item image URLs.
- Each visible widget item should represent one selectable creative asset. Keep multi-image contact sheets as supplemental artifacts unless they are split into individual stream items, and mark missing or invalid images with `imageError`.
- `review-board.html` remains the static fallback and durable browser-openable review page while MCP rendering is unavailable or being audited.
- Do not create bespoke static review pages unless the user explicitly asks for a custom presentation.
- Keep generated review pages inspection-first: neutral/white backgrounds, stable responsive grids, and no accidental marketing-page chrome.
- In user-facing handoffs, link natural text such as `mood board`, `selected remix`, or `output folder`. Do not ask users to click raw filenames such as `review-board.html` unless they are explicitly reviewing artifact contracts or debug files.

## Presets

- `image-wall`: dense white review grid, no header chrome, captions controlled by `showCaptions`. Use for Ads Explorer, Offer Explorer image outputs, shot grids, and style result walls.
- `selector-board`: chooser-oriented board for interactive style selection surfaces.
- `positioning-board`: larger card layout for text-heavy positioning, audience, proof, and risk comparisons.
- `moodboard`: visual territory board with palette/material/attitude metadata.
- `detail-review`: one selected route with richer prompt, risks, and production handoff metadata.

The preset owns the layout defaults. Individual skills may pass options like `showCaptions`, `title`, `minTileWidth`, or contact-sheet sizing, but they should not fork the renderer for one-off styling.
