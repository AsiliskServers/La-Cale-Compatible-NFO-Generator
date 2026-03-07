import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import express from 'express'
import multer from 'multer'

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const uploadDir = path.join(os.tmpdir(), 'nfo-generator-uploads')
const bundledFrenchLanguageFile = path.join(rootDir, 'resources', 'mediainfo-fr.csv')
const languageProbeTarget = path.join(rootDir, 'package.json')

await mkdir(uploadDir, { recursive: true })

const app = express()
app.disable('x-powered-by')

const normalizeBasePath = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw || raw === '/') {
    return '/'
  }

  const trimmed = raw.replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}` : '/'
}

const basePath = normalizeBasePath(process.env.BASE_PATH)

if (basePath !== '/') {
  app.use((req, _res, next) => {
    if (req.url === basePath || req.url.startsWith(`${basePath}/`)) {
      req.url = req.url.slice(basePath.length) || '/'
    }
    next()
  })
}

const findWingetMediainfoBinary = () => {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) {
    return null
  }

  const wingetLinksBinary = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'MediaInfo.exe')
  if (existsSync(wingetLinksBinary)) {
    return wingetLinksBinary
  }

  const packagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  if (!existsSync(packagesDir)) {
    return null
  }

  try {
    const entries = readdirSync(packagesDir, { withFileTypes: true })
    const packageEntry = entries.find(
      (entry) => entry.isDirectory() && entry.name.startsWith('MediaArea.MediaInfo_'),
    )

    if (!packageEntry) {
      return null
    }

    const packageBinary = path.join(packagesDir, packageEntry.name, 'MediaInfo.exe')
    return existsSync(packageBinary) ? packageBinary : null
  } catch {
    return null
  }
}

const mediainfoBinary =
  process.env.MEDIAINFO_BINARY?.trim() || findWingetMediainfoBinary() || 'mediainfo'
const mediainfoLanguageDefault = existsSync(bundledFrenchLanguageFile)
  ? `file://${bundledFrenchLanguageFile}`
  : 'fr'
const mediainfoLanguage = process.env.MEDIAINFO_LANGUAGE?.trim() || mediainfoLanguageDefault
const mediainfoOutputProfile = (process.env.MEDIAINFO_OUTPUT_PROFILE?.trim() || 'standard').toLowerCase()
const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const commandTimeoutMs = parsePositiveNumber(process.env.MEDIAINFO_TIMEOUT_MS, 120_000)
const maxUploadSizeBytes = parsePositiveNumber(
  process.env.MAX_UPLOAD_SIZE_BYTES,
  25 * 1024 * 1024 * 1024,
)

const mediainfoInstallHintWindows =
  "Binaire MediaInfo introuvable. Installe-le avec 'winget install --id MediaArea.MediaInfo --exact --source winget --accept-package-agreements --accept-source-agreements --silent' puis relance l'API."
const mediainfoInstallHintLinux =
  "Binaire MediaInfo introuvable. Installe-le avec 'sudo apt-get update && sudo apt-get install -y mediainfo' puis relance l'API."
const mediainfoInstallHint = process.platform === 'win32' ? mediainfoInstallHintWindows : mediainfoInstallHintLinux

const isBinaryMissingMessage = (message) =>
  /(ENOENT|not recognized|introuvable)/i.test(message)

const normalizeMediainfoError = (error) => {
  const message = error instanceof Error ? error.message : String(error)
  if (isBinaryMissingMessage(message)) {
    return mediainfoInstallHint
  }

  return message
}

const withLanguageArg = (args) => {
  if (mediainfoLanguage.toLowerCase() !== 'auto') {
    args.push(`--Language=${mediainfoLanguage}`)
  }
}

const isFrenchLanguageEnabled = async () => {
  if (!existsSync(languageProbeTarget)) {
    return null
  }

  const args = ['--Output=TEXT']
  withLanguageArg(args)
  args.push(languageProbeTarget)

  const { stdout } = await execFileAsync(mediainfoBinary, args, {
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  })

  const firstLine = stdout.split(/\r?\n/).find((line) => line.trim().length > 0) ?? ''
  if (!firstLine) {
    return null
  }

  return firstLine.trim().toLowerCase().startsWith('general') ? false : true
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: maxUploadSizeBytes,
  },
})

const runMediainfo = async (filePath) => {
  const args = ['--Output=TEXT']
  withLanguageArg(args)

  if (mediainfoOutputProfile === 'full') {
    args.unshift('--Full')
  }

  args.push(filePath)

  const { stdout } = await execFileAsync(mediainfoBinary, args, {
    windowsHide: true,
    timeout: commandTimeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  })

  if (!stdout?.trim()) {
    throw new Error('MediaInfo a retourn\u00e9 une sortie vide.')
  }

  return stdout
}

app.get('/api/health', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync(mediainfoBinary, ['--Version'], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    })
    const frenchLanguageEnabled = await isFrenchLanguageEnabled()

    res.json({
      ok: true,
      engine: 'mediainfo-cli',
      binary: mediainfoBinary,
      language: mediainfoLanguage,
      outputProfile: mediainfoOutputProfile,
      frenchLanguageEnabled,
      version: stdout.trim(),
    })
  } catch (error) {
    const message = normalizeMediainfoError(error)

    res.status(503).json({
      ok: false,
      error: message,
    })
  }
})

app.post('/api/mediainfo/full', upload.single('video'), async (req, res) => {
  const uploadedFile = req.file
  if (!uploadedFile) {
    res.status(400).json({
      error: "Aucun fichier re\u00e7u. Envoie un champ multipart 'video'.",
    })
    return
  }

  try {
    const text = await runMediainfo(uploadedFile.path)
    res.json({ text })
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    const message = normalizeMediainfoError(error)
    const isBinaryMissing = isBinaryMissingMessage(rawMessage)
    const statusCode = isBinaryMissing ? 503 : 500

    res.status(statusCode).json({ error: message })
  } finally {
    await rm(uploadedFile.path, { force: true })
  }
})

if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

const port = Number(process.env.PORT || 8787)

app.listen(port, () => {
  console.log(`[nfo-api] listening on http://localhost:${port}`)
  console.log(`[nfo-api] mediainfo binary: ${mediainfoBinary}`)
  console.log(`[nfo-api] mediainfo language: ${mediainfoLanguage}`)
  console.log(`[nfo-api] mediainfo output profile: ${mediainfoOutputProfile}`)
  console.log(`[nfo-api] base path: ${basePath}`)
})
