import { ipcMain, session } from 'electron'
import { BUILTIN_BROWSER_PARTITION } from '../../shared/browser-plugin'
import {
  getBrowserEmulationStatus,
  getBuiltInBrowserSession,
  shouldUseDefaultBrowserSession
} from '../browser/browser-emulation'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerBrowserHandlers(): void {
  ipcMain.handle('browser:clear-cookies', async () => {
    try {
      const browserSession = shouldUseDefaultBrowserSession()
        ? getBuiltInBrowserSession()
        : session.fromPartition(BUILTIN_BROWSER_PARTITION)
      await browserSession.clearStorageData({ storages: ['cookies'] })
      return { success: true }
    } catch (error) {
      console.error('[Browser] Failed to clear cookies:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('browser:emulation-status', async () => {
    try {
      return { success: true, status: getBrowserEmulationStatus() }
    } catch (error) {
      console.error('[Browser] Failed to read browser emulation status:', error)
      return { success: false, error: getErrorMessage(error) }
    }
  })
}
