---
name: creative-production-ads-explorer
description: Explore a supplied product, service, venue, or offer across a diverse 25-family image-ad prompt library. Use when the user wants Ads Explorer, ad directions, image ad prompts, paid social ideas, broad campaign ad exploration, or a review wall before final production.
---

# Ads Explorer

Use this skill when the user wants to see many different image-ad directions from one subject anchor: product reference image, packaging, service, venue, app, campaign offer, or business asset.

This is the Explore-stage owner for ad-format diversity. It is intentionally broader than `scene-explorer` and more ad-specific than `offer-explorer`.

Read `references/experience-contract.md` before writing the user-facing handoff.

Read `references/artifact-contracts.md` before creating, repairing, or reporting artifacts.

Read `references/codex-exec-image-generation.md` before running image generation.

Read `references/image-building-strategy.md` alongside the Codex exec contract for first-pass imagery rules.

## Pipeline Role

Use `ads-explorer` when the request is about ad formats, campaign images, paid social ideas, launch ads, proof-led ads, ecommerce ads, OOH mockups, UGC thumbnails, surreal product posters, or a visual wall of ad directions.

Use `scene-explorer` first when the main question is where the product should appear in the real world.


After the review wall, keep more versions in the same mood-board surface. Use tile-level Remix controls, item `remixSuggestions`, or follow-up generation for controlled changes such as different character, scene, copy, format, crop, style, palette, camera, props, or product placement, then append new results to the saved board.


## Default Library

Use the checked-in packs under `assets/image-ad-library/packs/`.

The default `diverse-image-ad-archetypes` pack contains 25 reusable starter ad families. The number describes starter directions in the pack, not a required mood-board tile count. It declares:

- per-family prompt structure;
- per-family image size where a non-square crop is better;
- review-wall behavior with captions suppressed;
- copy safety rules for exact headline, CTA, claims, proof, and placeholder text.

Use `--pack digital-product-core-ad-prompts` for app, SaaS, AI product, marketplace, commerce, developer-tool, or other software-product ads where the interface should be the product proof.

## Workflow

1. Capture the subject anchor.
   - If the user supplies an image, preserve exact visible product facts: silhouette, colors, materials, labels, logos, markings, proportions, and use context.
   - If the user supplies a brief only, extract the same facts from the brief.
   - Capture approved copy, headline, CTA, claims, proof, audience, palette, channel, and avoid list.

2. Build the ad prompt wall.
   - Use the shared prompt-pack engine with the ad library:

```bash
python3 plugins/creative-production/skills/ads-explorer/scripts/build_ads_explorer.py \
  --ad-name "<subject name>" \
  --subject-kind product \
  --ad-brief "<facts to preserve, approved copy, audience, palette, and avoid list>" \
  --out-dir outputs/imagegen/<subject-slug>-diverse-image-ads
```

For software-product ads:

```bash
python3 plugins/creative-production/skills/ads-explorer/scripts/build_ads_explorer.py \
  --ad-name "<app or digital product name>" \
  --pack digital-product-core-ad-prompts \
  --subject-kind digital-product \
  --ad-brief "<product category, UI surface, job to be shown, approved copy, audience, palette, and privacy constraints>" \
  --out-dir outputs/imagegen/<subject-slug>-digital-product-ads
```

3. Generate images when requested.
   - Use Codex exec fanout from `references/codex-exec-image-generation.md`.
   - If a source image is supplied, include its path and preservation requirements in job metadata and prompts.
   - If no source image is available, use text-only generation from the prompt manifest.
   - Do not generate one image for every starter family unless the user asks for generation or clearly wants a full review wall.

4. Render the review wall.
   - The default review should be image-led: a wall of ads, no subtitles or captions under tiles.
   - Prompt details, family names, and sizing metadata should stay in `prompts-manifest.json` and `visual-explorer-metadata.json`.
   - Use mixed sizes from the pack. Do not force every ad to square.
   - When an inline MCP review surface is available, render the generated ad set with `render_moodboard_board_widget`.

5. Handoff.
   - Identify strongest ad families and any format fit issues.
   - Note copy or product-fidelity risks.
   - Use the same lightweight handoff wording as the other explorers: selected direction, preserve, avoid, focused next owner, and artifact path.

## Copy Rules

- Use exact supplied text only.
- Avoid subtitles, explanatory body-copy captions, fake price tags, fake reviews, invented proof, and unsupplied CTA text.
- For proof, comparison, certification, ecommerce, and event formats, use placeholder zones unless the brief supplies real details.
- Treat generated text as directional. Final publish assets need deterministic type/layout.
- When the ad brief touches regulated or high-risk categories, add a compact user-facing caveat only when requested, when the category is clearly relevant, or when the asset is moving toward publish use. High-risk categories include prescription drugs or telehealth, supplements or weight loss, financial products, housing, jobs, credit, education, alcohol, tobacco, cannabis, gambling, children-directed products, privacy or security claims, endorsements, and testimonials. Use only approved claims and required disclosures; if disclaimer copy must appear in the asset, ask for the exact approved text.

## Exit Criteria

A successful Ads Explorer run ends with:

- up to 25 starter ad prompt directions, with generated ad images only for the families selected or requested;
- an image-led review wall;
- no caption-heavy review framing;
- mixed aspect ratios where useful;
- product facts and copy constraints preserved;
- selected directions and next production owner;
- if the user asks for more versions of selected ads, use the mood-board Remix action and append new results to the same board rather than creating a separate review wall.

## Files

- `assets/image-ad-library/`: checked-in reusable ad library and registry.
- `assets/image-ad-library/packs/diverse-image-ad-archetypes.json`: default 25-family starter ad pack.
- `assets/image-ad-library/packs/digital-product-core-ad-prompts.json`: 12-route screen-first ad pack.
- `scripts/build_ads_explorer.py`: wrapper around the shared offer explorer prompt-pack engine.
