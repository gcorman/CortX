import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execFileAsync = promisify(execFile)

export class GitService {
  constructor(private basePath: string) {}

  async initialize(): Promise<void> {
    const gitDir = path.join(this.basePath, '.git')
    if (!fs.existsSync(gitDir)) {
      await this.exec('init')
      // Create .gitignore
      const gitignore = path.join(this.basePath, '.gitignore')
      if (!fs.existsSync(gitignore)) {
        fs.writeFileSync(
          gitignore,
          [
            '_System/cortx.db',
            '_System/cortx.db-wal',
            '_System/cortx.db-shm',
            '_System/library-cache/',
            'Bibliotheque/',
          ].join('\n') + '\n',
          'utf-8'
        )
      }
      // Initial commit
      await this.exec('add', '-A')
      await this.exec('commit', '-m', 'CortX: initialisation de la base de connaissances', '--allow-empty')
    }
  }

  async commitAll(message: string): Promise<string> {
    await this.exec('add', '-A')

    // Check if there are changes to commit
    try {
      const { stdout } = await this.exec('status', '--porcelain')
      if (!stdout.trim()) {
        // Nothing to commit, return last commit hash
        const log = await this.log(1)
        return log[0]?.hash || ''
      }
    } catch {
      // continue
    }

    await this.exec('commit', '-m', message)

    // Get commit hash
    const { stdout } = await this.exec('rev-parse', 'HEAD')
    return stdout.trim()
  }

  async revert(hash: string): Promise<void> {
    await this.exec('revert', '--no-edit', hash)
  }

  async log(count = 20): Promise<Array<{ hash: string; message: string; date: string }>> {
    try {
      const { stdout } = await this.exec(
        'log',
        `--max-count=${count}`,
        '--format=%H|%s|%ai'
      )

      return stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const [hash, message, date] = line.split('|')
          return { hash, message, date }
        })
    } catch {
      return []
    }
  }

  async status(): Promise<string[]> {
    try {
      const { stdout } = await this.exec('status', '--porcelain')
      return stdout.trim().split('\n').filter((l) => l.trim())
    } catch {
      return []
    }
  }

  private async exec(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('git', args, { cwd: this.basePath })
  }
}
