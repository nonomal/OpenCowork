/* eslint-disable @typescript-eslint/explicit-function-return-type */

// HyperFrames is a skill-driven plugin: the real capability lives in its
// bundled skills (hyperframes, hyperframes-cli, hyperframes-registry,
// hyperframes-gsap, hyperframes-website-to-hyperframes). The native extension
// host requires at least one tool, so this single read-only "guide" tool serves
// as the agent's entry point — it names the skills and points at the main one.

const OVERVIEW =
  'HyperFrames writes HTML and renders it to video: HTML is the source of truth for a composition. ' +
  'It ships as a set of focused skills named "hyperframes-*". Start by loading the "hyperframes" ' +
  'skill (via the Skill tool) — it covers composition authoring, timing, media, captions, ' +
  'voiceovers, audio-reactive visuals, and transitions. From there, load the specific skill that ' +
  'matches the request: the CLI for init/preview/render, the registry for reusable blocks and ' +
  'components, GSAP for animation reference, or website-to-hyperframes to turn a URL into a video.'

const SKILLS = [
  { name: 'hyperframes', use: 'Main entry — author video compositions (HTML + CSS + GSAP): visual styles, palettes, house style, motion, transitions, captions, TTS, audio-reactive visuals.' },
  { name: 'hyperframes-cli', use: 'Run the hyperframes CLI: init, lint, inspect, preview, render, transcribe, tts, doctor, browser.' },
  { name: 'hyperframes-registry', use: 'Install and wire reusable registry blocks and components via hyperframes add (social overlays, shader transitions, data viz, effects).' },
  { name: 'hyperframes-gsap', use: 'GSAP animation reference — tweens, timelines, easing, stagger, performance.' },
  { name: 'hyperframes-website-to-hyperframes', use: '7-step pipeline that captures a website URL and produces a finished video.' }
]

globalThis.openCoworkExtension = {
  handlers: {
    async guide() {
      return {
        text: OVERVIEW,
        data: {
          entrySkill: 'hyperframes',
          statePath: '~/.open-cowork/state/plugins/hyperframes/',
          skills: SKILLS
        }
      }
    }
  }
}
