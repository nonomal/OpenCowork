---
name: creative-production-offer-explorer
description: Use when a product, digital product, service, venue, experience, or campaign brief needs 25-family offer-led prompt exploration, contact sheets, review galleries, or coverage checks before remix, asset production, or polish.
---

# Offer Explorer

Generate product-, digital-product-, venue-, service-, or experience-specific image prompts across the business visual prompt library, then package the outputs as a reviewable offer exploration: prompt manifest, JSONL batch, individual images, contact sheet, and HTML gallery.

Read `references/experience-contract.md` before writing the user-facing handoff or reporting artifact links.

Read `references/artifact-contracts.md` before creating, repairing, or reporting artifacts.

Read `references/codex-exec-image-generation.md` before running image generation.

Read `references/image-building-strategy.md` alongside the Codex exec contract for first-pass imagery rules.

## Pipeline Role

Use it to test one product, packaging reference, digital product UI, venue, service experience, or product concept across the prompt-family library. It produces directional evidence and handoff specs, not canonical production assets.

The default core family run is 25 starter prompt families. The number describes starter directions in the pack, not a required mood-board tile count. Generate one image per selected family only when the user asks for generation or clearly wants the complete review gallery.

Explorer outputs should include offer facts to preserve, family or route coverage, a prompt manifest, generated images when requested, a contact sheet or review gallery, recommended directions, and a concise build handoff for the next skill.

Use active Build/Polish owners only after a canonical or selected base exists:

- Use the mood-board app's Remix controls for controlled variations after a review gallery has concrete outputs to vary.
- `generative-polish` for publish-bound marketing finish.

Use `moodboard-explorer` first when the request is broader than an offer anchor: campaign mood, brand direction, audience feel, or creative territory exploration.

Use `scene-explorer` first when the request is primarily about environments, customer moments, point-of-sale scenes, venue/service contexts, or where a supplied offer should appear in the real world.

## Run Types

- `family`: one offer-specific image prompt for each selected prompt family. Core contains 25 starter prompt families. Use for fast coverage checks and creative review.
- `pack`: optional packaged prompt family selected with `--pack`. Core is the default. `digital-product-placements` is the shipped specialist pack for app, SaaS, dashboard, and UI-first placements where the product interface is the proof object.

Pack routing:

- Use core for broad product, service, venue, offer, and campaign concept exploration.
- Use `digital-product-placements` for app, SaaS, AI feature, dashboard, or UI-first work.
- Use `ads-explorer` for ad-direction diversity, paid-social ideas, ecommerce images, proof-led campaign images, and digital-product ad routes.
- Use `scene-explorer` for product placements, retail contexts, customer moments, service environments, and point-of-sale scenes.

## Workflow

1. Capture the offer anchor.
   - If the user provides an image, describe the product facts that must be preserved: pack shape, color, logo placement, materials, flavor cues, visible ingredients, and category.
   - If the user provides a digital product, app, SaaS, dashboard, or UI-first brief, extract the product surface, workflow, proof cues, privacy constraints, and what UI details must stay sparse or exact.
   - If the user provides a venue, service, or experience brief, extract the facts that must be preserved: location, category, audience, occasion, service moment, available references, and business goal.
   - If the user provides only a product or venue brief, extract the same facts from the brief.
   - Do not introduce another brand, venue, product category, endorsement, or unsupported claim.

2. Choose the run size.
   - Use `--scale family` for one image per family.
   - Use `--pack <id>` when the request clearly belongs to a packaged specialist library.
   - Use `--subject-kind digital-product --pack digital-product-placements` for app, SaaS, dashboard, AI feature, or UI-first work where the product interface should carry the proof.
   - For landing-page hero, product-page, or page-module exploration, use core when the user needs positioning and concept directions; use `ads-explorer` when the user needs campaign image directions. Use `generative-polish` only after a direction or deterministic base is selected.
   - Use `--subject-kind venue` for restaurants, hotels, bars, hospitality venues, and other location-based service experiences.
   - Do not generate 100 images without confirming cost/time expectations unless the user has explicitly asked for the full generation.

3. Build the exploration batch.
   - Use `scripts/build_offer_explorer.py`.
   - The script reads checked-in JSON packs from `assets/offer-library/` and skill-local `references/packs/`, writes `jobs.jsonl`, and writes `prompts-manifest.json`.
   - Use one prompt per family. Do not collapse families or generate weak synonym variants.

4. Generate images when requested.
   - Use Codex exec fanout from `references/codex-exec-image-generation.md`.
   - Use the bundled `build_offer_explorer.py` script, not ad hoc API code.
   - Default generation settings: 4 workers, 2 attempts, 600 seconds per attempt.
   - For expensive or high-volume changes beyond the family run, confirm before running.

5. Package review artifacts.
   - Contact sheet: `offer-contact-sheet.png`
   - Review board: `review-board.html`
   - Prompt manifest: `prompts-manifest.json`
   - Batch input: `jobs.jsonl`
   - Originals and web-sized image copies in the output folder.
   - The script writes `moodboard-widget-payload.json` through the shared review renderer. When an inline MCP review surface is available, pass that payload to `render_moodboard_board_widget`.

6. Review quality.
   - Confirm the product, digital product UI, venue, service, or experience remains visibly central in every family.
   - For digital products, verify that UI/product-proof language remains visible in the prompt and that the image direction does not drift into generic abstract SaaS imagery.
   - Watch for generated text errors, fake endorsements, unintended competitor/category drift, unsupported claims, or over-dense UI text.
   - Treat packaging/logo text fidelity as directional unless the workflow uses a stricter image-edit/reference-preservation path.

7. Prepare the build handoff.
   - Identify the strongest families or packaged directions.
   - Use the same lightweight handoff wording as the other explorers: selected direction, preserve, avoid, focused next owner, and artifact path.
   - State what should be preserved in the next stage: subject facts, product or venue details, material/service cues, category, route/family rationale, channel fit, and approval constraints.

## Commands

Prepare a visual exploration without generating images:

```bash
python3 skills/offer-explorer/scripts/build_offer_explorer.py \
  --offer-name "Botanical Sparkling Water" \
  --offer-brief "Slim canned sparkling water with botanical flavor cues, pale green label, condensation, citrus peel, and outdoor refreshment positioning." \
  --scale family \
  --out-dir outputs/imagegen/botanical-sparkling-water-family-review
```

Generate one image for each of the 25 core starter prompt families:

```bash
python3 skills/offer-explorer/scripts/build_offer_explorer.py \
  --offer-name "Botanical Sparkling Water" \
  --offer-brief "Slim canned sparkling water with botanical flavor cues, pale green label, condensation, citrus peel, and outdoor refreshment positioning." \
  --scale family \
  --out-dir outputs/imagegen/botanical-sparkling-water-family-review \
  --generate --force
```

Prepare a 12-direction digital product placement exploration without generating images:

```bash
python3 skills/offer-explorer/scripts/build_offer_explorer.py \
  --offer-name "OpenCowork Team Review" \
  --offer-brief "SaaS workflow for reviewing coding-agent work. Preserve product UI, task queue, diff review, approval controls, team handoff, and privacy-safe placeholder data." \
  --subject-kind digital-product \
  --pack digital-product-placements \
  --scale family \
  --out-dir outputs/imagegen/opencowork-team-review-digital-product-placements-offer-explorer
```

Rebuild the gallery/contact sheet from existing images:

```bash
python3 skills/offer-explorer/scripts/build_offer_explorer.py \
  --offer-name "Botanical Sparkling Water" \
  --offer-brief-file outputs/imagegen/botanical-sparkling-water-family-review/offer-brief.txt \
  --scale family \
  --out-dir outputs/imagegen/botanical-sparkling-water-family-review \
  --review-only
```

Prepare a product placement scene exploration without generating images:

```bash
python3 skills/offer-explorer/scripts/build_offer_explorer.py \
  --offer-name "Modular Desk Lamp" \
  --subject-kind product \
  --offer-brief "Adjustable desk lamp for home offices. Preserve slim metal arm, matte black finish, warm LED glow, compact base, and ergonomic positioning. Avoid fake prices, fake retailer logos, invented awards, and discount framing." \
  --expansion-map assets/scene-library/packs/business-point-of-sale-scenes.json \
  --pack business-point-of-sale-scenes \
  --scale family \
  --out-dir outputs/imagegen/modular-desk-lamp-product-placement-scenes
```

## Output Defaults

- Use a white, inspection-first review page.
- In user-facing handoffs, present generated images through the `mood board` surface when available, and link durable files as `output folder` rather than exposing raw filenames.
- Include short family labels in review artifacts.
- Keep generated images offer-led, with sparse labels only when the family requires a board, dashboard, or UI-like packet.
- Save family exploration output under `outputs/imagegen/<offer-slug>-offer-explorer/` unless the user specifies a folder.
- Save packaged family output under `outputs/imagegen/<offer-slug>-<pack-id>-offer-explorer/` unless the user specifies a folder.

## Exit Criteria

A successful explorer run ends with:

- reviewable offer-led visual options;
- offer facts and source/context signals;
- selected or recommended directions;
- a build handoff naming the next skill and the asset to build;
- clear caveats about generated text, claims, logos, product fidelity, endorsements, category drift, or unsupported visual assumptions.

## Files

- `scripts/build_offer_explorer.py`: builds prompts, optionally runs ImageGen, and packages review artifacts.
- `assets/offer-library/packs/cross-industry-product-ad-archetypes.json`: default checked-in core offer library.
- `references/packs/digital-product-placements.json`: checked-in specialist pack for app, SaaS, dashboard, AI feature, and UI-first work.
