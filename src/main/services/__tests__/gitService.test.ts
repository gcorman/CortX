import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { GitService } from '../GitService'

// Ensure git commits work in CI without a global identity
beforeAll(() => {
  process.env['GIT_AUTHOR_NAME'] = 'Test'
  process.env['GIT_AUTHOR_EMAIL'] = 'test@test.com'
  process.env['GIT_COMMITTER_NAME'] = 'Test'
  process.env['GIT_COMMITTER_EMAIL'] = 'test@test.com'
})

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cortx-git-test-'))
}

function rmDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
}

describe('GitService.initialize', () => {
  let tmpDir: string
  let git: GitService

  beforeEach(() => { tmpDir = createTmpDir(); git = new GitService(tmpDir) })
  afterEach(() => rmDir(tmpDir))

  it('creates a .git directory', async () => {
    await git.initialize()
    expect(fs.existsSync(path.join(tmpDir, '.git'))).toBe(true)
  })

  it('creates a .gitignore with cortx.db listed', async () => {
    await git.initialize()
    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('_System/cortx.db')
    expect(gitignore).toContain('Bibliotheque/')
  })

  it('is idempotent — calling twice does not throw', async () => {
    await git.initialize()
    await expect(git.initialize()).resolves.not.toThrow()
  })
})

describe('GitService.commitAll', () => {
  let tmpDir: string
  let git: GitService

  beforeEach(async () => {
    tmpDir = createTmpDir()
    git = new GitService(tmpDir)
    await git.initialize()
  })
  afterEach(() => rmDir(tmpDir))

  it('returns a 40-char hex hash after committing a file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'note.md'), '# Hello\n', 'utf-8')
    const hash = await git.commitAll('test: add note')
    expect(hash).toMatch(/^[0-9a-f]{40}$/)
  })

  it('returns the existing HEAD hash when there is nothing to commit', async () => {
    fs.writeFileSync(path.join(tmpDir, 'note.md'), '# Hello\n', 'utf-8')
    const h1 = await git.commitAll('first')
    const h2 = await git.commitAll('nothing new')
    expect(h1).toBe(h2)
  })

  it('creates distinct hashes for distinct commits', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), 'A\n', 'utf-8')
    const h1 = await git.commitAll('commit A')
    fs.writeFileSync(path.join(tmpDir, 'b.md'), 'B\n', 'utf-8')
    const h2 = await git.commitAll('commit B')
    expect(h1).not.toBe(h2)
  })
})

describe('GitService.log', () => {
  let tmpDir: string
  let git: GitService

  beforeEach(async () => {
    tmpDir = createTmpDir()
    git = new GitService(tmpDir)
    await git.initialize()
  })
  afterEach(() => rmDir(tmpDir))

  it('returns an empty array on a fresh repo with no extra commits', async () => {
    // initialize() creates one initial commit; log should return it
    const entries = await git.log(5)
    expect(entries.length).toBeGreaterThanOrEqual(1)
    expect(entries[0]).toHaveProperty('hash')
    expect(entries[0]).toHaveProperty('message')
    expect(entries[0]).toHaveProperty('date')
  })

  it('reflects commits made via commitAll', async () => {
    fs.writeFileSync(path.join(tmpDir, 'x.md'), 'x\n', 'utf-8')
    const hash = await git.commitAll('add x')
    const entries = await git.log(5)
    expect(entries[0].hash).toBe(hash)
    expect(entries[0].message).toBe('add x')
  })
})

describe('GitService.status', () => {
  let tmpDir: string
  let git: GitService

  beforeEach(async () => {
    tmpDir = createTmpDir()
    git = new GitService(tmpDir)
    await git.initialize()
  })
  afterEach(() => rmDir(tmpDir))

  it('returns empty array when working tree is clean', async () => {
    // Commit any leftover files first
    await git.commitAll('clean up')
    const status = await git.status()
    expect(status).toHaveLength(0)
  })

  it('detects untracked files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'new.md'), 'new\n', 'utf-8')
    const status = await git.status()
    expect(status.some((s) => s.includes('new.md'))).toBe(true)
  })
})

describe('GitService.revert', () => {
  let tmpDir: string
  let git: GitService

  beforeEach(async () => {
    tmpDir = createTmpDir()
    git = new GitService(tmpDir)
    await git.initialize()
  })
  afterEach(() => rmDir(tmpDir))

  it('reverts a commit (file content goes back)', async () => {
    const filePath = path.join(tmpDir, 'doc.md')
    fs.writeFileSync(filePath, 'original\n', 'utf-8')
    await git.commitAll('v1')

    fs.writeFileSync(filePath, 'modified\n', 'utf-8')
    const h2 = await git.commitAll('v2')

    await git.revert(h2)

    const content = fs.readFileSync(filePath, 'utf-8')
    expect(content.trim()).toBe('original')
  })
})
