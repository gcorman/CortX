import { useState, useEffect } from 'react'
import { X, Server, Cloud, Cpu, Check, AlertCircle, FolderOpen, Sun, Moon } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import type { LLMConfig } from '../../../shared/types'

type Provider = 'anthropic' | 'openai-compatible'

interface ProviderPreset {
  id: Provider
  label: string
  description: string
  icon: React.ReactNode
  defaultModel: string
  defaultBaseUrl?: string
  needsApiKey: boolean
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    description: 'API Anthropic — modeles Claude Sonnet, Opus, Haiku',
    icon: <Cloud size={18} />,
    defaultModel: 'claude-sonnet-4-20250514',
    needsApiKey: true
  },
  {
    id: 'openai-compatible',
    label: 'Local / OpenAI-compatible',
    description: 'llama.cpp, Ollama, LM Studio, ou toute API compatible OpenAI',
    icon: <Cpu size={18} />,
    defaultModel: 'mistral',
    defaultBaseUrl: 'http://localhost:8080/v1',
    needsApiKey: false
  }
]

const LOCAL_MODEL_EXAMPLES = [
  { name: 'llama.cpp (llama-server)', url: 'http://localhost:8080/v1', model: 'default' },
  { name: 'Ollama', url: 'http://localhost:11434/v1', model: 'mistral' },
  { name: 'LM Studio', url: 'http://localhost:1234/v1', model: 'local-model' }
]

export function SettingsDialog(): React.JSX.Element {
  const { settingsOpen, toggleSettings, addToast, theme, setTheme } = useUIStore()
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [basePath, setBasePath] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Load current config on open
  useEffect(() => {
    if (settingsOpen) {
      loadConfig()
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
    } catch {
      // ignore
    }
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true)
    try {
      const llmConfig: LLMConfig = {
        provider,
        apiKey,
        model,
        ...(provider === 'openai-compatible' ? { baseUrl } : {})
      }
      await window.cortx.app.setConfig({ llm: llmConfig })

      // Update base path if changed
      const currentBasePath = await window.cortx.app.getBasePath()
      if (basePath && basePath !== currentBasePath) {
        await window.cortx.app.setBasePath(basePath)
      }

      addToast('Configuration sauvegardee', 'success')
      toggleSettings()
    } catch (err) {
      addToast('Erreur lors de la sauvegarde', 'error')
    }
    setIsSaving(false)
  }

  async function handleTestConnection(): Promise<void> {
    setIsTestingConnection(true)
    setConnectionStatus('idle')
    try {
      // Save config first so the backend uses the new settings
      const llmConfig: LLMConfig = {
        provider,
        apiKey,
        model,
        ...(provider === 'openai-compatible' ? { baseUrl } : {})
      }
      await window.cortx.app.setConfig({ llm: llmConfig })

      // Send a simple test message
      const response = await window.cortx.llm.send(
        [{ role: 'user', content: 'Reponds juste "ok".' }]
      )
      if (response) {
        setConnectionStatus('success')
        addToast('Connexion reussie !', 'success')
      } else {
        setConnectionStatus('error')
        addToast('Pas de reponse du modele', 'error')
      }
    } catch (err) {
      setConnectionStatus('error')
      addToast(
        `Echec de connexion: ${err instanceof Error ? err.message : 'Erreur inconnue'}`,
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
      addToast('Erreur lors de la selection du dossier', 'error')
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

  if (!settingsOpen) return <></>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={toggleSettings} />

      {/* Dialog */}
      <div className="relative bg-cortx-surface border border-cortx-border rounded-panel w-full max-w-lg mx-4 shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cortx-border sticky top-0 bg-cortx-surface z-10">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-cortx-accent" />
            <h2 className="text-base font-semibold text-cortx-text-primary">Configuration</h2>
          </div>
          <button
            onClick={toggleSettings}
            className="p-1.5 rounded-md hover:bg-cortx-elevated text-cortx-text-secondary hover:text-cortx-text-primary transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Theme toggle */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
              Apparence
            </label>
            <div className="flex gap-2">
              {([['dark', 'Sombre', Moon], ['light', 'Clair', Sun]] as const).map(([val, label, Icon]) => (
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
              Emplacement de la base de connaissances
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={basePath}
                onChange={(e) => setBasePath(e.target.value)}
                placeholder="C:\Users\...\CortX-Base"
                className="flex-1 bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
              />
              <button
                onClick={handleBrowseBasePath}
                className="flex items-center gap-1.5 px-3 py-2 rounded-card text-sm bg-cortx-elevated text-cortx-text-primary hover:bg-cortx-border transition-colors cursor-pointer"
                title="Parcourir..."
              >
                <FolderOpen size={14} />
                Parcourir
              </button>
            </div>
            <p className="text-2xs text-cortx-text-secondary/50">
              Dossier ou seront stockes les fichiers Markdown, la base SQLite et le depot Git
            </p>
          </div>

          {/* Separator */}
          <div className="border-t border-cortx-border" />

          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
              Fournisseur LLM
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
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-cortx-accent/10 text-cortx-accent">actif</span>
                      )}
                    </div>
                    <p className="text-xs text-cortx-text-secondary mt-0.5">{preset.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* API Key (Anthropic) */}
          {provider === 'anthropic' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
                Cle API Anthropic
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

          {/* Base URL (Local/OpenAI-compatible) */}
          {provider === 'openai-compatible' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
                  URL du serveur
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
                <span className="text-2xs text-cortx-text-secondary">Presets rapides :</span>
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
                  Cle API <span className="text-cortx-text-secondary/50 normal-case">(optionnel, pour serveurs distants)</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setConnectionStatus('idle') }}
                  placeholder="Laisser vide pour les serveurs locaux"
                  className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
                />
              </div>
            </div>
          )}

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-cortx-text-secondary uppercase tracking-wider">
              Modele
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => { setModel(e.target.value); setConnectionStatus('idle') }}
              placeholder={provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'mistral'}
              className="w-full bg-cortx-bg border border-cortx-border rounded-input px-3 py-2 text-sm text-cortx-text-primary placeholder:text-cortx-text-secondary/40 focus:outline-none focus:border-cortx-accent transition-colors font-mono"
            />
            {provider === 'anthropic' && (
              <p className="text-2xs text-cortx-text-secondary/50">
                claude-sonnet-4-20250514, claude-opus-4-20250514, claude-haiku-4-5-20251001
              </p>
            )}
            {provider === 'openai-compatible' && (
              <p className="text-2xs text-cortx-text-secondary/50">
                Nom du modele charge sur le serveur (ex: mistral, llama3, gemma3, qwen3)
              </p>
            )}
          </div>

          {/* Connection test */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={isTestingConnection || (!apiKey && provider === 'anthropic')}
              className="flex items-center gap-2 px-4 py-2 rounded-card text-sm font-medium bg-cortx-elevated text-cortx-text-primary hover:bg-cortx-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isTestingConnection ? (
                <>
                  <span className="w-3 h-3 border-2 border-cortx-text-secondary/30 border-t-cortx-accent rounded-full animate-spin" />
                  Test en cours...
                </>
              ) : (
                'Tester la connexion'
              )}
            </button>

            {connectionStatus === 'success' && (
              <div className="flex items-center gap-1.5 text-cortx-success text-xs">
                <Check size={14} />
                Connexion OK
              </div>
            )}
            {connectionStatus === 'error' && (
              <div className="flex items-center gap-1.5 text-cortx-error text-xs">
                <AlertCircle size={14} />
                Echec
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-cortx-border sticky bottom-0 bg-cortx-surface">
          <button
            onClick={toggleSettings}
            className="px-4 py-2 rounded-card text-sm text-cortx-text-secondary hover:text-cortx-text-primary hover:bg-cortx-elevated transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-card text-sm font-medium bg-cortx-accent text-white hover:bg-cortx-accent-light disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}
