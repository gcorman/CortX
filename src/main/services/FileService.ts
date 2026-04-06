import * as fs from 'fs'
import * as path from 'path'
import matter from 'gray-matter'
import type { FileContent } from '../../shared/types'

const BASE_DIRS = [
  'Reseau',
  'Entreprises',
  'Domaines',
  'Projets',
  'Journal',
  '_Templates',
  '_System'
]

export class FileService {
  constructor(private basePath: string) {}

  async ensureBaseStructure(): Promise<void> {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true })
    }
    for (const dir of BASE_DIRS) {
      const dirPath = path.join(this.basePath, dir)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
    }
  }

  async readFile(filePath: string): Promise<FileContent | null> {
    const fullPath = this.resolvePath(filePath)
    if (!fs.existsSync(fullPath)) return null

    const raw = fs.readFileSync(fullPath, 'utf-8')
    const parsed = matter(raw)

    return {
      path: filePath,
      frontmatter: parsed.data as Record<string, unknown>,
      body: parsed.content,
      raw
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath)
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(fullPath, content, 'utf-8')
  }

  async fileExists(filePath: string): Promise<boolean> {
    return fs.existsSync(this.resolvePath(filePath))
  }

  async listMarkdownFiles(dir?: string): Promise<string[]> {
    const searchDir = dir ? path.join(this.basePath, dir) : this.basePath
    const files: string[] = []
    this.walkDir(searchDir, files)
    return files
  }

  async listDirectory(dir?: string): Promise<string[]> {
    const searchDir = dir ? path.join(this.basePath, dir) : this.basePath
    if (!fs.existsSync(searchDir)) return []
    return fs.readdirSync(searchDir)
  }

  extractWikilinks(content: string): string[] {
    const regex = /\[\[([^\]]+)\]\]/g
    const links: string[] = []
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      links.push(match[1])
    }
    return links
  }

  getTree(): string {
    const lines: string[] = []
    this.buildTree(this.basePath, '', lines, 0)
    return lines.join('\n')
  }

  private buildTree(dir: string, prefix: string, lines: string[], depth: number): void {
    if (depth > 3) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        lines.push(`${prefix}${entry.name}/`)
        this.buildTree(entryPath, prefix + '  ', lines, depth + 1)
      } else if (entry.name.endsWith('.md')) {
        lines.push(`${prefix}${entry.name}`)
      }
    }
  }

  private walkDir(dir: string, files: string[]): void {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== '_System') {
          this.walkDir(fullPath, files)
        }
      } else if (entry.name.endsWith('.md')) {
        files.push(path.relative(this.basePath, fullPath).replace(/\\/g, '/'))
      }
    }
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath
    return path.join(this.basePath, filePath)
  }
}
