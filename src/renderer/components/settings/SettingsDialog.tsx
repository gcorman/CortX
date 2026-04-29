import { useState, useEffect } from 'react'
import { X, Server, Cloud, Cpu, Check, AlertCircle, FolderOpen, Sun, Moon, Trash2, Globe, Lock, Wifi, Send } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useGraphStore } from '../../stores/graphStore'
import { useFileStore } from '../../stores/fileStore'
import { useAgentStore } from '../../stores/agentStore'
import { useT } from '../../i18n'
import type { LLMConfig, AppLanguage } from '../../../shared/types'

type Provider = 'anthropic' | 'openai-compatible' | 'google-ai'

interface ProviderPreset {
  id: Provider
  label: string
  description: string
  icon: React.ReactNode
  defaultModel: string
  defaultBaseUrl?: string
  needsApiKey: boolean
}

const LOCAL_MODEL_EXAMPLES = [
  { name: 'llama.cpp (llama-server)', url: 'http://localhost:8080/v1', model: 'default' },
  { name: 'Ollama', url: 'http://localhost:11434/v1', model: 'mistral' },
  { name: 'LM Studio', url: 'http://localhost:1234/v1', model: 'local-model' }
]

export function SettingsDialog(): React.JSX.Element {
  const { settingsOpen, toggleSettings, addToast, theme, setTheme, setLanguage, language } = useUIStore()
  const { loadGraph, clearGraph } = useGraphStore()
  const loadFiles = useFileStore((s) => s.loadFiles)
  const clearActions = useAgentStore((s) => s.clearActions)
  const t = useT()

  const [provider, setProvider] = useState<Provider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [basePath, setBasePath] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [resetConfirm, setResetConfirm] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const [telegramToken, setTelegramToken] = useState('')
  const [telegramChatIds, setTelegramChatIds] = useState('')
  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const [telegramRunning, setTelegramRunning] = useState(false)

  const PROVIDER_PRESETS: ProviderPreset[] = [
    {
      id: 'anthropic',
      label: 'Claude (Anthropic)',
      description: t.settings.anthropicDesc,
      icon: <Cloud size={18} />,
      defaultModel: 'claude-sonnet-4-20250514',
      needsApiKey: true
    },
    {
      id: 'google-ai',
      label: 'Google AI',
      description: t.settings.googleAiDesc,
      icon: <Globe size={18} />,
      defaultModel: 'gemini-2.0-flash-lite',
      needsApiKey: true
    },
    {
      id: 'openai-compatible',
      label: 'Local / OpenAI-compatible',
      description: t.settings.localDesc,
      icon: <Cpu size={18} />,
      defaultModel: 'mistral',
      defaultBaseUrl: 'http://localhost:8080/v1',
      needsApiKey: false
    }
  ]

  // Load current config on open
  useEffect(() => {
    if (settingsOpen) {
      loadConfig()
      setResetConfirm(false)
    }
  }, [settingsOpen])

  async function loadConfig(): Promise<void> {
    try {
      const config = await window.cortx.app.getConfig()
      setProvider(config.llm.provider)
      setApiKey(config.llm.apiKey === '***' ? '' : config.llm.apiKey)
      setModel(config.llm.model)
      setBaseUrl(config.llm.baseUrl || '')
      setBasePath(config.basePath)
      setConnectionStatus('idle')
      if (config.telegram) {
        setTelegramToken(config.telegram.token === '***' ? '' : config.telegram.token)
        setTelegramChatIds(config.telegram.allowedChatIds.join('\n'))
        setTelegramEnabled(config.telegram.enabled)
      }
      const status = await window.cortx.telegram.getStatus()
      setTelegramRunning(status.running)
    } catch {
      // ignore
    }
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true)
    try {
      const trimmedBasePath = basePath.trim()
      const llmConfig: LLMConfig = {
        provider,
        apiKey,
        model,
        ...(provider === 'openai-compatible' ? { baseUrl } : {})
      }
      const parsedChatIds = telegramChatIds
        .split(/[\n,]+/)
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n))
      await window.cortx.app.setConfig({
        llm: llmConfig,
        language,
        telegram: { token: telegramToken, allowedChatIds: parsedChatIds, enabled: telegramEnabled }
      })

      const currentBasePath = await window.cortx.app.getBasePath()
      if (trimmedBasePath && trimmedBasePath !== currentBasePath) {
        await window.cortx.app.setBasePath(trimmedBasePath)
      }

      addToast(t.settings.configSaved, 'success')
      toggleSettings()
    } catch (err) {
      addToast(
        err instanceof Error && err.message ? err.message : t.settings.saveError,
        'error'
      )
    }
    setIsSaving(false)
  }

  async function handleTestConnection(): Promise<void> {
    setIsTestingConnection(true)
    setConnectionStatus('idle')
    try {
      const llmConfig: LLMConfig = {
        provider,
        apiKey,
        model,
        ...(provider === 'openai-compatible' ? { baseUrl } : {})
      }
      await window.cortx.app.setConfig({ llm: llmConfig })

      const response = await window.cortx.llm.send(
        [{ role: 'user', content: 'Reply with just "ok".' }]
      )
      if (response) {
        setConnectionStatus('success')
        addToast(t.settings.connectionOk + ' !', 'success')
      } else {
        setConnectionStatus('error')
        addToast(t.settings.connectionFail, 'error')
      }
    } catch (err) {
      setConnectionStatus('error')
      addToast(
        `${t.settings.connectionFail}: ${err instanceof Error ? err.message : ''}`,
        'error'
      )
    }
    setIsTestingConnection(false)
  }

  async function handleBrowseBasePath(): Promise<void> {
    try {
      const selected = await window.cortx.app.openDirectoryDialog()
      if (selected) {
        setBasePath(selected)
      }
    } catch {
      addToast(t.settings.folderError, 'error')
    }
  }

  function handleSelectPreset(preset: ProviderPreset): void {
    setProvider(preset.id)
    setModel(preset.defaultModel)
    if (preset.defaultBaseUrl) {
      setBaseUrl(preset.defaultBaseUrl)
    }
    setConnectionStatus('idle')
  }

  function handleSelectLocalExample(example: { url: string; model: string }): void {
    setBaseUrl(example.url)
    setModel(example.model)
    setConnectionStatus('idle')
  }

  function handleSelectLanguage(lang: AppLanguage): void {
    setLanguage(lang)
  }

  function isLocalProvider(): boolean {
    if (provider !== 'openai-compatible') return false
    const url = baseUrl || 'http://localhost:11434/v1'
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url)
  }

  async function handleReset(): Promise<void> {
    if (!resetConfirm) {
      setResetConfirm(true)
      return
    }
    setIsResetting(true)
    try {
      await window.cortx.app.resetBase()
      clearActions()
      clearGraph()
      await Promise.all([loadFiles(), loadGraph()])
      addToast(t.settings.resetDone, 'success')
      setResetConfirm(false)
      toggleSettings()
    } catch (err) {
      addToast(`Erreur: ${err instanceof Error ? err.message : ''}`, 'error')
    }
    setIsResetting(false)
  }

  if (!settingsOpen) return <></>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={toggleSettings} />

      {/* Dialog */}
      <div className="relative bg-cortx-surface/90 backdrop-blur-xl border border-cortx-border/50 rounded-panel w-full max-w-lg mx-4 shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cortx-border/50 sticky top-0 bg-cortx-surface/90 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-cortx-accent" />
            <h2 className="text-base font-semibold text-cortx-text-primary">{t.settings.title}</h2>
          </div>
          <button
            onClick={toggleSettings}
            className="p-1.5 rounded-md hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Language */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Globe size={12} />
              {t.settings.language}
            </label>
            <div className="flex gap-2">
              {([['fr', t.settings.langFr], ['en', t.settings.langEn]] as [AppLanguage, string][]).map(([lang, label]) => (
                <button
                  key={lang}
                  onClick={() => handleSelectLanguage(lang)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-card border text-sm transition-all cursor-pointer ${
                    language === lang
                      ? 'border-cortx-accent bg-cortx-accent/10 text-cortx-accent'
                      : 'border-cortx-border text-cortx-text-secondary hover:border-cortx-elevated hover:text-cortx-text-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-cortx-border" />

          {/* Theme toggle */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
              {t.settings.appearance}
            </label>
            <div className="flex gap-2">
              {([['dark', t.settings.dark, Moon], ['light', t.settings.light, Sun]] as const).map(([val, label, Icon]) => (
                <button
                  key={val}
                  onClick={() => setTheme(val)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-card border text-sm transition-all cursor-pointer ${
                    theme === val
                      ? 'border-cortx-accent bg-cortx-accent/10 text-cortx-accent'
                      : 'border-cortx-border text-cortx-text-secondary hover:border-cortx-elevated hover:text-cortx-text-primary'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-cortx-border" />

          {/* Base Path */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
              {t.settings.knowledgeBasePath}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={basePath}
                onChange={(e) => setBasePath(e.target.value)}
                placeholder={t.settings.pathPlaceholder}
                className="flex-1 bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
              />
              <button
                onClick={handleBrowseBasePath}
                className="flex items-center gap-1.5 px-3 py-2 rounded-card text-sm bg-cortx-elevated text-cortx-text-primary hover:bg-cortx-border transition-colors cursor-pointer"
                title={t.settings.browse}
              >
                <FolderOpen size={14} />
                {t.settings.browse}
              </button>
            </div>
            <p className="text-2xs text-cortx-text-secondary/50">
              {t.settings.pathDescription}
            </p>
          </div>

          {/* Separator */}
          <div className="border-t border-cortx-border" />

          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
              {t.settings.llmProvider}
            </label>
            <div className="space-y-2">
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`w-full flex items-start gap-3 p-3 rounded-card border text-left cursor-pointer transition-all ${
                    provider === preset.id
                      ? 'border-cortx-accent bg-cortx-accent/5'
                      : 'border-cortx-border hover:border-cortx-elevated hover:bg-cortx-bg/50'
                  }`}
                >
                  <div className={`mt-0.5 ${provider === preset.id ? 'text-cortx-accent' : 'text-cortx-text-secondary'}`}>
                    {preset.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-cortx-text-primary">{preset.label}</span>
                      {provider === preset.id && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-cortx-accent/10 text-cortx-accent">{t.settings.active}</span>
                      )}
                    </div>
                    <p className="text-xs text-cortx-text-secondary mt-0.5">{preset.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Privacy badge */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-card border text-xs ${
            isLocalProvider()
              ? 'border-cortx-success/30 bg-cortx-success/5 text-cortx-success'
              : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
          }`}>
            {isLocalProvider() ? <Lock size={12} /> : <Wifi size={12} />}
            <span className="font-medium">{isLocalProvider() ? t.settings.privacyLocal : t.settings.privacyRemote}</span>
            <span className="text-cortx-text-secondary">—</span>
            <span className="text-cortx-text-secondary">
              {isLocalProvider() ? t.settings.privacyLocalDesc : t.settings.privacyRemoteDesc}
            </span>
          </div>

          {/* API Key (Anthropic) */}
          {provider === 'anthropic' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
                {t.settings.anthropicApiKey}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setConnectionStatus('idle') }}
                placeholder="sk-ant-..."
                className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
              />
            </div>
          )}

          {/* API Key (Google AI) */}
          {provider === 'google-ai' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
                {t.settings.googleAiApiKey}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setConnectionStatus('idle') }}
                placeholder="AIza..."
                className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
              />
            </div>
          )}

          {/* Base URL (Local/OpenAI-compatible) */}
          {provider === 'openai-compatible' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
                  {t.settings.serverUrl}
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => { setBaseUrl(e.target.value); setConnectionStatus('idle') }}
                  placeholder="http://localhost:8080/v1"
                  className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
                />
              </div>

              {/* Quick presets */}
              <div className="space-y-1.5">
                <span className="text-2xs text-cortx-text-secondary">{t.settings.quickPresets}</span>
                <div className="flex flex-wrap gap-1.5">
                  {LOCAL_MODEL_EXAMPLES.map((example) => (
                    <button
                      key={example.name}
                      onClick={() => handleSelectLocalExample(example)}
                      className={`text-2xs px-2 py-1 rounded border cursor-pointer transition-colors ${
                        baseUrl === example.url
                          ? 'border-cortx-accent bg-cortx-accent/10 text-cortx-accent'
                          : 'border-cortx-border text-cortx-text-secondary hover:border-cortx-elevated hover:text-cortx-text-primary'
                      }`}
                    >
                      {example.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional API Key for remote OpenAI-compat */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
                  {t.settings.apiKeyOptional} <span className="text-cortx-text-secondary/50 normal-case">(optional, for remote servers)</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setConnectionStatus('idle') }}
                  placeholder={t.settings.apiKeyLocalPlaceholder}
                  className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
                />
              </div>
            </div>
          )}

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
              {t.settings.model}
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => { setModel(e.target.value); setConnectionStatus('idle') }}
              placeholder={
                provider === 'anthropic' ? 'claude-sonnet-4-20250514'
                : provider === 'google-ai' ? 'gemini-2.0-flash-lite'
                : 'mistral'
              }
              className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
            />
            {provider === 'anthropic' && (
              <p className="text-2xs text-cortx-text-secondary/50">
                {t.settings.anthropicModelsHint}
              </p>
            )}
            {provider === 'google-ai' && (
              <p className="text-2xs text-cortx-text-secondary/50">
                {t.settings.googleAiModelsHint}
              </p>
            )}
            {provider === 'openai-compatible' && (
              <p className="text-2xs text-cortx-text-secondary/50">
                {t.settings.localModelHint}
              </p>
            )}
          </div>

          {/* Danger zone */}
          <div className="space-y-3 pt-1">
            <div className="border-t border-cortx-border" />
            <label className="text-xs font-medium text-cortx-error uppercase tracking-wider">
              {t.settings.dangerZone}
            </label>
            <div className="rounded-card border border-cortx-error/30 bg-cortx-error/5 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-cortx-text-primary">{t.settings.resetTitle}</p>
                <p className="text-xs text-cortx-text-secondary mt-0.5">
                  {t.settings.resetDesc}
                </p>
              </div>
              {resetConfirm ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-cortx-error">
                    {t.settings.resetAreYouSure}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleReset}
                      disabled={isResetting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-card text-xs font-medium bg-cortx-error text-white hover:bg-cortx-error/80 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {isResetting ? (
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      {isResetting ? t.settings.resetting : t.settings.confirmDelete}
                    </button>
                    <button
                      onClick={() => setResetConfirm(false)}
                      disabled={isResetting}
                      className="px-3 py-1.5 rounded-card text-xs text-cortx-text-secondary hover:text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer"
                    >
                      {t.settings.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-card text-xs font-medium border border-cortx-error/50 text-cortx-error hover:bg-cortx-error/10 transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                  {t.settings.resetTitle}
                </button>
              )}
            </div>
          </div>

          {/* Telegram Bot */}
          <div className="border-t border-cortx-border" />
          <div className="space-y-3">
            <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Send size={12} />
              {t.telegram.title}
            </label>

            <div className="space-y-1.5">
              <label className="text-xs text-cortx-text-secondary">{t.telegram.token}</label>
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder={t.telegram.tokenPlaceholder}
                className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-cortx-text-secondary">{t.telegram.chatIds}</label>
              <textarea
                value={telegramChatIds}
                onChange={(e) => setTelegramChatIds(e.target.value)}
                placeholder="123456789"
                rows={2}
                className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono resize-none"
              />
              <p className="text-2xs text-cortx-text-secondary/50">{t.telegram.chatIdsHint}</p>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setTelegramEnabled(!telegramEnabled)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-card border text-sm transition-all cursor-pointer ${
                  telegramEnabled
                    ? 'border-cortx-accent bg-cortx-accent/10 text-cortx-accent'
                    : 'border-cortx-border text-cortx-text-secondary hover:border-cortx-elevated hover:text-cortx-text-primary'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${telegramEnabled ? 'bg-cortx-accent' : 'bg-cortx-text-secondary/40'}`} />
                {t.telegram.enable}
              </button>

              <span className={`flex items-center gap-1.5 text-xs ${telegramRunning ? 'text-cortx-success' : 'text-cortx-text-secondary/50'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${telegramRunning ? 'bg-cortx-success' : 'bg-cortx-text-secondary/30'}`} />
                {telegramRunning ? t.telegram.statusRunning : t.telegram.statusStopped}
              </span>
            </div>

            <p className="text-2xs text-cortx-text-secondary/50 flex items-center gap-1">
              <Wifi size={10} />
              {t.telegram.privacyNote}
            </p>
          </div>

          {/* Connection test */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={isTestingConnection || (!apiKey && (provider === 'anthropic' || provider === 'google-ai'))}
              className="flex items-center gap-2 px-4 py-2 rounded-card text-sm font-medium bg-cortx-elevated text-cortx-text-primary hover:bg-cortx-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isTestingConnection ? (
                <>
                  <span className="w-3 h-3 border-2 border-cortx-text-secondary/30 border-t-cortx-accent rounded-full animate-spin" />
                  {t.settings.testing}
                </>
              ) : (
                t.settings.testConnection
              )}
            </button>

            {connectionStatus === 'success' && (
              <div className="flex items-center gap-1.5 text-cortx-success text-xs">
                <Check size={14} />
                {t.settings.connectionOk}
              </div>
            )}
            {connectionStatus === 'error' && (
              <div className="flex items-center gap-1.5 text-cortx-error text-xs">
                <AlertCircle size={14} />
                {t.settings.connectionFail}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cortx-border/50 sticky bottom-0 bg-cortx-surface/90 backdrop-blur-sm">
          <button
            onClick={toggleSettings}
            className="px-4 py-2 rounded-card text-sm text-cortx-text-secondary hover:text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer"
          >
            {t.settings.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-card text-sm font-medium bg-cortx-accent text-white hover:bg-cortx-accent-light disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isSaving ? t.settings.saving : t.settings.save}
          </button>
        </div>
      </div>
    </div>
  )
}
