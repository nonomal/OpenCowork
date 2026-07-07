/* eslint-disable @typescript-eslint/explicit-function-return-type */

// Creative Production is a skill-driven plugin: the real capability lives in its
// bundled skills (creative-production-*). The native extension host requires at
// least one tool, so this single read-only "guide" tool serves as the agent's
// entry point — it names the skills and points at the Explore front door.

const OVERVIEW =
  'Creative Production turns a brief, product image, offer, or existing asset into marketing ' +
  'visuals the team can review: campaign ideas, concept images, mood boards, product placements, ' +
  'ad directions, listing images, social posts, logos, and reusable styles. It ships as a set of ' +
  'focused skills named "creative-production-*". Start by loading the "creative-production-explore" ' +
  'front-door skill (via the Skill tool) to pick a direction, then follow it into the specific ' +
  'skill that matches the request. You can also load a specific skill directly when the intent is ' +
  'clear. Image generation runs through the bundled Codex exec image batch runner, and the ' +
  '"creative_production_mcp" server renders the in-chat mood board, shot, and style widgets.'

const SKILLS = [
  { name: 'creative-production-explore', use: 'Front door — compact chooser that routes a broad brief to the right exploration.' },
  { name: 'creative-production-positioning-explorer', use: 'Explore positioning routes (audience, occasion, proof, angle) before any visuals.' },
  { name: 'creative-production-moodboard-explorer', use: 'Generate an image-first mood-board stream of concept images and visual directions.' },
  { name: 'creative-production-scene-explorer', use: 'Explore product-in-environment, service, retail, and point-of-sale scenes.' },
  { name: 'creative-production-offer-explorer', use: 'Offer-led prompt exploration across a 25-family library with contact sheets and galleries.' },
  { name: 'creative-production-ads-explorer', use: 'Explore many image-ad directions from one subject anchor across a diverse ad library.' },
  { name: 'creative-production-shot-explorer', use: 'Camera-angle, crop, zoom, and macro-detail variants from an uploaded image.' },
  { name: 'creative-production-logo-explorer', use: 'Interactive logo and identity-system exploration board before vector production.' },
  { name: 'creative-production-generative-polish', use: 'Publish-safe polish that preserves exact text, data, logos, dimensions, and safe zones.' }
]

globalThis.openCoworkExtension = {
  handlers: {
    async guide() {
      return {
        text: OVERVIEW,
        data: {
          entry: 'creative-production-explore',
          statePath: '~/.open-cowork/state/plugins/creative-production/',
          mcpServer: 'creative_production_mcp',
          skills: SKILLS
        }
      }
    }
  }
}
