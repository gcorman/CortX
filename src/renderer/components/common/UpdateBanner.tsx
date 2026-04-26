import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { useT } from '../../i18n'

export function UpdateBanner(): React.JSX.Element {
  const t = useT()
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null)

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const info = args[0] as { version: string; url: string }
      setUpdate(info)
    }
    window.cortx.on('app:updateAvailable', handler)
    return () => window.cortx.off('app:updateAvailable', handler)
  }, [])

  if (!update) return <></>

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-cortx-accent/10 border-b border-cortx-accent/30 text-xs flex-shrink-0">
      <span className="text-cortx-text-primary">
        {t.updateBanner.newVersion} — <strong>v{update.version}</strong>
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.cortx.app.openExternal(update.url)}
          className="flex items-center gap-1 px-2 py-0.5 bg-cortx-accent text-white rounded hover:opacity-80 transition-opacity cursor-pointer"
        >
          <Download size={11} />
          {t.updateBanner.download}
        </button>
        <button
          onClick={() => setUpdate(null)}
          className="text-cortx-text-secondary hover:text-cortx-text-primary cursor-pointer"
          title={t.updateBanner.dismiss}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
