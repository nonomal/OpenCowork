/* eslint-disable @typescript-eslint/explicit-function-return-type */

// Product Design is a skill-driven plugin: the real capability lives in its
// bundled skills (product-design-*). The native extension host requires at
// least one tool, so this single read-only "guide" tool serves as the agent's
// entry point — it names the skills and points at the router.

const OVERVIEW =
  'Product Design turns early ideas, live URLs, and static screenshots into prototypes teams can ' +
  'review. It ships as a set of focused skills named "product-design-*". Start by loading the ' +
  '"product-design-index" router skill (via the Skill tool), then follow it to the specific ' +
  'skill that matches the request. You can also load a specific skill directly when the intent ' +
  'is clear.'

const SKILLS = [
  { name: 'product-design-index', use: 'Router — decides which Product Design skill to run and in what order.' },
  { name: 'product-design-user-context', use: 'Set up, save, or recall product/design sources and preferences.' },
  { name: 'product-design-get-context', use: 'Confirm the design brief before any build or ideation.' },
  { name: 'product-design-research', use: 'Source-grounded UX research on current user problems.' },
  { name: 'product-design-ideate', use: 'Generate image-based visual directions after the brief is confirmed.' },
  { name: 'product-design-prototype', use: 'Route coded prototype, redesign, clone, and build requests.' },
  { name: 'product-design-url-to-code', use: 'Clone a live URL into a runnable local prototype.' },
  { name: 'product-design-image-to-code', use: 'Build a selected visual target as a responsive frontend.' },
  { name: 'product-design-audit', use: 'Screenshot-backed UX, design, and accessibility audit of a flow.' },
  { name: 'product-design-design-qa', use: 'Internal QA of a built prototype against its visual source.' },
  { name: 'product-design-share', use: 'Deploy a runnable prototype and return a shareable URL.' }
]

globalThis.openCoworkExtension = {
  handlers: {
    async guide() {
      return {
        text: OVERVIEW,
        data: {
          router: 'product-design-index',
          statePath: '~/.open-cowork/state/plugins/product-design/',
          skills: SKILLS
        }
      }
    }
  }
}
