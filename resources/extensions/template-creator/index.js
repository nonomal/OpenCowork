/* eslint-disable @typescript-eslint/explicit-function-return-type */

// Template Creator is a skill-driven plugin: the real capability lives in its
// single bundled skill (template-creator). The native extension host requires
// at least one tool, so this single read-only "guide" tool serves as the
// agent's entry point — it summarizes the skill and points the agent at it.

const OVERVIEW =
  'Template Creator turns a DOCX, PPTX, or XLSX reference into a reusable personal ' +
  'artifact-template skill, or updates an existing personal artifact template. It ships as a ' +
  'single skill named "template-creator". Load the "template-creator" skill (via the Skill tool) ' +
  'and follow its create/update workflow. The skill keeps the source Office file inside the ' +
  'generated template so later artifact creation can clone or import it precisely.'

const SKILLS = [
  {
    name: 'template-creator',
    use: 'Create or update a personal artifact-template skill from a DOCX, PPTX, or XLSX reference.'
  }
]

globalThis.openCoworkExtension = {
  handlers: {
    async guide() {
      return {
        text: OVERVIEW,
        data: {
          skill: 'template-creator',
          statePath: '~/.open-cowork/state/plugins/template-creator/',
          skills: SKILLS
        }
      }
    }
  }
}
