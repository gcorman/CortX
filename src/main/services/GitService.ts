import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execFileAsync = promisify(execFile)

export class GitService {
  constructor(private basePath: string) {}

  async initialize(): Promise<void> {
    await this.ensureRepository()
  }

  async commitAll(message: string): Promise<string> {
    await this.ensureRepository()
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
    await this.ensureRepository()
    await this.exec('revert', '--no-edit', hash)
  }

  async log(count = 20): Promise<Array<{ hash: string; message: string; date: string }>> {
    try {
      await this.ensureRepository()
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
      await this.ensureRepository()
      const { stdout } = await this.exec('status', '--porcelain')
      return stdout.trim().split('\n').filter((l) => l.trim())
    } catch {
      return []
    }
  }

  private async exec(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('git', args, {
      cwd: this.basePath,
      env: this.getGitEnv(true)
    })
  }

  private async execRaw(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('git', args, {
      cwd: this.basePath,
      env: this.getGitEnv(false)
    })
  }

  private getGitDir(): string {
    return path.join(this.basePath, '.git')
  }

  private async ensureRepository(): Promise<void> {
    if (await this.isRepositoryHealthy()) {
      this.ensureGitignore()
      return
    }

    const gitDir = this.getGitDir()
    if (fs.existsSync(gitDir)) {
      const backupDir = this.getBrokenGitBackupDir()
      fs.renameSync(gitDir, backupDir)
      console.warn(`[GitService] Invalid repository moved to ${backupDir}`)
    }

    await this.execRaw('init')
    this.ensureGitignore()

    if (!(await this.hasHeadCommit())) {
      await this.exec('add', '-A')
      await this.exec(
        'commit',
        '-m',
        'CortX: initialisation de la base de connaissances',
        '--allow-empty'
      )
    }
  }

  private async isRepositoryHealthy(): Promise<boolean> {
    const gitDir = this.getGitDir()
    if (!this.hasGitStructure(gitDir)) {
      return false
    }

    try {
      const { stdout } = await this.execRaw('rev-parse', '--is-inside-work-tree')
      return stdout.trim() === 'true'
    } catch {
      return false
    }
  }

  private async hasHeadCommit(): Promise<boolean> {
    try {
      await this.exec('rev-parse', '--verify', 'HEAD')
      return true
    } catch {
      return false
    }
  }

  private hasGitStructure(gitDir: string): boolean {
    return (
      fs.existsSync(path.join(gitDir, 'HEAD')) &&
      fs.existsSync(path.join(gitDir, 'config')) &&
      fs.existsSync(path.join(gitDir, 'objects')) &&
      fs.existsSync(path.join(gitDir, 'refs'))
    )
  }

  private ensureGitignore(): void {
    const gitignore = path.join(this.basePath, '.gitignore')
    if (fs.existsSync(gitignore)) {
      return
    }

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

  private getBrokenGitBackupDir(): string {
    let attempt = 0
    let candidate = path.join(this.basePath, `.git-invalid-${Date.now()}`)

    while (fs.existsSync(candidate)) {
      attempt += 1
      candidate = path.join(this.basePath, `.git-invalid-${Date.now()}-${attempt}`)
    }

    return candidate
  }

  private getGitEnv(forceGitDir: boolean): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env }
    const gitDir = this.getGitDir()

    if (forceGitDir && this.hasGitStructure(gitDir)) {
      env.GIT_DIR = gitDir
      env.GIT_WORK_TREE = this.basePath
    }

    const ceiling = path.dirname(this.basePath)
    if (ceiling && ceiling !== this.basePath) {
      env.GIT_CEILING_DIRECTORIES = ceiling
    }

    return env
  }
}
