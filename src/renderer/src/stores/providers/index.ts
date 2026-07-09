export type { BuiltinProviderPreset } from './types'

import { routinAiPlanPreset, routinAiPreset } from './routin-ai'
import { openaiPreset } from './openai'
import { anthropicPreset } from './anthropic'
import { longcatPreset } from './longcat'
import { googlePreset } from './google'
import { deepseekPreset } from './deepseek'
import { openrouterPreset } from './openrouter'
import { ollamaPreset } from './ollama'
import { azureOpenaiPreset } from './azure-openai'
import { moonshotCodingPreset, moonshotPreset } from './moonshot'
import { qwenCodingPreset, qwenPreset } from './qwen'
import { minimaxCodingPreset, minimaxPreset } from './minimax'
import { baiduCodingPreset, baiduPreset } from './baidu'
import { siliconflowPreset } from './siliconflow'
import { giteeAiPreset } from './gitee-ai'
import { codexOAuthPreset } from './codex-oauth'
import { copilotOAuthPreset } from './copilot-oauth'
import { xiaomiCodingPreset, xiaomiPreset } from './xiaomi'
import { bigmodelCodingPreset, bigmodelPreset } from './bigmodel'
import { volcenginePreset } from './volcengine'
import { xaiPreset } from './x-ai'
import type { BuiltinProviderPreset } from './types'

// Provider protocols whose native/server-side web search we can inject: Anthropic
// exposes the `web_search_20250305` server tool, and the OpenAI Responses API exposes
// the `web_search` tool. Chat models on these protocols ship with built-in search
// enabled by default; users can still opt out per-model (provider settings) or
// per-session (input-box model settings). Explicit preset values are never overridden.
function applyBuiltinSearchDefaults(preset: BuiltinProviderPreset): BuiltinProviderPreset {
  let changed = false
  const defaultModels = preset.defaultModels.map((model) => {
    const requestType = model.type ?? preset.type
    const category = model.category ?? 'chat'
    const supported =
      category === 'chat' && (requestType === 'anthropic' || requestType === 'openai-responses')
    if (!supported || model.enableBuiltinSearch !== undefined) return model
    changed = true
    return { ...model, enableBuiltinSearch: true }
  })
  return changed ? { ...preset, defaultModels } : preset
}

export const builtinProviderPresets: BuiltinProviderPreset[] = [
  routinAiPreset,
  routinAiPlanPreset,
  openaiPreset,
  anthropicPreset,
  longcatPreset,
  googlePreset,
  deepseekPreset,
  openrouterPreset,
  ollamaPreset,
  azureOpenaiPreset,
  moonshotCodingPreset,
  moonshotPreset,
  qwenCodingPreset,
  qwenPreset,
  baiduCodingPreset,
  baiduPreset,
  minimaxCodingPreset,
  minimaxPreset,
  siliconflowPreset,
  giteeAiPreset,
  codexOAuthPreset,
  copilotOAuthPreset,
  xiaomiCodingPreset,
  xiaomiPreset,
  bigmodelCodingPreset,
  bigmodelPreset,
  volcenginePreset,
  xaiPreset
].map(applyBuiltinSearchDefaults)
