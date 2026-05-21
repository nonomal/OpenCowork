import { app, session, type Session } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir, platform } from 'os'
import { readSettings } from '../ipc/settings-handlers'
import {
  BROWSER_SETTINGS_STORAGE_KEY,
  BROWSER_USER_DATA_REUSE_SETTING_KEY,
  BUILTIN_BROWSER_PARTITION,
  isBrowserUserDataReuseEnabled
} from '../../shared/browser-plugin'

interface BrowserProfileCandidate {
  browserName: string
  dataRoot: string
  profilePath: string
}

export interface BrowserSessionStorageMode {
  reuseEnabled: boolean
  browserName: string | null
  browserDataRoot: string | null
  browserProfilePath: string | null
  sessionDataPath: string
  usingDetectedBrowserProfile: boolean
}

export interface BrowserEmulationStatus extends BrowserSessionStorageMode {
  userAgent: string
  acceptLanguages: string
  browserSessionStoragePath: string | null
}

let cachedStorageMode: BrowserSessionStorageMode | null = null
let requestHeaderEmulationConfigured = false

function readPersistedSettingsState(): Record<string, unknown> {
  const persisted = readSettings()[BROWSER_SETTINGS_STORAGE_KEY]
  if (!persisted || typeof persisted !== 'object') return {}
  const state = (persisted as { state?: unknown }).state
  return state && typeof state === 'object' ? (state as Record<string, unknown>) : {}
}

export function readBrowserUserDataReuseEnabled(): boolean {
  return isBrowserUserDataReuseEnabled(
    readPersistedSettingsState()[BROWSER_USER_DATA_REUSE_SETTING_KEY]
  )
}

function getBrowserProfileCandidates(): BrowserProfileCandidate[] {
  const home = homedir()

  if (platform() === 'darwin') {
    return [
      {
        browserName: 'Google Chrome',
        dataRoot: join(home, 'Library/Application Support/Google/Chrome'),
        profilePath: join(home, 'Library/Application Support/Google/Chrome/Default')
      },
      {
        browserName: 'Microsoft Edge',
        dataRoot: join(home, 'Library/Application Support/Microsoft Edge'),
        profilePath: join(home, 'Library/Application Support/Microsoft Edge/Default')
      },
      {
        browserName: 'Brave',
        dataRoot: join(home, 'Library/Application Support/BraveSoftware/Brave-Browser'),
        profilePath: join(home, 'Library/Application Support/BraveSoftware/Brave-Browser/Default')
      },
      {
        browserName: 'Chromium',
        dataRoot: join(home, 'Library/Application Support/Chromium'),
        profilePath: join(home, 'Library/Application Support/Chromium/Default')
      }
    ]
  }

  if (platform() === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData/Local')
    return [
      {
        browserName: 'Google Chrome',
        dataRoot: join(localAppData, 'Google/Chrome/User Data'),
        profilePath: join(localAppData, 'Google/Chrome/User Data/Default')
      },
      {
        browserName: 'Microsoft Edge',
        dataRoot: join(localAppData, 'Microsoft/Edge/User Data'),
        profilePath: join(localAppData, 'Microsoft/Edge/User Data/Default')
      },
      {
        browserName: 'Brave',
        dataRoot: join(localAppData, 'BraveSoftware/Brave-Browser/User Data'),
        profilePath: join(localAppData, 'BraveSoftware/Brave-Browser/User Data/Default')
      },
      {
        browserName: 'Chromium',
        dataRoot: join(localAppData, 'Chromium/User Data'),
        profilePath: join(localAppData, 'Chromium/User Data/Default')
      }
    ]
  }

  return [
    {
      browserName: 'Google Chrome',
      dataRoot: join(home, '.config/google-chrome'),
      profilePath: join(home, '.config/google-chrome/Default')
    },
    {
      browserName: 'Microsoft Edge',
      dataRoot: join(home, '.config/microsoft-edge'),
      profilePath: join(home, '.config/microsoft-edge/Default')
    },
    {
      browserName: 'Brave',
      dataRoot: join(home, '.config/BraveSoftware/Brave-Browser'),
      profilePath: join(home, '.config/BraveSoftware/Brave-Browser/Default')
    },
    {
      browserName: 'Chromium',
      dataRoot: join(home, '.config/chromium'),
      profilePath: join(home, '.config/chromium/Default')
    }
  ]
}

function resolveDetectedBrowserProfile(): BrowserProfileCandidate | null {
  return (
    getBrowserProfileCandidates().find((candidate) => existsSync(candidate.profilePath)) ?? null
  )
}

export function resolveBrowserSessionStorageMode(
  appUserDataPath: string
): BrowserSessionStorageMode {
  if (cachedStorageMode) return cachedStorageMode

  const reuseEnabled = readBrowserUserDataReuseEnabled()
  const detectedProfile = reuseEnabled ? resolveDetectedBrowserProfile() : null
  const sessionDataPath = detectedProfile?.profilePath ?? join(appUserDataPath, 'session-data')

  cachedStorageMode = {
    reuseEnabled,
    browserName: detectedProfile?.browserName ?? null,
    browserDataRoot: detectedProfile?.dataRoot ?? null,
    browserProfilePath: detectedProfile?.profilePath ?? null,
    sessionDataPath,
    usingDetectedBrowserProfile: Boolean(detectedProfile)
  }

  return cachedStorageMode
}

export function shouldUseDefaultBrowserSession(): boolean {
  const mode = cachedStorageMode ?? resolveBrowserSessionStorageMode(app.getPath('userData'))
  return mode.reuseEnabled
}

export function getBuiltInBrowserSession(): Session {
  return shouldUseDefaultBrowserSession()
    ? session.defaultSession
    : session.fromPartition(BUILTIN_BROWSER_PARTITION)
}

function getPlatformUserAgentToken(): string {
  if (platform() === 'darwin') return 'Macintosh; Intel Mac OS X 10_15_7'
  if (platform() === 'win32') return 'Windows NT 10.0; Win64; x64'
  return 'X11; Linux x86_64'
}

function getChromeLikeUserAgent(): string {
  return `Mozilla/5.0 (${getPlatformUserAgentToken()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`
}

function getAcceptLanguages(): string {
  const locale = app.getLocale() || 'en-US'
  const normalized = locale.replace('_', '-')
  const base = normalized.split('-')[0] || 'en'

  if (base === 'zh') {
    return normalized.toLowerCase().includes('tw') || normalized.toLowerCase().includes('hk')
      ? `${normalized},zh-TW;q=0.9,zh;q=0.8,en;q=0.7`
      : `${normalized},zh-CN;q=0.9,zh;q=0.8,en;q=0.7`
  }

  if (base === 'en') {
    return `${normalized},en;q=0.9`
  }

  return `${normalized},${base};q=0.9,en;q=0.8`
}

function getChromeMajorVersion(): string {
  return process.versions.chrome.split('.')[0] || '120'
}

function getClientHintsPlatform(): string {
  if (platform() === 'darwin') return '"macOS"'
  if (platform() === 'win32') return '"Windows"'
  return '"Linux"'
}

function applyBrowserLikeHeaders(details: Electron.OnBeforeSendHeadersListenerDetails): void {
  if (details.webContents?.getType() !== 'webview') return

  const chromeMajor = getChromeMajorVersion()
  details.requestHeaders['User-Agent'] = getChromeLikeUserAgent()
  details.requestHeaders['Accept-Language'] = getAcceptLanguages()
  details.requestHeaders['sec-ch-ua'] =
    `"Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}", "Not.A/Brand";v="99"`
  details.requestHeaders['sec-ch-ua-mobile'] = '?0'
  details.requestHeaders['sec-ch-ua-platform'] = getClientHintsPlatform()
}

export function configureBuiltInBrowserSession(): BrowserEmulationStatus {
  const browserSession = getBuiltInBrowserSession()
  const userAgent = getChromeLikeUserAgent()
  const acceptLanguages = getAcceptLanguages()

  if (readBrowserUserDataReuseEnabled()) {
    browserSession.setUserAgent(userAgent, acceptLanguages)

    if (!requestHeaderEmulationConfigured) {
      requestHeaderEmulationConfigured = true
      browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
        applyBrowserLikeHeaders(details)
        callback({ requestHeaders: details.requestHeaders })
      })
    }
  }

  const mode = cachedStorageMode ?? resolveBrowserSessionStorageMode(app.getPath('userData'))
  return {
    ...mode,
    userAgent,
    acceptLanguages,
    browserSessionStoragePath: browserSession.getStoragePath()
  }
}

export function getBrowserEmulationStatus(): BrowserEmulationStatus {
  const browserSession = getBuiltInBrowserSession()
  const mode = cachedStorageMode ?? resolveBrowserSessionStorageMode(app.getPath('userData'))

  return {
    ...mode,
    userAgent: getChromeLikeUserAgent(),
    acceptLanguages: getAcceptLanguages(),
    browserSessionStoragePath: browserSession.getStoragePath()
  }
}
