import MediaInfoFactory from 'mediainfo.js'
import mediaInfoWasmUrl from 'mediainfo.js/MediaInfoModule.wasm?url'
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  ACCEPTED_ATTRIBUTE,
  buildNfoFilename,
  formatBytes,
  isLikelyVideoFileName,
} from './lib/file-utils'
import {
  CALA_CATEGORY_ORDER,
  CALA_MANUAL_CATEGORIES,
  type CalaSelection,
  buildCalaSelection,
} from './lib/cala-selection'
import { buildBbcodePreview, buildNfoPreview, extractTeamName } from './lib/nfo-utils'

type EngineMode = 'browser' | 'server'

type ApiHealth = {
  ok?: boolean
  frenchLanguageEnabled?: boolean | null
}

const readApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: string }
    if (payload.error) {
      return payload.error
    }
  } catch {
    // Ignore parsing errors and fallback to generic message.
  }

  return `Erreur serveur (${response.status}).`
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return "Impossible d'analyser le fichier."
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const analysisRunId = useRef(0)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [rawNfo, setRawNfo] = useState('')
  const [teamName, setTeamName] = useState('')
  const [engineMode, setEngineMode] = useState<EngineMode>('browser')
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null)
  const [serverFrenchReady, setServerFrenchReady] = useState<boolean | null>(null)
  const [calaSelection, setCalaSelection] = useState<CalaSelection | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [copiedNfo, setCopiedNfo] = useState(false)
  const [copiedBbcode, setCopiedBbcode] = useState(false)

  const nfoPreview = useMemo(() => buildNfoPreview(rawNfo, teamName), [rawNfo, teamName])
  const bbcodePreview = useMemo(
    () => buildBbcodePreview(rawNfo, selectedFile),
    [rawNfo, selectedFile],
  )

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 3500)

    const checkServer = async () => {
      try {
        const response = await fetch('/api/health', { signal: controller.signal })
        if (!response.ok) {
          setServerAvailable(false)
          setServerFrenchReady(null)
          return
        }

        const payload = (await response.json()) as ApiHealth
        const isReady = payload.ok === true
        setServerAvailable(isReady)
        setServerFrenchReady(payload.frenchLanguageEnabled ?? null)

        if (isReady) {
          setEngineMode('server')
        }
      } catch {
        setServerAvailable(false)
        setServerFrenchReady(null)
      } finally {
        window.clearTimeout(timeoutId)
      }
    }

    void checkServer()

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [])

  const analyzeInBrowser = async (file: File): Promise<string> => {
    const mediaInfo = await MediaInfoFactory({
      format: 'text',
      full: true,
      locateFile: () => mediaInfoWasmUrl,
    })

    try {
      const result = await mediaInfo.analyzeData(
        () => file.size,
        async (chunkSize, offset) => {
          const buffer = await file.slice(offset, offset + chunkSize).arrayBuffer()
          return new Uint8Array(buffer)
        },
      )

      return String(result)
    } finally {
      mediaInfo.close()
    }
  }

  const analyzeInServer = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('video', file)

    const response = await fetch('/api/mediainfo/full', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(await readApiError(response))
    }

    const payload = (await response.json()) as { text?: string }
    if (!payload.text) {
      throw new Error("Reponse serveur invalide: aucun texte MediaInfo recu.")
    }

    return payload.text
  }

  const processFile = async (file: File): Promise<void> => {
    const currentRunId = analysisRunId.current + 1
    analysisRunId.current = currentRunId

    setSelectedFile(file)
    setTeamName(extractTeamName(file.name))
    setRawNfo('')
    setCalaSelection(null)
    setCopiedNfo(false)
    setCopiedBbcode(false)
    setErrorMessage('')
    setIsAnalyzing(true)

    if (!isLikelyVideoFileName(file.name)) {
      setIsAnalyzing(false)
      setErrorMessage(
        'Format non reconnu comme video. Depose un fichier video (mkv, mp4, avi, mov, m2ts...).',
      )
      return
    }

    try {
      const result =
        engineMode === 'server' ? await analyzeInServer(file) : await analyzeInBrowser(file)

      if (analysisRunId.current !== currentRunId) {
        return
      }

      setRawNfo(result)
    } catch (error) {
      if (analysisRunId.current !== currentRunId) {
        return
      }

      setErrorMessage(getErrorMessage(error))
      console.error(error)
    } finally {
      if (analysisRunId.current === currentRunId) {
        setIsAnalyzing(false)
      }
    }
  }

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    await processFile(file)
    event.target.value = ''
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    setIsDragOver(false)

    const file = event.dataTransfer.files?.[0]
    if (!file) {
      return
    }

    await processFile(file)
  }

  const handleCopyNfo = async (): Promise<void> => {
    if (!nfoPreview) {
      return
    }

    try {
      await navigator.clipboard.writeText(nfoPreview)
      setCopiedNfo(true)
      setCopiedBbcode(false)
    } catch (error) {
      setErrorMessage('Impossible de copier automatiquement. Copie manuelle recommandee.')
      console.error(error)
    }
  }

  const handleCopyBbcode = async (): Promise<void> => {
    if (!bbcodePreview) {
      return
    }

    try {
      await navigator.clipboard.writeText(bbcodePreview)
      setCopiedBbcode(true)
      setCopiedNfo(false)
    } catch (error) {
      setErrorMessage('Impossible de copier automatiquement. Copie manuelle recommandee.')
      console.error(error)
    }
  }

  const handleDownload = (): void => {
    if (!nfoPreview || !selectedFile) {
      return
    }

    const blob = new Blob([nfoPreview], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = buildNfoFilename(selectedFile.name)
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleCalaSelection = (): void => {
    if (!selectedFile || !rawNfo.trim()) {
      return
    }

    setCalaSelection(buildCalaSelection(selectedFile, rawNfo))
  }

  const clearOutput = (): void => {
    analysisRunId.current += 1
    setSelectedFile(null)
    setRawNfo('')
    setTeamName('')
    setCalaSelection(null)
    setErrorMessage('')
    setCopiedNfo(false)
    setCopiedBbcode(false)
    setIsAnalyzing(false)
  }

  const statusLabel = isAnalyzing
    ? engineMode === 'server'
      ? 'Analyse serveur en cours...'
      : 'Analyse locale en cours...'
    : selectedFile
      ? 'Fichier pret'
      : 'Aucun fichier selectionne'

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-one" />
      <div className="bg-orb bg-orb-two" />

      <header className="hero">
        <p className="eyebrow">NFO Generator</p>
        <h1>Generateur NFO video</h1>
        <p className="subtitle">
          Depose un fichier video pour generer un NFO complet: general, video, audio, sous-titres
          et menu.
        </p>
      </header>

      <main className="workspace">
        <section className="panel panel-upload">
          <div className="engine-switch">
            <p className="engine-switch-title">Moteur d&apos;analyse</p>
            <div className="engine-options">
              <label className={`engine-option ${engineMode === 'browser' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="engine-mode"
                  checked={engineMode === 'browser'}
                  onChange={() => setEngineMode('browser')}
                />
                <span>Navigateur (WASM)</span>
              </label>
              <label className={`engine-option ${engineMode === 'server' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="engine-mode"
                  checked={engineMode === 'server'}
                  onChange={() => setEngineMode('server')}
                />
                <span>MediaInfo complet (serveur)</span>
              </label>
            </div>
            <p className="engine-hint">
              {engineMode === 'browser'
                ? 'Aucun upload: analyse 100% locale.'
                : "Upload temporaire vers l'API MediaInfo CLI pour un rendu proche du logiciel."}
            </p>
            <p className="engine-health">
              {serverAvailable === null
                ? 'Verification API en cours...'
                : serverAvailable
                  ? serverFrenchReady === false
                    ? 'API OK, mais langue FR inactive sur le serveur.'
                    : 'API OK, moteur serveur actif.'
                  : 'API indisponible: mode navigateur uniquement.'}
            </p>
          </div>

          <div
            className={`dropzone ${isDragOver ? 'is-over' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                inputRef.current?.click()
              }
            }}
          >
            <input
              ref={inputRef}
              className="file-input"
              type="file"
              accept={ACCEPTED_ATTRIBUTE}
              onChange={handleInputChange}
            />
            <p className="dropzone-title">
              {isAnalyzing ? 'Analyse du media...' : 'Glisse-depose un fichier video'}
            </p>
            <p className="dropzone-subtitle">ou clique pour selectionner un fichier</p>
          </div>

          <div className="meta-row">
            <span className={`status-pill ${isAnalyzing ? 'loading' : ''}`}>{statusLabel}</span>
            {selectedFile ? <span className="file-size">{formatBytes(selectedFile.size)}</span> : null}
          </div>

          {selectedFile ? (
            <p className="file-name" title={selectedFile.name}>
              {selectedFile.name}
            </p>
          ) : null}

          <label className="sources-label" htmlFor="sources-input">
            Team (optionnel)
          </label>
          <input
            id="sources-input"
            className="sources-input"
            type="text"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="Ex: NoNE"
          />

          <div className="actions">
            <button type="button" onClick={handleCopyNfo} disabled={!nfoPreview || isAnalyzing}>
              {copiedNfo ? 'NFO copie' : 'Copier le NFO'}
            </button>
            <button type="button" onClick={handleCopyBbcode} disabled={!bbcodePreview || isAnalyzing}>
              {copiedBbcode ? 'BBCode copie' : 'Copier BBCode'}
            </button>
            <button type="button" onClick={handleDownload} disabled={!nfoPreview || isAnalyzing}>
              Telecharger .nfo
            </button>
            <button type="button" onClick={handleCalaSelection} disabled={!rawNfo || isAnalyzing}>
              Selection La-Cale
            </button>
            <button type="button" className="button-ghost" onClick={clearOutput}>
              Reinitialiser
            </button>
          </div>

          {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
        </section>

        <section className="panel panel-preview">
          <div className="panel-header">
            <h2>Rendu NFO</h2>
            <span>
              {nfoPreview ? `${nfoPreview.length.toLocaleString('fr-FR')} caracteres` : 'En attente'}
            </span>
          </div>

          {nfoPreview ? (
            <pre className="nfo-preview">{nfoPreview}</pre>
          ) : (
            <div className="empty-state">
              <p>Le rendu apparait ici des qu&apos;un fichier est analyse.</p>
              <p>
                {engineMode === 'browser'
                  ? 'La generation est locale dans ton navigateur.'
                  : "La generation passe par l'API serveur MediaInfo CLI."}
              </p>
            </div>
          )}

          <div className="cala-panel">
            <div className="cala-header">
              <h3>Selection La-Cale</h3>
              <span>{calaSelection ? 'Generee' : 'En attente'}</span>
            </div>

            {calaSelection ? (
              <div className="cala-grid">
                {CALA_CATEGORY_ORDER.map((category) => {
                  const values = calaSelection[category] ?? []
                  return (
                    <div className="cala-row" key={category}>
                      <p className="cala-category">{category}</p>
                      <div className="cala-values">
                        {values.length > 0 ? (
                          values.map((value) => (
                            <span className="cala-chip" key={`${category}-${value}`}>
                              {value}
                            </span>
                          ))
                        ) : (
                          <span className="cala-empty">
                            {CALA_MANUAL_CATEGORIES.has(category)
                              ? 'A completer manuellement'
                              : '-'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="cala-empty">
                Clique sur &quot;Selection La-Cale&quot; pour generer les cases a cocher.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
