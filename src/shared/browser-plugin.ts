export const BUILTIN_BROWSER_PARTITION = 'persist:opencowork-browser'
export const BROWSER_SETTINGS_STORAGE_KEY = 'opencowork-settings'
export const BROWSER_USER_DATA_REUSE_SETTING_KEY = 'browserUserDataReuseEnabled'

export function isBrowserUserDataReuseEnabled(value: unknown): boolean {
  return value !== false
}

export function stripElectronFromUserAgent(userAgent: string): string {
  return userAgent.replace(/\sElectron\/[^\s]+/g, '').trim()
}
