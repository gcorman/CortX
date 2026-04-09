/**
 * PythonSidecar
 * =============
 * Manages the lifecycle of the cortx-extractor Python child process.
 *
 * Communication protocol: newline-delimited JSON on stdin/stdout.
 * Each request has a unique `id`; responses are matched back by `id`.
 *
 * The process is started lazily on the first request and kept alive for the
 * entire Electron session. Call `shutdown()` in app.on('before-quit').
 */

import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface SidecarRequest {
  cmd: string
  [key: string]: unknown
}

export interface SidecarResponse {
  ok: boolean
  error?: string
  traceback?: string
  [key: string]: unknown
}

interface PendingRequest {
  resolve: (value: SidecarResponse) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

/** Maximum time (ms) to wait for any single sidecar response. */
const DEFAULT_TIMEOUT_MS = 600_000 // 10 min — first PDF triggers docling model load (can be slow)

/** Timeout for the health check only. */
const HEALTH_TIMEOUT_MS = 10_000

// -------------------------------------------------------------------------
// PythonSidecar
// -------------------------------------------------------------------------

export class PythonSidecar extends EventEmitter {
  private proc: ChildProcess | null = null
  private pending = new Map<string, PendingRequest>()
  private lineBuffer = ''
  private _ready = false
  private _starting = false

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Returns true if the sidecar executable exists in resources/.
   * When false, library features should be disabled gracefully.
   */
  isAvailable(): boolean {
    return fs.existsSync(this.executablePath())
  }

  /**
   * Ensures the sidecar is running and responds to a health check.
   * Idempotent — safe to call multiple times.
   */
  async ensureReady(): Promise<boolean> {
    if (this._ready) return true
    if (!this.isAvailable()) return false

    await this._start()

    try {
      await this.send({ cmd: 'health' }, HEALTH_TIMEOUT_MS)
      this._ready = true
      return true
    } catch {
      return false
    }
  }

  /**
   * Send a command to the sidecar and await the response.
   * Starts the sidecar if not already running.
   */
  async send(req: SidecarRequest, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<SidecarResponse> {
    if (!this.proc || this.proc.exitCode !== null) {
      await this._start()
    }

    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const line = JSON.stringify({ id, ...req })

      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Sidecar request "${req.cmd}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer })

      this.proc!.stdin!.write(line + '\n', (err) => {
        if (err) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  /**
   * Gracefully shuts down the sidecar process.
   * Should be called from app.on('before-quit').
   */
  async shutdown(): Promise<void> {
    if (!this.proc) return
    try {
      await this.send({ cmd: 'shutdown' }, 3000)
    } catch {
      // ignore timeout on shutdown
    }
    this.proc.kill()
    this.proc = null
    this._ready = false
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private executablePath(): string {
    const resourcesPath = app.isPackaged
      ? process.resourcesPath
      : path.join(app.getAppPath(), 'resources')
    return path.join(resourcesPath, 'python-sidecar', 'cortx-extractor.exe')
  }

  private async _start(): Promise<void> {
    if (this._starting || (this.proc && this.proc.exitCode === null)) return
    this._starting = true

    const execPath = this.executablePath()

    console.log(`[PythonSidecar] Starting: ${execPath}`)

    this.proc = spawn(execPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    this.proc.stdout!.setEncoding('utf8')
    this.proc.stdout!.on('data', (chunk: string) => this._onData(chunk))

    this.proc.stderr!.setEncoding('utf8')
    this.proc.stderr!.on('data', (chunk: string) => {
      console.log(`[cortx-extractor] ${chunk.trim()}`)
    })

    this.proc.on('exit', (code, signal) => {
      console.warn(`[PythonSidecar] Process exited (code=${code}, signal=${signal})`)
      this._ready = false
      this._starting = false
      // Reject all pending requests
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error(`Sidecar process exited unexpectedly (code=${code})`))
        this.pending.delete(id)
      }
      this.emit('exit', code, signal)
    })

    this.proc.on('error', (err) => {
      console.error(`[PythonSidecar] Spawn error:`, err)
      this._starting = false
      this.emit('error', err)
    })

    this._starting = false
  }

  private _onData(chunk: string): void {
    this.lineBuffer += chunk
    const lines = this.lineBuffer.split('\n')
    this.lineBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const resp = JSON.parse(trimmed) as SidecarResponse & { id: string }
        const pending = this.pending.get(resp.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(resp.id)
          if (resp.ok) {
            pending.resolve(resp)
          } else {
            // Log the full error + traceback on the main process console so
            // failures are visible even if the renderer only shows a short message.
            console.error(`[PythonSidecar] Error response:`, resp.error)
            if (resp.traceback) {
              console.error(`[PythonSidecar] Traceback:\n${resp.traceback}`)
            }
            pending.reject(new Error(resp.error ?? 'Sidecar returned ok=false'))
          }
        } else {
          console.warn(`[PythonSidecar] Received response for unknown id: ${resp.id}`)
        }
      } catch (e) {
        console.error(`[PythonSidecar] Failed to parse response: ${trimmed}`, e)
      }
    }
  }
}

// Singleton — imported by LibraryService and main process
export const pythonSidecar = new PythonSidecar()
