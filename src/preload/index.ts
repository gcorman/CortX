import { contextBridge, ipcRenderer } from 'electron'
import type { CortxAPI } from '../shared/types'

const api: CortxAPI = {
  db: {
    getFiles: () => ipcRenderer.invoke('db:getFiles'),
    getEntities: () => ipcRenderer.invoke('db:getEntities'),
    getRelations: () => ipcRenderer.invoke('db:getRelations'),
    search: (query: string) => ipcRenderer.invoke('db:search', query),
    getGraphData: () => ipcRenderer.invoke('db:getGraphData'),
    getTags: () => ipcRenderer.invoke('db:getTags')
  },
  files: {
    read: (path: string) => ipcRenderer.invoke('files:read', path),
    write: (path: string, content: string) => ipcRenderer.invoke('files:write', path, content),
    list: (dir?: string) => ipcRenderer.invoke('files:list', dir),
    exists: (path: string) => ipcRenderer.invoke('files:exists', path)
  },
  llm: {
    send: (messages, systemPrompt?) => ipcRenderer.invoke('llm:send', messages, systemPrompt),
    getConfig: () => ipcRenderer.invoke('llm:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('llm:setConfig', config)
  },
  git: {
    commit: (message: string) => ipcRenderer.invoke('git:commit', message),
    revert: (hash: string) => ipcRenderer.invoke('git:revert', hash),
    log: (count?: number) => ipcRenderer.invoke('git:log', count),
    status: () => ipcRenderer.invoke('git:status')
  },
  agent: {
    process: (input: string) => ipcRenderer.invoke('agent:process', input),
    execute: (actions: unknown[], summary: string) => ipcRenderer.invoke('agent:execute', actions, summary),
    preview: (action: unknown) => ipcRenderer.invoke('agent:preview', action),
    undo: (commitHash: string) => ipcRenderer.invoke('agent:undo', commitHash),
    saveManualEdit: (filePath: string, content: string) =>
      ipcRenderer.invoke('agent:saveManualEdit', filePath, content),
    saveBrief: (subject: string, body: string, kind?: string) =>
      ipcRenderer.invoke('agent:saveBrief', subject, body, kind),
    listFiches: () => ipcRenderer.invoke('agent:listFiches'),
    deleteFiche: (filePath: string) => ipcRenderer.invoke('agent:deleteFiche', filePath),
    rewriteFile: (filePath: string) => ipcRenderer.invoke('agent:rewriteFile', filePath),
    deleteFile: (filePath: string) => ipcRenderer.invoke('agent:deleteFile', filePath)
  },
  app: {
    getBasePath: () => ipcRenderer.invoke('app:getBasePath'),
    setBasePath: (path: string) => ipcRenderer.invoke('app:setBasePath', path),
    openDirectoryDialog: () => ipcRenderer.invoke('app:openDirectoryDialog'),
    getConfig: () => ipcRenderer.invoke('app:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('app:setConfig', config),
    resetBase: () => ipcRenderer.invoke('app:resetBase')
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  }
}

contextBridge.exposeInMainWorld('cortx', api)
