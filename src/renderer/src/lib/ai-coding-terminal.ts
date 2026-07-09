import type { AIModelConfig, AIProvider, ProviderType } from '@renderer/lib/api/types'
import { normalizeProviderBaseUrl, useProviderStore } from '@renderer/stores/provider-store'
import {
  type ClaudeCodeConfig,
  type CodexConfig,
  useSettingsStore
} from '@renderer/stores/settings-store'

export type AiCodingStatusReason =
  | 'ready'
  | 'configMissing'
  | 'providerMissing'
  | 'providerDisabled'
  | 'unsupportedAuth'
  | 'apiKeyMissing'
  | 'baseUrlMissing'
  | 'modelMissing'
  | 'protocolUnsupported'

export interface AiCodingConfigStatus {
  valid: boolean
  reason: AiCodingStatusReason
}

export interface AiCodingProviderModelGroup {
  provider: AIProvider
  models: AIModelConfig[]
}

export interface AiCodingLaunch {
  title: string
  command: string
  envOverrides: Record<string, string>
}

function getModelRequestType(provider: AIProvider, model: AIModelConfig): ProviderType {
  return model.type ?? provider.type
}

function isRoutinAiAnthropicCompatibleModel(provider: AIProvider, model: AIModelConfig): boolean {
  const builtinId = provider.builtinId ?? ''
  if (builtinId !== 'routin-ai' && builtinId !== 'routin-ai-plan') return false
  return /^gpt-5\.(?:4|5|6)(?:$|-)/i.test(model.id.trim())
}

function isClaudeCodeAnthropicModel(provider: AIProvider, model: AIModelConfig): boolean {
  return (
    getModelRequestType(provider, model) === 'anthropic' ||
    isRoutinAiAnthropicCompatibleModel(provider, model)
  )
}

function isChatModel(model: AIModelConfig): boolean {
  return (model.category ?? 'chat') === 'chat'
}

function hasApiKeyAuth(provider: AIProvider): boolean {
  return (provider.authMode ?? 'apiKey') === 'apiKey'
}

function hasUsableApiKey(provider: AIProvider): boolean {
  return provider.apiKey.trim().length > 0
}

function getProvider(providerId: string): AIProvider | null {
  return (
    useProviderStore.getState().providers.find((provider) => provider.id === providerId) ?? null
  )
}

function getModel(provider: AIProvider, modelId: string): AIModelConfig | null {
  return provider.models.find((model) => model.id === modelId) ?? null
}

function validateProvider(provider: AIProvider | null): AiCodingConfigStatus {
  if (!provider) return { valid: false, reason: 'providerMissing' }
  if (!provider.enabled) return { valid: false, reason: 'providerDisabled' }
  if (!hasApiKeyAuth(provider)) return { valid: false, reason: 'unsupportedAuth' }
  if (!hasUsableApiKey(provider)) return { valid: false, reason: 'apiKeyMissing' }
  if (!provider.baseUrl.trim()) return { valid: false, reason: 'baseUrlMissing' }
  return { valid: true, reason: 'ready' }
}

export function getClaudeCodeProviderGroups(providers: AIProvider[]): AiCodingProviderModelGroup[] {
  return providers
    .filter((provider) => provider.enabled && hasApiKeyAuth(provider) && hasUsableApiKey(provider))
    .map((provider) => ({
      provider,
      models: provider.models.filter(
        (model) =>
          model.enabled && isChatModel(model) && isClaudeCodeAnthropicModel(provider, model)
      )
    }))
    .filter((group) => group.models.length > 0)
}

export function getCodexProviderGroups(providers: AIProvider[]): AiCodingProviderModelGroup[] {
  return providers
    .filter((provider) => provider.enabled && hasApiKeyAuth(provider) && hasUsableApiKey(provider))
    .map((provider) => ({
      provider,
      models: provider.models.filter(
        (model) =>
          model.enabled &&
          isChatModel(model) &&
          getModelRequestType(provider, model) === 'openai-responses'
      )
    }))
    .filter((group) => group.models.length > 0)
}

export function validateClaudeCodeConfig(config?: ClaudeCodeConfig | null): AiCodingConfigStatus {
  if (!config) return { valid: false, reason: 'configMissing' }

  const provider = getProvider(config.providerId)
  const providerStatus = validateProvider(provider)
  if (!providerStatus.valid || !provider) return providerStatus

  const modelIds = [
    config.defaultModelId,
    config.smallFastModelId,
    config.sonnetModelId,
    config.opusModelId,
    config.haikuModelId
  ].filter((modelId) => modelId.trim().length > 0)
  if (modelIds.length === 0) return { valid: false, reason: 'modelMissing' }

  for (const modelId of modelIds) {
    const model = getModel(provider, modelId)
    if (!model?.enabled) return { valid: false, reason: 'modelMissing' }
    if (!isClaudeCodeAnthropicModel(provider, model)) {
      return { valid: false, reason: 'protocolUnsupported' }
    }
  }

  return { valid: true, reason: 'ready' }
}

export function validateCodexConfig(config?: CodexConfig | null): AiCodingConfigStatus {
  if (!config) return { valid: false, reason: 'configMissing' }

  const provider = getProvider(config.providerId)
  const providerStatus = validateProvider(provider)
  if (!providerStatus.valid || !provider) return providerStatus

  const model = getModel(provider, config.modelId)
  if (!model?.enabled) return { valid: false, reason: 'modelMissing' }
  if (getModelRequestType(provider, model) !== 'openai-responses') {
    return { valid: false, reason: 'protocolUnsupported' }
  }

  return { valid: true, reason: 'ready' }
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function safeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
  const normalized = sanitized.replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function safeEnvKey(value: string): string {
  return safeIdentifier(value.toUpperCase(), 'OPEN_COWORK_CODEX_API_KEY')
}

export function resolveClaudeCodeLaunch(configId: string): AiCodingLaunch | null {
  const config = useSettingsStore
    .getState()
    .claudeCodeConfigs.find((candidate) => candidate.id === configId)
  if (!validateClaudeCodeConfig(config).valid || !config) return null

  const provider = getProvider(config.providerId)
  if (!provider) return null

  const envOverrides: Record<string, string> = {
    ANTHROPIC_AUTH_TOKEN: provider.apiKey.trim(),
    ANTHROPIC_BASE_URL: normalizeProviderBaseUrl(provider.baseUrl, 'anthropic')
  }

  const modelEnv: Array<[string, string]> = [
    ['ANTHROPIC_MODEL', config.defaultModelId],
    ['ANTHROPIC_SMALL_FAST_MODEL', config.smallFastModelId],
    ['ANTHROPIC_DEFAULT_SONNET_MODEL', config.sonnetModelId],
    ['ANTHROPIC_DEFAULT_OPUS_MODEL', config.opusModelId],
    ['ANTHROPIC_DEFAULT_HAIKU_MODEL', config.haikuModelId]
  ]

  for (const [key, modelId] of modelEnv) {
    const trimmed = modelId.trim()
    if (trimmed) envOverrides[key] = trimmed
  }

  const command = config.permissionOptions.includes('dangerouslySkipPermissions')
    ? 'claude --dangerously-skip-permissions'
    : 'claude'

  return {
    title: `ClaudeCode · ${config.name}`,
    command,
    envOverrides
  }
}

export function resolveCodexLaunch(configId: string): AiCodingLaunch | null {
  const config = useSettingsStore
    .getState()
    .codexConfigs.find((candidate) => candidate.id === configId)
  if (!validateCodexConfig(config).valid || !config) return null

  const provider = getProvider(config.providerId)
  if (!provider) return null

  const providerKey = safeIdentifier(`opencowork_${config.id}`, 'opencowork_codex')
  const envKey = safeEnvKey(`OPEN_COWORK_CODEX_${config.id}_API_KEY`)
  const baseUrl = normalizeProviderBaseUrl(provider.baseUrl, 'openai-responses')
  const configOverrides = [
    `model_provider=${tomlString(providerKey)}`,
    `model_providers.${providerKey}.name=${tomlString(provider.name)}`,
    `model_providers.${providerKey}.base_url=${tomlString(baseUrl)}`,
    `model_providers.${providerKey}.env_key=${tomlString(envKey)}`,
    `model_providers.${providerKey}.wire_api=${tomlString('responses')}`
  ]

  const commandParts = ['codex', '-m', shellQuote(config.modelId)]
  for (const override of configOverrides) {
    commandParts.push('-c', shellQuote(override))
  }

  return {
    title: `Codex · ${config.name}`,
    command: commandParts.join(' '),
    envOverrides: {
      [envKey]: provider.apiKey.trim()
    }
  }
}
