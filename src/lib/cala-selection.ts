import { getFileExtension, isLikelyVideoFileName } from './file-utils'

type TrackFields = Record<string, string[]>
type ParsedMediaInfo = {
  general: TrackFields
  video: TrackFields[]
  audio: TrackFields[]
  text: TrackFields[]
}

export type CalaSelection = Record<string, string[]>

export const CALA_CATEGORY_ORDER = [
  'Genres',
  'Type (XXX)',
  'Qualite / Resolution',
  'Codec video',
  'Caracteristiques video',
  'Source / Type',
  'Codec audio',
  'Langues audio',
  'Sous-titres',
  'Langues',
  'Extension',
  'Pre Active',
  'Divers',
] as const

export const CALA_MANUAL_CATEGORIES = new Set(['Genres', 'Divers'])

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const detectSection = (headerLine: string): keyof ParsedMediaInfo | 'menu' | null => {
  const normalized = normalizeText(headerLine).replace(/\s*#\d+$/, '')

  if (normalized === 'general') {
    return 'general'
  }
  if (normalized === 'video') {
    return 'video'
  }
  if (normalized === 'audio') {
    return 'audio'
  }
  if (normalized === 'text' || normalized === 'texte') {
    return 'text'
  }
  if (normalized === 'menu') {
    return 'menu'
  }

  return null
}

const parseMediaInfoText = (raw: string): ParsedMediaInfo => {
  const parsed: ParsedMediaInfo = {
    general: {},
    video: [],
    audio: [],
    text: [],
  }

  let currentSection: keyof ParsedMediaInfo | 'menu' | null = null
  let currentTrack: TrackFields | null = null

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const section = detectSection(trimmed)
    if (section === 'general') {
      currentSection = 'general'
      currentTrack = parsed.general
      continue
    }
    if (section === 'video' || section === 'audio' || section === 'text') {
      currentSection = section
      currentTrack = {}
      parsed[section].push(currentTrack)
      continue
    }
    if (section === 'menu') {
      currentSection = 'menu'
      currentTrack = null
      continue
    }

    if (!currentSection || currentSection === 'menu' || !currentTrack) {
      continue
    }

    const keyValue = line.match(/^(.+?)\s+:\s+(.*)$/)
    if (!keyValue) {
      continue
    }

    const key = keyValue[1]?.trim()
    const value = keyValue[2]?.trim()
    if (!key || !value) {
      continue
    }

    currentTrack[key] ??= []
    currentTrack[key].push(value)
  }

  return parsed
}

const getTrackValuesByKeyTerms = (track: TrackFields | undefined, keyTerms: string[]): string[] => {
  if (!track) {
    return []
  }

  const normalizedTerms = keyTerms.map(normalizeText)
  const values: string[] = []

  for (const [key, fieldValues] of Object.entries(track)) {
    const normalizedKey = normalizeText(key)
    if (normalizedTerms.some((term) => normalizedKey.includes(term))) {
      values.push(...fieldValues)
    }
  }

  return values
}

const parseIntegerFromValues = (values: string[]): number | null => {
  for (const value of values) {
    const digits = value.replace(/[^0-9]/g, '')
    if (!digits) {
      continue
    }

    const parsed = Number.parseInt(digits, 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

const mapLanguageLabel = (value: string): string | null => {
  const normalized = normalizeText(value)
  const tokens = new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean))

  if (
    normalized.includes('french') ||
    normalized.includes('francais') ||
    tokens.has('fr') ||
    tokens.has('fra') ||
    tokens.has('fre')
  ) {
    return 'French'
  }

  if (
    normalized.includes('english') ||
    normalized.includes('anglais') ||
    tokens.has('en') ||
    tokens.has('eng')
  ) {
    return 'English'
  }

  if (
    normalized.includes('italian') ||
    normalized.includes('italien') ||
    tokens.has('it') ||
    tokens.has('ita')
  ) {
    return 'Italian'
  }

  if (
    normalized.includes('japanese') ||
    normalized.includes('japonais') ||
    tokens.has('ja') ||
    tokens.has('jpn')
  ) {
    return 'Japanese'
  }

  if (
    normalized.includes('korean') ||
    normalized.includes('coreen') ||
    tokens.has('ko') ||
    tokens.has('kor')
  ) {
    return 'Korean'
  }

  if (
    normalized.includes('chinese') ||
    normalized.includes('chinois') ||
    tokens.has('zh') ||
    tokens.has('chi') ||
    tokens.has('zho')
  ) {
    return 'Chinois'
  }

  if (
    normalized.includes('spanish') ||
    normalized.includes('espagnol') ||
    tokens.has('es') ||
    tokens.has('spa')
  ) {
    return 'Spanish'
  }

  return null
}

const addSelectionValue = (selection: CalaSelection, category: string, value: string): void => {
  if (!value.trim()) {
    return
  }

  const existing = selection[category] ?? []
  if (!existing.includes(value)) {
    selection[category] = [...existing, value]
  }
}

export const buildCalaSelection = (file: File, rawNfo: string): CalaSelection => {
  const selection: CalaSelection = {}
  const parsed = parseMediaInfoText(rawNfo)
  const normalizedFileName = normalizeText(file.name)
  const normalizedRaw = normalizeText(rawNfo)
  const firstVideoTrack = parsed.video[0]

  if (isLikelyVideoFileName(file.name)) {
    addSelectionValue(selection, 'Type (XXX)', 'Video')
  }

  const extension = getFileExtension(file.name).toLowerCase()
  if (extension === 'mkv') {
    addSelectionValue(selection, 'Extension', 'MKV')
  } else if (extension === 'mp4') {
    addSelectionValue(selection, 'Extension', 'MP4')
  } else if (extension === 'avi') {
    addSelectionValue(selection, 'Extension', 'AVI')
  } else if (extension === 'iso') {
    addSelectionValue(selection, 'Extension', 'ISO')
  }

  if (/pre[\s._-]*active/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Pre Active', 'Pre Active')
  }

  if (/4klight/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', '4KLight')
  }
  if (/hdlight/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', 'HDLight')
  }
  if (/remux/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', 'REMUX')
  }
  if (/(blu[\s._-]*ray|bdrip|bdremux|brrip)/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', 'BluRay')
  }
  if (/dvd[\s._-]*rip/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', 'DVDRip')
  }
  if (/web[\s._-]*dl/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', 'WEB-DL')
  }
  if (/web[\s._-]*rip/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', 'WEBRip')
  }
  if (/(^|[.\-_ ])tv(rip)?($|[.\-_ ])/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', 'TV')
  }
  if (/vhs/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', 'VHS')
  }
  if (/(full[\s._-]*disc|bdmv|full[\s._-]*bluray)/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Source / Type', 'FULL Disc')
  }

  const width = parseIntegerFromValues(getTrackValuesByKeyTerms(firstVideoTrack, ['width', 'largeur']))
  const height = parseIntegerFromValues(getTrackValuesByKeyTerms(firstVideoTrack, ['height', 'hauteur']))

  if (/(4320p|8k)/.test(normalizedFileName) || (width !== null && height !== null && width >= 7600)) {
    addSelectionValue(selection, 'Qualite / Resolution', '4320p (8K)')
  } else if (
    /(2160p|4k)/.test(normalizedFileName) ||
    (width !== null && height !== null && width >= 3500)
  ) {
    addSelectionValue(selection, 'Qualite / Resolution', '2160p (4K)')
  } else if (
    /(1080p|full[\s._-]*hd)/.test(normalizedFileName) ||
    (width !== null && height !== null && width >= 1800)
  ) {
    addSelectionValue(selection, 'Qualite / Resolution', '1080p (Full HD)')
  } else if (/(720p|[\s._-]hd[\s._-])/.test(normalizedFileName) || (width !== null && width >= 1200)) {
    addSelectionValue(selection, 'Qualite / Resolution', '720p (HD)')
  } else {
    addSelectionValue(selection, 'Qualite / Resolution', 'SD')
  }

  const videoIdentity = normalizeText(
    [
      file.name,
      ...getTrackValuesByKeyTerms(firstVideoTrack, ['format', 'codec', 'profile', 'profil']),
    ].join(' '),
  )

  if (/(vvc|h266|x266)/.test(videoIdentity)) {
    addSelectionValue(selection, 'Codec video', 'VCC/H266/x266')
  } else if (/(^|[^a-z0-9])av1([^a-z0-9]|$)/.test(videoIdentity)) {
    addSelectionValue(selection, 'Codec video', 'AV1')
  } else if (/(hevc|h265|x265)/.test(videoIdentity)) {
    addSelectionValue(selection, 'Codec video', 'HEVC/H265/x265')
  } else if (/(avc|h264|x264)/.test(videoIdentity)) {
    addSelectionValue(selection, 'Codec video', 'AVC/H264/x264')
  } else if (/vc-?1/.test(videoIdentity)) {
    addSelectionValue(selection, 'Codec video', 'VC-1')
  } else if (/(^|[^a-z0-9])vp9([^a-z0-9]|$)/.test(videoIdentity)) {
    addSelectionValue(selection, 'Codec video', 'VP9')
  } else if (/mpeg/.test(videoIdentity)) {
    addSelectionValue(selection, 'Codec video', 'MPEG')
  }

  const bitDepthValues = getTrackValuesByKeyTerms(firstVideoTrack, ['bit depth', 'profondeur binaire'])
  if (bitDepthValues.some((value) => /(^|[^0-9])10([^0-9]|$)/.test(value))) {
    addSelectionValue(selection, 'Caracteristiques video', '10 bits')
  }

  const scanTypeValues = getTrackValuesByKeyTerms(firstVideoTrack, ['scan type', 'type de balayage'])
  if (
    scanTypeValues.some((value) => /interlaced|entrelace/i.test(value)) ||
    /interlaced/.test(videoIdentity)
  ) {
    addSelectionValue(selection, 'Caracteristiques video', 'INTERLACED')
  }

  const isDolbyVision = /(dolby vision|dovi)/.test(normalizedRaw) || /(dolby vision|dovi)/.test(videoIdentity)
  const isHdr10Plus = /hdr10\+/.test(normalizedRaw) || /hdr10\+/.test(videoIdentity)
  const isHlg = /(^|[^a-z0-9])hlg([^a-z0-9]|$)/.test(normalizedRaw)
  const isHdr =
    /(^|[^a-z0-9])hdr([^a-z0-9]|$)/.test(normalizedRaw) ||
    /(^|[^a-z0-9])hdr([^a-z0-9]|$)/.test(videoIdentity)

  if (isDolbyVision) {
    addSelectionValue(selection, 'Caracteristiques video', 'Dolby Vision')
  }
  if (isHdr10Plus) {
    addSelectionValue(selection, 'Caracteristiques video', 'HDR10+')
  }
  if (isHlg) {
    addSelectionValue(selection, 'Caracteristiques video', 'HLG')
  }
  if (isHdr || isHdr10Plus) {
    addSelectionValue(selection, 'Caracteristiques video', 'HDR')
  }
  if (/imax/.test(normalizedRaw) || /imax/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Caracteristiques video', 'IMAX')
  }
  if (
    /(3d|sbs|hsbs|tab|mvc)/.test(normalizedRaw) ||
    /(3d|sbs|hsbs|tab|mvc)/.test(normalizedFileName)
  ) {
    addSelectionValue(selection, 'Caracteristiques video', '3D')
  }
  if (!isDolbyVision && !isHdr && !isHdr10Plus && !isHlg) {
    addSelectionValue(selection, 'Caracteristiques video', 'SDR')
  }

  const audioLanguageSet = new Set<string>()
  const subtitleLanguageSet = new Set<string>()

  for (const audioTrack of parsed.audio) {
    const audioValues = getTrackValuesByKeyTerms(audioTrack, [
      'format',
      'nom commercial',
      'commercial name',
      'codec',
      'title',
      'titre',
    ])
    const audioIdentity = normalizeText(audioValues.join(' '))

    if (/truehd/.test(audioIdentity) && /atmos/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'TrueHD Atmos')
    } else if (/truehd/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'TrueHD')
    }

    if (/(e-?ac-?3|eac3)/.test(audioIdentity) && /atmos/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'E-AC3 Atmos')
    } else if (/(e-?ac-?3|eac3)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'E-AC3')
    }

    if (/(^|[^a-z0-9])ac-?4([^a-z0-9]|$)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'AC4')
    }

    if (
      /(^|[^a-z0-9])ac-?3([^a-z0-9]|$)/.test(audioIdentity) &&
      !/(e-?ac-?3|eac3)/.test(audioIdentity)
    ) {
      addSelectionValue(selection, 'Codec audio', 'AC3')
    }

    if (/(dts[- ]?hd.*master|dts xll)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'DTS-HD MA')
    } else if (/(dts[- ]?hd.*high|dts[- ]?hd hr)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'DTS-HD HR')
    } else if (/(dts[: ]?x|dtsx)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'DTS:X')
    } else if (/(^|[^a-z0-9])dts([^a-z0-9]|$)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'DTS')
    }

    if (/he[- ]?aac/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'HE-AAC')
    } else if (/(^|[^a-z0-9])aac([^a-z0-9]|$)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'AAC')
    }

    if (/flac/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'FLAC')
    }
    if (/(^|[^a-z0-9])mp3([^a-z0-9]|$)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'MP3')
    }
    if (/(^|[^a-z0-9])opus([^a-z0-9]|$)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'Opus')
    }
    if (/(^|[^a-z0-9])pcm([^a-z0-9]|$)/.test(audioIdentity)) {
      addSelectionValue(selection, 'Codec audio', 'PCM')
    }

    if (/vff/.test(audioIdentity) || /vff/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Langues audio', 'VFF')
    }
    if (/vfq/.test(audioIdentity) || /vfq/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Langues audio', 'VFQ')
    }

    const languageValues = getTrackValuesByKeyTerms(audioTrack, ['language', 'langue'])
    for (const languageValue of languageValues) {
      const mapped = mapLanguageLabel(languageValue)
      if (mapped) {
        audioLanguageSet.add(mapped)
      }
    }
  }

  if (parsed.audio.length === 0) {
    addSelectionValue(selection, 'Langues audio', 'Sans Dialogue')
  }

  for (const language of audioLanguageSet) {
    addSelectionValue(selection, 'Langues audio', language)
  }

  if (audioLanguageSet.size > 1 || /(^|[^a-z0-9])multi([^a-z0-9]|$)/.test(normalizedFileName)) {
    addSelectionValue(selection, 'Langues audio', 'MULTI')
  }

  for (const textTrack of parsed.text) {
    const textLanguageValues = getTrackValuesByKeyTerms(textTrack, ['language', 'langue'])
    for (const languageValue of textLanguageValues) {
      const mapped = mapLanguageLabel(languageValue)
      if (mapped) {
        subtitleLanguageSet.add(mapped)
      }
    }

    const textTitle = normalizeText(getTrackValuesByKeyTerms(textTrack, ['title', 'titre']).join(' '))
    if (/vff/.test(textTitle) || /vff/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Sous-titres', 'ST : VFF')
    }
    if (/vfq/.test(textTitle) || /vfq/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Sous-titres', 'ST : VFQ')
    }
  }

  if (subtitleLanguageSet.has('French')) {
    addSelectionValue(selection, 'Sous-titres', 'ST : FR')
  }
  if (subtitleLanguageSet.has('English')) {
    addSelectionValue(selection, 'Sous-titres', 'ST : ENG')
  }

  const combinedLanguages = new Set<string>([...audioLanguageSet, ...subtitleLanguageSet])
  if (combinedLanguages.has('English')) {
    addSelectionValue(selection, 'Langues', 'Anglais')
  }
  if (combinedLanguages.has('French')) {
    addSelectionValue(selection, 'Langues', 'Francais')
  }
  if (combinedLanguages.has('Japanese')) {
    addSelectionValue(selection, 'Langues', 'Japonais')
  }
  if (
    [...combinedLanguages].some((language) =>
      ['Italian', 'Korean', 'Chinois', 'Spanish'].includes(language),
    )
  ) {
    addSelectionValue(selection, 'Langues', 'Autres Langues')
  }

  const genreRules: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /(documentary|documentaire|docu)/, label: 'Documentaire' },
    { pattern: /(animation|anime)/, label: 'Animation' },
    { pattern: /(comedy|comedie)/, label: 'Comedie' },
    { pattern: /(drama|drame)/, label: 'Drame' },
    { pattern: /(horror|horreur)/, label: 'Horreur' },
    { pattern: /(thriller|suspense|policier)/, label: 'Policier / Thriller' },
    { pattern: /(science.?fiction|sci.?fi)/, label: 'Science-fiction' },
    { pattern: /(romance)/, label: 'Romance' },
    { pattern: /(western)/, label: 'Western' },
    { pattern: /(concert)/, label: 'Concerts' },
    { pattern: /(s\d{2}e\d{2}|season|episode|serie|tvshow)/, label: 'Emission TV' },
  ]

  for (const rule of genreRules) {
    if (rule.pattern.test(normalizedFileName)) {
      addSelectionValue(selection, 'Genres', rule.label)
    }
  }

  if (
    /(template|wallpaper|formation|pack.?audio|ressource.?graphique|imprimante.?3d)/.test(
      normalizedFileName,
    )
  ) {
    if (/template/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Divers', 'Templates')
    }
    if (/wallpaper/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Divers', 'Wallpapers')
    }
    if (/formation/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Divers', 'Formation')
    }
    if (/pack.?audio/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Divers', 'Packs audio')
    }
    if (/ressource.?graphique/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Divers', 'Ressources graphiques')
    }
    if (/imprimante.?3d/.test(normalizedFileName)) {
      addSelectionValue(selection, 'Divers', 'Imprimante 3d')
    }
  }

  if (!selection['Source / Type']?.length) {
    if (/bluray/.test(normalizedRaw)) {
      addSelectionValue(selection, 'Source / Type', 'BluRay')
    } else if (/web/.test(normalizedRaw)) {
      addSelectionValue(selection, 'Source / Type', 'WEB-DL')
    }
  }

  return selection
}
