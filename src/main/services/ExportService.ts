import * as fs from 'fs'
import * as path from 'path'
import { dialog, BrowserWindow } from 'electron'
import type { FileService } from './FileService'

export class ExportService {
  constructor(private fileService: FileService, private basePath: string) {}

  async exportJson(filePaths: string[], outputPath: string): Promise<void> {
    const records = []
    for (const filePath of filePaths) {
      try {
        const content = await this.fileService.readFile(filePath)
        if (!content) continue
        records.push({
          path: filePath,
          frontmatter: content.frontmatter,
          body: content.body
        })
      } catch { /* skip unreadable files */ }
    }
    fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), 'utf-8')
  }

  async exportHtml(filePaths: string[], outputPath: string): Promise<void> {
    const sections: string[] = []
    for (const filePath of filePaths) {
      try {
        const content = await this.fileService.readFile(filePath)
        if (!content) continue
        const title = (content.frontmatter.title as string)
          || content.body.match(/^#\s+(.+)$/m)?.[1]
          || path.basename(filePath, '.md')
        const bodyHtml = this.markdownToHtml(content.body)
        sections.push(`<section id="${filePath.replace(/[^a-z0-9]/gi, '-')}">
  <h1>${escHtml(title)}</h1>
  <div class="meta">
    <code>${escHtml(filePath)}</code>
    ${content.frontmatter.tags ? `<span class="tags">${(content.frontmatter.tags as string[]).map(escHtml).join(', ')}</span>` : ''}
  </div>
  ${bodyHtml}
</section>`)
      } catch { /* skip */ }
    }

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CortX Export</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: Inter, system-ui, sans-serif; background: #0F172A; color: #F8FAFC; line-height: 1.65; padding: 2rem 1rem }
  .container { max-width: 860px; margin: 0 auto }
  h1 { font-size: 1.5rem; color: #0D9488; margin-bottom: .5rem; margin-top: 2rem }
  h2 { font-size: 1.15rem; color: #94A3B8; margin: 1.5rem 0 .5rem; border-bottom: 1px solid #334155; padding-bottom: .25rem }
  h3 { font-size: 1rem; color: #94A3B8; margin: 1rem 0 .25rem }
  p { color: #CBD5E1; margin-bottom: .75rem }
  ul, ol { padding-left: 1.5rem; margin-bottom: .75rem; color: #CBD5E1 }
  li { margin-bottom: .25rem }
  code { background: #1E293B; color: #0D9488; padding: .1em .35em; border-radius: 4px; font-family: 'Fira Code', monospace; font-size: .85em }
  pre { background: #1E293B; border: 1px solid #334155; border-radius: 8px; padding: 1rem; overflow-x: auto; margin-bottom: .75rem }
  pre code { background: none; padding: 0 }
  section { border-bottom: 1px solid #334155; padding-bottom: 2rem; margin-bottom: 2rem }
  .meta { margin-bottom: 1rem; font-size: .8rem; color: #64748B }
  .tags { margin-left: .5rem }
  a { color: #0D9488 }
  blockquote { border-left: 3px solid #0D9488; padding-left: 1rem; color: #94A3B8; margin: .75rem 0 }
  table { width: 100%; border-collapse: collapse; margin-bottom: .75rem }
  th, td { text-align: left; padding: .5rem .75rem; border: 1px solid #334155 }
  th { background: #1E293B; color: #94A3B8 }
  hr { border: none; border-top: 1px solid #334155; margin: 1rem 0 }
  .header { margin-bottom: 3rem; padding-bottom: 1rem; border-bottom: 2px solid #0D9488 }
  .header h1 { font-size: 2rem; margin-top: 0 }
  .header p { color: #64748B; font-size: .85rem }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>CortX Knowledge Base</h1>
    <p>Exporté le ${new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })} — ${filePaths.length} fichier(s)</p>
  </div>
  ${sections.join('\n\n')}
</div>
</body>
</html>`

    fs.writeFileSync(outputPath, html, 'utf-8')
  }

  /** Show a save dialog and export all KB files in the chosen format. */
  async exportInteractive(format: 'html' | 'json'): Promise<{ success: boolean; path?: string; error?: string }> {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: 'No focused window' }

    const ext = format === 'html' ? 'html' : 'json'
    const result = await dialog.showSaveDialog(win, {
      title: format === 'html' ? 'Exporter en HTML' : 'Exporter en JSON',
      defaultPath: `CortX-Export-${new Date().toISOString().split('T')[0]}.${ext}`,
      filters: [
        { name: format.toUpperCase(), extensions: [ext] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) return { success: false }

    try {
      const allFiles = await this.fileService.listMarkdownFiles()
      if (format === 'html') {
        await this.exportHtml(allFiles, result.filePath)
      } else {
        await this.exportJson(allFiles, result.filePath)
      }
      return { success: true, path: result.filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

  // --- Minimal markdown → HTML (no external dep) ---

  private markdownToHtml(md: string): string {
    // Strip frontmatter
    const body = md.replace(/^---[\s\S]*?---\n?/, '').trim()

    let html = ''
    const lines = body.split('\n')
    let inPre = false
    let preLang = ''
    let preContent = ''
    let inList: 'ul' | 'ol' | null = null

    const closeList = (): void => {
      if (inList) { html += `</${inList}>\n`; inList = null }
    }

    for (const raw of lines) {
      if (raw.startsWith('```')) {
        closeList()
        if (!inPre) {
          inPre = true
          preLang = raw.slice(3).trim()
          preContent = ''
        } else {
          html += `<pre><code${preLang ? ` class="language-${escHtml(preLang)}"` : ''}>${escHtml(preContent)}</code></pre>\n`
          inPre = false
          preContent = ''
          preLang = ''
        }
        continue
      }
      if (inPre) { preContent += raw + '\n'; continue }

      const line = raw
      if (!line.trim()) { closeList(); html += '<p></p>\n'; continue }

      const hMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (hMatch) { closeList(); html += `<h${hMatch[1].length}>${inlineHtml(hMatch[2])}</h${hMatch[1].length}>\n`; continue }

      const ulMatch = line.match(/^[-*+]\s+(.+)$/)
      if (ulMatch) {
        if (inList !== 'ul') { closeList(); html += '<ul>\n'; inList = 'ul' }
        html += `<li>${inlineHtml(ulMatch[1])}</li>\n`; continue
      }
      const olMatch = line.match(/^\d+\.\s+(.+)$/)
      if (olMatch) {
        if (inList !== 'ol') { closeList(); html += '<ol>\n'; inList = 'ol' }
        html += `<li>${inlineHtml(olMatch[1])}</li>\n`; continue
      }
      if (line.startsWith('> ')) { closeList(); html += `<blockquote>${inlineHtml(line.slice(2))}</blockquote>\n`; continue }
      if (line.match(/^---+$/)) { closeList(); html += '<hr>\n'; continue }

      closeList()
      html += `<p>${inlineHtml(line)}</p>\n`
    }
    closeList()
    if (inPre && preContent) html += `<pre><code>${escHtml(preContent)}</code></pre>\n`
    return html
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inlineHtml(s: string): string {
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[\[(.+?)\]\]/g, '<span class="wikilink">$1</span>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
}
