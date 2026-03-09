export type TrackFields = Record<string, string[]>

export type ParsedMediaInfo = {
  general: TrackFields
  video: TrackFields[]
  audio: TrackFields[]
  text: TrackFields[]
}

export type LanguageKey = 'fr' | 'en' | 'it' | 'ja' | 'ko' | 'zh' | 'es' | 'de'

export const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const detectSection = (headerLine: string): keyof ParsedMediaInfo | 'menu' | null => {
  const normalized = normalizeText(headerLine).replace(/\s*#\d+$/, '')
  const compact = normalized.replace(/[^a-z0-9]/g, '')

  if (compact === 'general' || compact === 'gnral') {
    return 'general'
  }
  if (compact === 'video' || compact === 'vido') {
    return 'video'
  }
  if (compact === 'audio') {
    return 'audio'
  }
  if (compact === 'text' || compact === 'texte') {
    return 'text'
  }
  if (compact === 'menu') {
    return 'menu'
  }

  return null
}

export const parseMediaInfoText = (raw: string): ParsedMediaInfo => {
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

export const getTrackValuesByKeyTerms = (
  track: TrackFields | undefined,
  keyTerms: string[],
): string[] => {
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

export const getFirstTrackValueByKeyTerms = (
  track: TrackFields | undefined,
  keyTerms: string[],
): string => getTrackValuesByKeyTerms(track, keyTerms)[0] ?? ''

export const parseIntegerFromValues = (values: string[]): number | null => {
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

export const detectLanguageKey = (value: string): LanguageKey | null => {
  const normalized = normalizeText(value)
  const tokens = new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean))

  if (
    normalized.includes('french') ||
    normalized.includes('francais') ||
    tokens.has('fr') ||
    tokens.has('fra') ||
    tokens.has('fre')
  ) {
    return 'fr'
  }

  if (
    normalized.includes('english') ||
    normalized.includes('anglais') ||
    tokens.has('en') ||
    tokens.has('eng')
  ) {
    return 'en'
  }

  if (
    normalized.includes('italian') ||
    normalized.includes('italien') ||
    tokens.has('it') ||
    tokens.has('ita')
  ) {
    return 'it'
  }

  if (
    normalized.includes('japanese') ||
    normalized.includes('japonais') ||
    tokens.has('ja') ||
    tokens.has('jpn')
  ) {
    return 'ja'
  }

  if (
    normalized.includes('korean') ||
    normalized.includes('coreen') ||
    tokens.has('ko') ||
    tokens.has('kor')
  ) {
    return 'ko'
  }

  if (
    normalized.includes('chinese') ||
    normalized.includes('chinois') ||
    tokens.has('zh') ||
    tokens.has('chi') ||
    tokens.has('zho')
  ) {
    return 'zh'
  }

  if (
    normalized.includes('spanish') ||
    normalized.includes('espagnol') ||
    tokens.has('es') ||
    tokens.has('spa')
  ) {
    return 'es'
  }

  if (
    normalized.includes('german') ||
    normalized.includes('allemand') ||
    tokens.has('de') ||
    tokens.has('ger') ||
    tokens.has('deu')
  ) {
    return 'de'
  }

  return null
}
