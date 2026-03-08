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

app.use((req, _res, next) => {
  const prefixes = [basePath]
  const forwardedPrefix = req.headers['x-forwarded-prefix']
  if (typeof forwardedPrefix === 'string' && forwardedPrefix.trim()) {
    prefixes.push(
      ...forwardedPrefix
        .split(',')
        .map((entry) => normalizeBasePath(entry))
        .filter((entry) => entry !== '/'),
    )
  }

  for (const prefix of prefixes) {
    if (prefix !== '/' && (req.url === prefix || req.url.startsWith(`${prefix}/`))) {
      req.url = req.url.slice(prefix.length) || '/'
      break
    }
  }

  next()
})

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
const mediainfoLanguage = process.env.MEDIAINFO_LANGUAGE?.trim() || 'fr'
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

const buildMediainfoExecOptions = (maxBuffer, timeout) => ({
  windowsHide: true,
  timeout,
  maxBuffer,
  env: {
    ...process.env,
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
  },
})

const withSelectedLanguageArg = (args, language) => {
  if (language.toLowerCase() !== 'auto') {
    args.push(`--Language=${language}`)
  }
}

const isLikelyMangledFrenchText = (text) => {
  const normalized = text.toLowerCase()
  return (
    normalized.includes('g?n?ral') ||
    normalized.includes('vid?o') ||
    normalized.includes('dur?e') ||
    normalized.includes('d?bit') ||
    normalized.includes('interpr?te') ||
    normalized.includes('utilis?e')
  )
}

const isFrenchLanguageEnabled = async () => {
  if (!existsSync(languageProbeTarget)) {
    return null
  }

  const args = ['--Output=TEXT']
  withSelectedLanguageArg(args, mediainfoLanguage)
  args.push(languageProbeTarget)

  const { stdout } = await execFileAsync(mediainfoBinary, args, {
    ...buildMediainfoExecOptions(1024 * 1024, 10_000),
  })

  if (!stdout?.trim()) {
    return null
  }

  const normalized = stdout.toLowerCase()
  const hasFrenchMarkers =
    normalized.includes('nom complet') ||
    normalized.includes('taille du fichier') ||
    normalized.includes('duree') ||
    normalized.includes('dur\u00e9e') ||
    normalized.includes('dur?e') ||
    normalized.includes('debit') ||
    normalized.includes('d\u00e9bit') ||
    normalized.includes('d?bit')

  if (hasFrenchMarkers || isLikelyMangledFrenchText(stdout)) {
    return true
  }

  const hasEnglishMarkers =
    normalized.includes('complete name') ||
    normalized.includes('file size') ||
    normalized.includes('duration') ||
    normalized.includes('overall bit rate')

  if (hasEnglishMarkers) {
    return false
  }

  // If language is explicitly forced (fr/file://...), avoid a false negative in the UI.
  return mediainfoLanguage.toLowerCase() !== 'auto'
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: maxUploadSizeBytes,
  },
})

const runMediainfo = async (filePath) => {
  const executeWithLanguage = async (language) => {
    const args = ['--Output=TEXT']
    withSelectedLanguageArg(args, language)
    if (mediainfoOutputProfile === 'full') {
      args.unshift('--Full')
    }
    args.push(filePath)

    const { stdout } = await execFileAsync(
      mediainfoBinary,
      args,
      buildMediainfoExecOptions(32 * 1024 * 1024, commandTimeoutMs),
    )

    return stdout
  }

  let stdout = await executeWithLanguage(mediainfoLanguage)

  if (!stdout?.trim()) {
    throw new Error('MediaInfo a retourn\u00e9 une sortie vide.')
  }

  if (
    mediainfoLanguage.toLowerCase().startsWith('file://') &&
    isLikelyMangledFrenchText(stdout)
  ) {
    const fallbackStdout = await executeWithLanguage('fr')
    if (fallbackStdout?.trim() && !isLikelyMangledFrenchText(fallbackStdout)) {
      stdout = fallbackStdout
    }
  }

  return stdout
}

app.get('/api/health', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync(mediainfoBinary, ['--Version'], {
      ...buildMediainfoExecOptions(1024 * 1024, 10_000),
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
const host = process.env.HOST?.trim() || '0.0.0.0'

app.listen(port, host, () => {
  console.log(`[nfo-api] listening on http://${host}:${port}`)
  console.log(`[nfo-api] mediainfo binary: ${mediainfoBinary}`)
  console.log(`[nfo-api] mediainfo language: ${mediainfoLanguage}`)
  console.log(`[nfo-api] mediainfo output profile: ${mediainfoOutputProfile}`)
  console.log(`[nfo-api] base path: ${basePath}`)
})
