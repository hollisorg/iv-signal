// The renderer gets exactly two doors into the app: a named-method call that the main process checks against an
// allowlist, and a few named event streams (chat updates, agent setup progress, data changes).
import { contextBridge, ipcRenderer, webUtils } from 'electron'

const STREAMS = new Set(['chat:changed', 'agents:setupChanged', 'data:changed', 'chat:window', 'chat:composer', 'ui:guide', 'update:changed'])

contextBridge.exposeInMainWorld('ivsignal', {
  call: (method, args) => ipcRenderer.invoke('ivsignal:call', method, args),
  on: (channel, cb) => {
    if (!STREAMS.has(channel)) throw new Error(`No stream ${channel}`)
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  // a file dropped on the chat: its path on disk (for CSV attachments)
  pathFor: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return null
    }
  },
})
