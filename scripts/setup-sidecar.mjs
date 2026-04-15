#!/usr/bin/env node
/**
 * setup-sidecar.mjs
 * -----------------
 * Downloads the pre-built cortx-extractor binary from the latest GitHub
 * Release and installs it to resources/python-sidecar/.
 *
 * Usage:
 *   npm run setup-sidecar
 *   node scripts/setup-sidecar.mjs
 *
 * Requires: Node.js 18+ (uses built-in fetch), Windows (pre-built binary is
 * Windows-only for now). On other platforms, build from source — see
 * python-sidecar/README.md.
 */

import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs'
import { join, resolve } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { execSync } from 'child_process'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REPO        = 'gcorman/CortX'
const ASSET_NAME  = 'cortx-extractor-win32-x64.zip'
const DEST        = resolve(import.meta.dirname, '..', 'resources', 'python-sidecar')
const SENTINEL    = join(DEST, 'cortx-extractor.exe')
const TMP_ZIP     = join(DEST, '..', '_sidecar-download.zip')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg)  { process.stdout.write(`[setup-sidecar] ${msg}\n`) }
function warn(msg) { process.stderr.write(`[setup-sidecar] WARNING: ${msg}\n`) }
function fail(msg) { process.stderr.write(`[setup-sidecar] ERROR: ${msg}\n`); process.exit(1) }

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'CortX-setup-sidecar/1.0',
      'Accept': 'application/vnd.github+json',
    },
  })
  if (!res.ok) fail(`GitHub API responded ${res.status} for ${url}`)
  return res.json()
}

async function download(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CortX-setup-sidecar/1.0' },
    redirect: 'follow',
  })
  if (!res.ok) fail(`Download failed: ${res.status} ${res.statusText}`)

  const total = parseInt(res.headers.get('content-length') || '0', 10)
  let received = 0
  let lastPct = -1

  const transform = new TransformStream({
    transform(chunk, ctrl) {
      received += chunk.byteLength
      if (total) {
        const pct = Math.floor((received / total) * 100)
        if (pct !== lastPct && pct % 10 === 0) {
          process.stdout.write(`\r[setup-sidecar] Downloading... ${pct}%`)
          lastPct = pct
        }
      }
      ctrl.enqueue(chunk)
    },
  })

  await pipeline(
    Readable.fromWeb(res.body.pipeThrough(transform)),
    createWriteStream(destPath)
  )
  process.stdout.write('\n')
}

function unzip(zipPath, destDir) {
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
      { stdio: 'inherit' }
    )
  } else {
    // unzip is standard on macOS and most Linux distros
    try {
      execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' })
    } catch {
      fail('unzip command failed. Install it (e.g. apt install unzip) and retry.')
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Already installed?
  if (existsSync(SENTINEL)) {
    log(`Sidecar already installed at ${DEST}`)
    log('Delete resources/python-sidecar/ and rerun to force reinstall.')
    return
  }

  // Platform check
  if (process.platform !== 'win32') {
    warn('Pre-built binary targets Windows only.')
    warn('On macOS / Linux: build from source — see python-sidecar/README.md')
    process.exit(1)
  }

  log(`Fetching latest release from github.com/${REPO}...`)
  const release = await fetchJSON(`https://api.github.com/repos/${REPO}/releases/latest`)
  log(`Latest release: ${release.tag_name}`)

  const asset = release.assets?.find((a) => a.name === ASSET_NAME)
  if (!asset) {
    fail(
      `Asset "${ASSET_NAME}" not found in release ${release.tag_name}.\n` +
      `       Available assets: ${release.assets?.map((a) => a.name).join(', ') || 'none'}\n` +
      `       Build from source instead — see python-sidecar/README.md`
    )
  }

  const sizeMB = (asset.size / 1024 / 1024).toFixed(0)
  log(`Downloading ${asset.name} (${sizeMB} MB)...`)

  mkdirSync(DEST, { recursive: true })

  try {
    await download(asset.browser_download_url, TMP_ZIP)
  } catch (err) {
    if (existsSync(TMP_ZIP)) unlinkSync(TMP_ZIP)
    fail(`Download failed: ${err.message}`)
  }

  log('Extracting...')
  try {
    unzip(TMP_ZIP, DEST)
  } finally {
    if (existsSync(TMP_ZIP)) unlinkSync(TMP_ZIP)
  }

  if (!existsSync(SENTINEL)) {
    fail(`Extraction completed but ${SENTINEL} was not found. Check the zip contents.`)
  }

  log(`Done. Sidecar installed at ${DEST}`)
}

main().catch((err) => fail(err.message))
