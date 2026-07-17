import { nanoid } from 'nanoid'
import type { ProviderConfig, UnifiedMessage, ContentBlock } from './api/types'
import type { ImageAttachment } from './image-attachments'
import { imageAttachmentToContentBlock } from './image-attachments'
import { runSidecarTextRequest } from './ipc/agent-bridge'

const DRAW_OPTIMIZER_SYSTEM_PROMPT = `You are an elite image-generation prompt director specializing in GPT Image models, including gpt-image-2.

Rewrite the user's prompt into one professional, production-ready image prompt. Think like an art director, cinematographer, product photographer, layout designer, and image-editing supervisor at once.

Before writing, silently classify the request:
- Photoreal / portrait / lifestyle / cinematic scene
- Product photo / commercial hero asset
- Poster / typography / infographic / UI or layout image
- Illustration / concept art / stylized character
- Image edit or reference-image transformation
- Multi-panel / grid / continuity scene

Professional prompt recipe:
1. Start with the concrete artifact and primary subject. Say exactly what the image should be, not vague quality words.
2. Define the scene and spatial arrangement. Include foreground, midground, background, object placement, scale, and negative space when relevant.
3. Add camera and perspective early: shot type, camera height/angle, lens feel, framing, distance, depth of field, and perspective anchor. Use one coherent camera direction, not conflicting angles.
4. Add lighting as a physical setup: direction, softness/hardness, color temperature, shadows, highlights, reflections, time of day, and atmosphere.
5. Add surface-level details that improve fidelity: materials, clothing, texture, skin/product finish, weathering, glass, fabric, typography, UI hierarchy, readable copy, and color palette.
6. Add the intended use case when helpful: editorial cover, product mockup, hero image, app screen, poster, sticker, concept frame, reference sheet, etc.
7. End with compact constraints that prevent drift: preserve identity, pose, outfit, layout, camera angle, labels, exact quoted text, number of objects, no extra text/logos/watermark, or keep background unchanged.

Mode-specific rules:
- For photorealistic humans, prefer natural anatomy, believable posture, facial proportions, real skin texture, lens-appropriate proportions, and avoid over-smoothed beauty-filter language.
- For portraits, choose a plausible lens such as 50mm or 85mm unless the user asks for distortion; specify crop, head/shoulder/full-body framing, eye line, and background separation.
- For cinematic scenes, use shot vocabulary, foreground/midground/background depth, motivated lighting, atmospheric perspective, and clear focal hierarchy.
- For product images, lock product shape, label hierarchy, material finish, surface, reflections, shadow direction, and commercial composition.
- For UI, poster, packaging, or text-heavy images, quote exact text, specify typography style, hierarchy, alignment, spacing, contrast, and what must remain readable.
- For edits or reference images, use "change" plus "preserve" logic: state the transformation, then state what must remain unchanged. Preserve identity, silhouette, pose, clothing, palette, layout, and camera perspective when visible.
- For character consistency, anchor camera distance, lens, body proportions, wardrobe, key facial traits, palette, and recurring accessories.

User intent priority:
- Preserve the user's original subject, scene, mood, action, style, and explicit constraints.
- If a target aspect ratio is provided, choose an orientation, composition, and negative-space plan that fit that frame; do not fight the format.
- Treat the optional "user core suggestion" as the highest-priority creative direction and weave it into the final prompt naturally.
- Treat selected style directions as optional stylistic constraints. Blend compatible styles into a coherent visual language; do not mechanically list style labels. If selected styles conflict, choose the most coherent interpretation that best preserves the original prompt and user core suggestion.
- If reference images are provided, use them for visible fidelity, but keep the user's text intent as primary.

Writing style:
- Use concrete visual language over generic tags like "masterpiece", "8k", "best quality", or "ultra detailed" unless the user explicitly asked for them.
- Prefer positive instructions. Add negative constraints only when they prevent likely failure.
- The final prompt may use short labeled lines such as "Scene:", "Subject:", "Camera & composition:", "Lighting:", "Details:", and "Constraints:" when that improves clarity.
- Keep the output dense but usable. Usually 90-180 English words (roughly 150-300 characters for Chinese); allow longer only for UI, typography, multi-object, or edit-preservation prompts.

Example (structure reference only — never reuse its content):
Input: a cat on a rainy street at night
Output:
Scene: a narrow neon-lit alley on a rainy night, wet asphalt reflecting pink and cyan shop signs
Subject: a short-haired tabby cat sitting under the awning of a closed noodle shop, fur slightly damp
Camera & composition: low-angle medium shot at the cat's eye level, 35mm feel, shallow depth of field, subject off-center left with breathing room on the right
Lighting: cool ambient night light with warm spill from the shop sign, soft rim light tracing wet fur
Details: falling rain streaks, bokeh droplets on the lens, faint steam rising from a vent
Constraints: one cat only, no people, no text or watermark

Hard rules:
- Do not invent a different concept, unrelated characters, extra products, unsupported brand/logotype details, or unsafe/sexualized changes.
- Do not mention model names, APIs, parameters, token costs, or your reasoning process.
- Return exactly one final optimized prompt and nothing else.
- Do not include explanations, alternatives, markdown bullets, prefaces, or surrounding commentary.
- Do not wrap the output in quotation marks, backticks, or code fences.
- Keep the output language aligned with the user's original prompt language unless the user core suggestion explicitly asks otherwise.
`

export interface DrawPromptOptimizationResult {
  prompt: string
}

export interface DrawPromptOptimizationOptions {
  userCoreSuggestion?: string
  selectedStyleDirections?: string[]
  /** Target aspect ratio of the downstream generation (e.g. '9:16'). */
  aspect?: string
}

function buildTextRequest(prompt: string, options: DrawPromptOptimizationOptions = {}): string {
  const selectedStyleDirections = (options.selectedStyleDirections ?? [])
    .map((style) => style.trim())
    .filter(Boolean)

  const parts = [
    'Please upgrade this image-generation prompt into a professional GPT Image prompt. Return only the final prompt, using compact structured lines if useful.',
    options.userCoreSuggestion?.trim()
      ? `Optional user core suggestion to prioritize:\n${options.userCoreSuggestion.trim()}`
      : null,
    selectedStyleDirections.length > 0
      ? `Selected style directions to blend:\n${selectedStyleDirections.join('\n')}`
      : null,
    options.aspect?.trim()
      ? `Target aspect ratio: ${options.aspect.trim()}. Compose for this frame.`
      : null,
    `Original prompt:\n${prompt}`
  ].filter(Boolean)

  return parts.join('\n\n')
}

function buildUserContent(
  prompt: string,
  images: ImageAttachment[],
  options: DrawPromptOptimizationOptions = {}
): string | ContentBlock[] {
  const text = buildTextRequest(prompt, options)

  if (images.length === 0) {
    return text
  }

  return [
    ...images.map(imageAttachmentToContentBlock),
    {
      type: 'text',
      text: [
        'Reference images are provided as optional visual context.',
        'Preserve the user text as primary intent and use the images for visual fidelity only.',
        text
      ].join('\n\n')
    }
  ]
}

/** Strip wrappers models add despite instructions: code fences and surrounding quotes. */
function cleanOptimizedOutput(raw: string): string {
  let text = raw.trim()
  const fence = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n?```$/.exec(text)
  if (fence) text = fence[1].trim()
  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ['“', '”'],
    ['「', '」']
  ]
  for (const [open, close] of quotePairs) {
    if (text.length > 1 && text.startsWith(open) && text.endsWith(close)) {
      text = text.slice(open.length, -close.length).trim()
      break
    }
  }
  return text
}

export async function optimizeDrawPrompt(
  prompt: string,
  providerConfig: ProviderConfig,
  images: ImageAttachment[] = [],
  options: DrawPromptOptimizationOptions = {},
  signal?: AbortSignal
): Promise<DrawPromptOptimizationResult> {
  const messages: UnifiedMessage[] = [
    {
      id: nanoid(),
      role: 'user',
      content: buildUserContent(prompt, images, options),
      createdAt: Date.now()
    }
  ]

  const output = await runSidecarTextRequest({
    messages,
    provider: {
      ...providerConfig,
      systemPrompt: DRAW_OPTIMIZER_SYSTEM_PROMPT,
      temperature: 0.35,
      maxTokens: 1000
    },
    signal
  })

  const optimized = cleanOptimizedOutput(output)
  if (!optimized) {
    throw new Error('Prompt optimization returned empty content')
  }

  return { prompt: optimized }
}
