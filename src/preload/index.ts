import { contextBridge, ipcRenderer } from 'electron'
import type { CortxAPI } from '../shared/types'

const api: CortxAPI = {
  db: {
    getFiles: () => ipcRenderer.invoke('db:getFiles'),
    getEntities: () => ipcRenderer.invoke('db:getEntities'),
    getRelations: () => ipcRenderer.invoke('db:getRelations'),
    search: (query: string) => ipcRenderer.invoke('db:search', query),
    getGraphData: () => ipcRenderer.invoke('db:getGraphData'),
    getTags: () => ipcRenderer.invoke('db:getTags'),
    getFilesByTag: (tag: string) => ipcRenderer.invoke('db:getFilesByTag', tag),
    getImplicitBacklinks: (filePath: string, limit?: number, threshold?: number) =>
      ipcRenderer.invoke('db:getImplicitBacklinks', filePath, limit, threshold),
    getTimeline: (limit?: number) => ipcRenderer.invoke('db:getTimeline', limit)
  },
  files: {
    read: (path: string) => ipcRenderer.invoke('files:read', path),
    write: (path: string, content: string) => ipcRenderer.invoke('files:write', path, content),
    list: (dir?: string) => ipcRenderer.invoke('files:list', dir),
    exists: (path: string) => ipcRenderer.invoke('files:exists', path),
    openMarkdownDialog: () => ipcRenderer.invoke('files:openMarkdownDialog'),
    readExternal: (absolutePath: string) => ipcRenderer.invoke('files:readExternal', absolutePath),
    create: (type: string, title: string) => ipcRenderer.invoke('files:create', { type, title }),
    updateTitle: (path: string, newTitle: string) => ipcRenderer.invoke('files:updateTitle', { path, newTitle }),
    export: (format: 'html' | 'json') => ipcRenderer.invoke('files:export', format)
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
    processStream: (input: string, requestId: string) =>
      ipcRenderer.invoke('agent:processStream', input, requestId),
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
    deleteFile: (filePath: string) => ipcRenderer.invoke('agent:deleteFile', filePath),
    wikiToMd: (topic: string, lang?: string) => ipcRenderer.invoke('agent:wikiToMd', topic, lang),
    previewWebContext: (input: string) => ipcRenderer.invoke('agent:previewWebContext', input),
    importRawMarkdown: (filename: string, content: string) =>
      ipcRenderer.invoke('agent:importRawMarkdown', filename, content)
  },
  app: {
    getBasePath: () => ipcRenderer.invoke('app:getBasePath'),
    setBasePath: (path: string) => ipcRenderer.invoke('app:setBasePath', path),
    openDirectoryDialog: () => ipcRenderer.invoke('app:openDirectoryDialog'),
    getConfig: () => ipcRenderer.invoke('app:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('app:setConfig', config),
    resetBase: () => ipcRenderer.invoke('app:resetBase'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url)
  },
  library: {
    ingest: (absolutePath: string) => ipcRenderer.invoke('library:ingest', absolutePath),
    ingestMany: (absolutePaths: string[]) => ipcRenderer.invoke('library:ingestMany', absolutePaths),
    list: (folder?: string) => ipcRenderer.invoke('library:list', folder),
    get: (id: string) => ipcRenderer.invoke('library:get', id),
    delete: (id: string) => ipcRenderer.invoke('library:delete', id),
    rename: (id: string, newFilename: string) => ipcRenderer.invoke('library:rename', id, newFilename),
    getPreview: (id: string) => ipcRenderer.invoke('library:getPreview', id),
    openOriginal: (id: string) => ipcRenderer.invoke('library:openOriginal', id),
    search: (query: string, mode?: 'lexical' | 'semantic' | 'hybrid', limit?: number) =>
      ipcRenderer.invoke('library:search', query, mode, limit),
    getLinkedContext: (ref: string, contextQuery: string, limit?: number) =>
      ipcRenderer.invoke('library:getLinkedContext', ref, contextQuery, limit),
    reindexAll: () => ipcRenderer.invoke('library:reindexAll'),
    getStatus: () => ipcRenderer.invoke('library:getStatus'),
    openImportDialog: () => ipcRenderer.invoke('library:openImportDialog')
  },
  canvas: {
    list: () => ipcRenderer.invoke('canvas:list'),
    load: (id: string) => ipcRenderer.invoke('canvas:load', id),
    save: (config: unknown) => ipcRenderer.invoke('canvas:save', config),
    create: (name: string) => ipcRenderer.invoke('canvas:create', name),
    delete: (id: string) => ipcRenderer.invoke('canvas:delete', id),
    rename: (id: string, newName: string) => ipcRenderer.invoke('canvas:rename', id, newName),
    agentSuggest: (canvasId: string, prompt: string, useInternet?: boolean) =>
      ipcRenderer.invoke('canvas:agentSuggest', canvasId, prompt, useInternet ?? false)
  },
  galaxy: {
    getData: () => ipcRenderer.invoke('galaxy:getData'),
    renameCluster: (topMemberLabel: string, newLabel: string) =>
      ipcRenderer.invoke('galaxy:renameCluster', topMemberLabel, newLabel)
  },
  idle: {
    start: () => ipcRenderer.invoke('idle:start'),
    stop: () => ipcRenderer.invoke('idle:stop'),
    pause: () => ipcRenderer.invoke('idle:pause'),
    resume: () => ipcRenderer.invoke('idle:resume'),
    getInsights: () => ipcRenderer.invoke('idle:getInsights'),
    getDraftInsights: () => ipcRenderer.invoke('idle:getDraftInsights'),
    dismissInsight: (id: string) => ipcRenderer.invoke('idle:dismissInsight', id),
    saveInsightAsFiche: (id: string) => ipcRenderer.invoke('idle:saveInsightAsFiche', id),
    promoteDraft: (id: string) => ipcRenderer.invoke('idle:promoteDraft', id),
    getConfig: () => ipcRenderer.invoke('idle:getConfig'),
    setConfig: (config: { intervalSeconds?: number; confidenceThreshold?: number }) =>
      ipcRenderer.invoke('idle:setConfig', config)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  }
}

contextBridge.exposeInMainWorld('cortx', api)
