import { createIpcStateStorage } from './ipc-state-storage'

/**
 * Zustand storage for provider state. The main process splits this payload into
 * ~/.open-cowork/ai-provider/index.json and one JSON file per provider.
 */
export const aiProviderStorage = createIpcStateStorage({
  getChannel: 'ai-provider:get',
  setChannel: 'ai-provider:set'
})
