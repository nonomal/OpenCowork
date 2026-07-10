import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const DATA_DIRECTORY_NAME = '.open-cowork'
const PROVIDER_DIRECTORY_NAME = 'ai-provider'
const INDEX_FILE_NAME = 'index.json'
const PROVIDER_FILE_PREFIX = 'provider-'
const PROVIDER_FILE_SUFFIX = '.json'
const STORAGE_FORMAT_VERSION = 1
const LEGACY_CONFIG_FILE_NAME = 'config.json'

export const AI_PROVIDER_STORAGE_KEY = 'opencowork-providers'

type JsonRecord = Record<string, unknown>

export interface PersistedProviderStore {
  state: JsonRecord
  version: number
}

interface ProviderIndexFile {
  formatVersion: number
  providerIds: string[]
  state: JsonRecord
  version: number
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeVersion(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function readJsonFile(filePath: string): unknown | null {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    console.warn(`[AIProviderStore] Failed to read ${filePath}:`, error)
    return null
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  const directory = path.dirname(filePath)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })

  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    fs.renameSync(temporaryPath, filePath)
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
}

function getProviderDirectory(dataDirectory: string): string {
  return path.join(dataDirectory, PROVIDER_DIRECTORY_NAME)
}

function getIndexPath(dataDirectory: string): string {
  return path.join(getProviderDirectory(dataDirectory), INDEX_FILE_NAME)
}

function getProviderFilePath(dataDirectory: string, providerId: string): string {
  // Provider IDs are persisted in the index and encoded before becoming a path segment so an
  // imported/custom ID can never escape ~/.open-cowork/ai-provider.
  return path.join(
    getProviderDirectory(dataDirectory),
    `${PROVIDER_FILE_PREFIX}${encodeURIComponent(providerId)}${PROVIDER_FILE_SUFFIX}`
  )
}

function isProviderFileName(fileName: string): boolean {
  return fileName.startsWith(PROVIDER_FILE_PREFIX) && fileName.endsWith(PROVIDER_FILE_SUFFIX)
}

function normalizeProvider(value: unknown): JsonRecord | null {
  if (!isPlainRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  if (!id) return null
  return { ...cloneJsonValue(value), id }
}

function normalizePersistedStore(value: unknown): PersistedProviderStore | null {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      return null
    }
  }

  if (!isPlainRecord(parsed)) return null

  const rawState = isPlainRecord(parsed.state) ? parsed.state : parsed
  if (!isPlainRecord(rawState)) return null

  return {
    state: cloneJsonValue(rawState),
    version: normalizeVersion(parsed.version)
  }
}

function splitProviderState(state: JsonRecord): { providers: JsonRecord[]; metadata: JsonRecord } {
  const providersById = new Map<string, JsonRecord>()
  for (const value of Array.isArray(state.providers) ? state.providers : []) {
    const provider = normalizeProvider(value)
    if (!provider) continue
    providersById.set(provider.id as string, provider)
  }

  const { providers: _providers, ...metadata } = state
  void _providers
  return {
    providers: Array.from(providersById.values()),
    metadata: cloneJsonValue(metadata)
  }
}

function listProviderFiles(dataDirectory: string): string[] {
  const providerDirectory = getProviderDirectory(dataDirectory)
  try {
    if (!fs.existsSync(providerDirectory)) return []
    return fs
      .readdirSync(providerDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isProviderFileName(entry.name))
      .map((entry) => path.join(providerDirectory, entry.name))
  } catch (error) {
    console.warn(`[AIProviderStore] Failed to list ${providerDirectory}:`, error)
    return []
  }
}

function readProviderFile(filePath: string, expectedId?: string): JsonRecord | null {
  const provider = normalizeProvider(readJsonFile(filePath))
  if (!provider) return null
  if (expectedId && provider.id !== expectedId) {
    console.warn(`[AIProviderStore] Ignoring provider file with mismatched ID: ${filePath}`)
    return null
  }
  return provider
}

function readProviderFiles(dataDirectory: string, providerIds?: string[]): JsonRecord[] {
  if (providerIds) {
    const result: JsonRecord[] = []
    const seen = new Set<string>()
    for (const rawId of providerIds) {
      const id = rawId.trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      const provider = readProviderFile(getProviderFilePath(dataDirectory, id), id)
      if (provider) result.push(provider)
    }
    return result
  }

  const providersById = new Map<string, JsonRecord>()
  for (const filePath of listProviderFiles(dataDirectory)) {
    const provider = readProviderFile(filePath)
    if (provider) providersById.set(provider.id as string, provider)
  }
  return Array.from(providersById.values())
}

function readProviderIndex(dataDirectory: string): ProviderIndexFile | null {
  const raw = readJsonFile(getIndexPath(dataDirectory))
  if (!isPlainRecord(raw)) return null

  const state = isPlainRecord(raw.state) ? raw.state : {}
  const providerIds = Array.isArray(raw.providerIds)
    ? raw.providerIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []

  return {
    formatVersion: normalizeVersion(raw.formatVersion),
    providerIds: Array.from(new Set(providerIds.map((id) => id.trim()))),
    state: cloneJsonValue(state),
    version: normalizeVersion(raw.version)
  }
}

function readSplitProviderStore(dataDirectory: string): PersistedProviderStore | null {
  const index = readProviderIndex(dataDirectory)
  if (index) {
    const providers = readProviderFiles(dataDirectory, index.providerIds)
    return {
      state: { ...index.state, providers },
      version: index.version
    }
  }

  const providers = readProviderFiles(dataDirectory)
  if (providers.length === 0) return null
  return {
    state: { providers },
    version: 0
  }
}

function readLegacyProviderStore(dataDirectory: string): PersistedProviderStore | null {
  const configPath = path.join(dataDirectory, LEGACY_CONFIG_FILE_NAME)
  const root = readJsonFile(configPath)
  if (!isPlainRecord(root)) return null
  return normalizePersistedStore(root[AI_PROVIDER_STORAGE_KEY])
}

function removeLegacyProviderStore(dataDirectory: string): void {
  const configPath = path.join(dataDirectory, LEGACY_CONFIG_FILE_NAME)
  const root = readJsonFile(configPath)
  if (!isPlainRecord(root) || !(AI_PROVIDER_STORAGE_KEY in root)) return

  const nextRoot = cloneJsonValue(root)
  delete nextRoot[AI_PROVIDER_STORAGE_KEY]
  writeJsonFile(configPath, nextRoot)
}

function writeSplitProviderStore(dataDirectory: string, value: unknown): PersistedProviderStore {
  const persisted = normalizePersistedStore(value)
  if (!persisted) {
    throw new Error('Invalid provider store payload')
  }

  const { providers, metadata } = splitProviderState(persisted.state)
  const providerDirectory = getProviderDirectory(dataDirectory)
  fs.mkdirSync(providerDirectory, { recursive: true, mode: 0o700 })

  const expectedPaths = new Set<string>()
  for (const provider of providers) {
    const providerId = provider.id as string
    const providerPath = getProviderFilePath(dataDirectory, providerId)
    expectedPaths.add(providerPath)
    writeJsonFile(providerPath, provider)
  }

  // Write the index only after every referenced provider file exists, so readers observe either
  // the previous complete snapshot or the new complete snapshot.
  writeJsonFile(getIndexPath(dataDirectory), {
    formatVersion: STORAGE_FORMAT_VERSION,
    providerIds: providers.map((provider) => provider.id as string),
    state: metadata,
    version: persisted.version
  } satisfies ProviderIndexFile)

  for (const filePath of listProviderFiles(dataDirectory)) {
    if (expectedPaths.has(filePath)) continue
    try {
      fs.rmSync(filePath, { force: true })
    } catch (error) {
      // The index is already authoritative, so an orphan cannot reappear. Keep saving the newer
      // state even if an antivirus/backup tool temporarily prevents cleanup.
      console.warn(`[AIProviderStore] Failed to remove orphan provider file ${filePath}:`, error)
    }
  }

  return {
    state: { ...metadata, providers: cloneJsonValue(providers) },
    version: persisted.version
  }
}

function getDefaultDataDirectory(): string {
  return path.join(os.homedir(), DATA_DIRECTORY_NAME)
}

/** Path containing index.json and one JSON file for each persisted provider. */
export function getAiProviderDirectory(dataDirectory = getDefaultDataDirectory()): string {
  return getProviderDirectory(dataDirectory)
}

/** Existing files that comprise the split provider store, useful for migrations/backups. */
export function getAiProviderStoreFiles(dataDirectory = getDefaultDataDirectory()): string[] {
  const files = listProviderFiles(dataDirectory)
  const indexPath = getIndexPath(dataDirectory)
  if (fs.existsSync(indexPath)) files.push(indexPath)
  return files
}

/**
 * Reads the split store. The first read automatically migrates the legacy
 * config.json/opencowork-providers value and removes it only after all new files were written.
 */
export function readPersistedProviderStore(
  dataDirectory = getDefaultDataDirectory()
): PersistedProviderStore | null {
  const splitStore = readSplitProviderStore(dataDirectory)
  if (splitStore) return splitStore

  const legacyStore = readLegacyProviderStore(dataDirectory)
  if (!legacyStore) return null

  try {
    const migrated = writeSplitProviderStore(dataDirectory, legacyStore)
    removeLegacyProviderStore(dataDirectory)
    return migrated
  } catch (error) {
    // Never hide usable legacy data merely because the target directory is temporarily unwritable.
    console.error('[AIProviderStore] Legacy migration failed; continuing with config.json:', error)
    return legacyStore
  }
}

export function writePersistedProviderStore(
  value: unknown,
  dataDirectory = getDefaultDataDirectory()
): PersistedProviderStore {
  const persisted = writeSplitProviderStore(dataDirectory, value)
  // A normal save after an interrupted migration should also retire the legacy duplicate.
  removeLegacyProviderStore(dataDirectory)
  return persisted
}

export function clearPersistedProviderStore(dataDirectory = getDefaultDataDirectory()): void {
  fs.rmSync(getProviderDirectory(dataDirectory), { recursive: true, force: true })
  removeLegacyProviderStore(dataDirectory)
}
