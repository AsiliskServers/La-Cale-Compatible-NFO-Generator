const nonTeamTokens = new Set([
  'bluray',
  'bdrip',
  'brip',
  'dvdrip',
  'hdtv',
  'web',
  'webrip',
  'webdl',
  'web-dl',
  'remux',
  'hdrip',
  'x264',
  'x265',
  'h264',
  'h265',
  'hevc',
  'av1',
  'aac',
  'ac3',
  'dts',
  'ddp',
  'multi',
  'vff',
  'vfq',
  'vostfr',
  'french',
  'truefrench',
  'proper',
  'repack',
  'extended',
  'final',
])

const normalizeTeamCandidate = (value: string): string =>
  value.toLowerCase().replace(/[\s._-]+/g, '')

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

type TrackFields = Record<string, string[]>
type ParsedMediaInfo = {
  general: TrackFields
  video: TrackFields[]
  audio: TrackFields[]
  text: TrackFields[]
}

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

const getFirstTrackValueByKeyTerms = (track: TrackFields | undefined, keyTerms: string[]): string => {
  return getTrackValuesByKeyTerms(track, keyTerms)[0] ?? ''
}

const parseIntegerFromValue = (value: string): number | null => {
  const digits = value.replace(/[^0-9]/g, '')
  if (!digits) {
    return null
  }

  const parsed = Number.parseInt(digits, 10)
  return Number.isFinite(parsed) ? parsed : null
}

const parseSizeToBytes = (value: string): number | null => {
  const match = value.match(/([0-9]+(?:[.,][0-9]+)?)\s*(kib|mib|gib|tib|kb|mb|gb|tb)/i)
  if (!match) {
    return null
  }

  const numeric = Number.parseFloat((match[1] ?? '').replace(',', '.'))
  const unit = (match[2] ?? '').toLowerCase()
  if (!Number.isFinite(numeric)) {
    return null
  }

  const multiplier =
    unit === 'kib' || unit === 'kb'
      ? 1024
      : unit === 'mib' || unit === 'mb'
        ? 1024 ** 2
        : unit === 'gib' || unit === 'gb'
          ? 1024 ** 3
          : unit === 'tib' || unit === 'tb'
            ? 1024 ** 4
            : 1

  return numeric * multiplier
}

const formatBytesToGo = (bytes: number | null): string => {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
    return '-'
  }

  const go = bytes / 1024 ** 3
  const rounded = go >= 10 ? go.toFixed(1) : go.toFixed(2)
  const cleaned = rounded.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
  return `${cleaned} GO`
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
    return 'Fran\u00e7ais'
  }
  if (
    normalized.includes('english') ||
    normalized.includes('anglais') ||
    tokens.has('en') ||
    tokens.has('eng')
  ) {
    return 'Anglais'
  }
  if (
    normalized.includes('italian') ||
    normalized.includes('italien') ||
    tokens.has('it') ||
    tokens.has('ita')
  ) {
    return 'Italien'
  }
  if (
    normalized.includes('japanese') ||
    normalized.includes('japonais') ||
    tokens.has('ja') ||
    tokens.has('jpn')
  ) {
    return 'Japonais'
  }
  if (
    normalized.includes('korean') ||
    normalized.includes('coreen') ||
    tokens.has('ko') ||
    tokens.has('kor')
  ) {
    return 'Cor\u00e9en'
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
    return 'Espagnol'
  }
  if (
    normalized.includes('german') ||
    normalized.includes('allemand') ||
    tokens.has('de') ||
    tokens.has('ger') ||
    tokens.has('deu')
  ) {
    return 'Allemand'
  }

  return null
}

const detectQuality = (videoTrack: TrackFields | undefined, rawNfo: string): string => {
  const width = parseIntegerFromValue(getFirstTrackValueByKeyTerms(videoTrack, ['width', 'largeur']))
  const height = parseIntegerFromValue(getFirstTrackValueByKeyTerms(videoTrack, ['height', 'hauteur']))

  if ((height !== null && height >= 4320) || (width !== null && width >= 7600)) {
    return '4320p'
  }
  if ((height !== null && height >= 2160) || (width !== null && width >= 3500)) {
    return '2160p'
  }
  if ((height !== null && height >= 1080) || (width !== null && width >= 1800)) {
    return '1080p'
  }
  if ((height !== null && height >= 720) || (width !== null && width >= 1200)) {
    return '720p'
  }

  const fromText = rawNfo.match(/(?:^|[^0-9])(4320p|2160p|1440p|1080p|720p|576p|480p)(?:[^0-9]|$)/i)
  if (fromText?.[1]) {
    return fromText[1].toLowerCase()
  }

  return '-'
}

const detectContainerFormat = (generalTrack: TrackFields, fileName: string, rawNfo: string): string => {
  const normalizedFileName = normalizeText(fileName)
  const normalizedRaw = normalizeText(rawNfo)
  const sourceIdentity = `${normalizedFileName} ${normalizedRaw}`

  if (/web[\s._-]*dl/.test(sourceIdentity)) {
    return 'WEB-DL'
  }
  if (/web[\s._-]*rip/.test(sourceIdentity)) {
    return 'WEBRip'
  }
  if (/(blu[\s._-]*ray|bdrip|bdremux|brrip)/.test(sourceIdentity)) {
    return 'BluRay'
  }
  if (/remux/.test(sourceIdentity)) {
    return 'REMUX'
  }
  if (/dvd[\s._-]*rip/.test(sourceIdentity)) {
    return 'DVDRip'
  }
  if (/(^|[.\-_ ])tv(rip)?($|[.\-_ ])/.test(sourceIdentity)) {
    return 'TV'
  }

  const generalFormat = normalizeText(getFirstTrackValueByKeyTerms(generalTrack, ['format']))

  if (generalFormat.includes('matroska')) {
    return 'MKV'
  }
  if (generalFormat.includes('mpeg-4') || generalFormat.includes('mp4')) {
    return 'MP4'
  }
  if (generalFormat.includes('avi')) {
    return 'AVI'
  }
  if (generalFormat.includes('quicktime')) {
    return 'MOV'
  }

  const extension = fileName.split('.').at(-1)?.toUpperCase() ?? ''
  return extension || '-'
}

const detectVideoCodec = (videoTrack: TrackFields | undefined): string => {
  const codecIdentity = normalizeText(
    [
      ...getTrackValuesByKeyTerms(videoTrack, [
        'format',
        'codec',
        'codec id',
        'format profile',
        'profil du format',
        'writing library',
        'encoded library',
        'nom commercial',
        'commercial name',
      ]),
    ].join(' '),
  )

  if (/x264/.test(codecIdentity)) {
    return 'x264'
  }
  if (/x265/.test(codecIdentity)) {
    return 'x265'
  }
  if (/(x266|h266|vvc)/.test(codecIdentity)) {
    return 'x266'
  }
  if (/(^|[^a-z0-9])av1([^a-z0-9]|$)/.test(codecIdentity)) {
    return 'AV1'
  }
  if (/(^|[^a-z0-9])vp9([^a-z0-9]|$)/.test(codecIdentity)) {
    return 'VP9'
  }
  if (/(hevc|h265)/.test(codecIdentity)) {
    return 'H.265'
  }
  if (/(avc|h264)/.test(codecIdentity)) {
    return 'H.264'
  }
  if (/mpeg-?2/.test(codecIdentity)) {
    return 'MPEG-2'
  }
  if (/mpeg-?4/.test(codecIdentity)) {
    return 'MPEG-4'
  }

  const fallbackFormat = getFirstTrackValueByKeyTerms(videoTrack, ['format'])
  return fallbackFormat || '-'
}

const detectAudioCodecLabels = (audioTrack: TrackFields | undefined): string[] => {
  if (!audioTrack) {
    return []
  }

  const codecIdentity = normalizeText(
    getTrackValuesByKeyTerms(audioTrack, [
      'format',
      'nom commercial',
      'commercial name',
      'codec',
      'codec id',
      'title',
      'titre',
    ]).join(' '),
  )

  const labels: string[] = []
  const pushLabel = (label: string): void => {
    if (!labels.includes(label)) {
      labels.push(label)
    }
  }

  if (/truehd/.test(codecIdentity) && /atmos/.test(codecIdentity)) {
    pushLabel('TrueHD Atmos')
  } else if (/truehd/.test(codecIdentity)) {
    pushLabel('TrueHD')
  }

  if (/(e-?ac-?3|eac3|ddp)/.test(codecIdentity) && /atmos/.test(codecIdentity)) {
    pushLabel('E-AC3 Atmos')
  } else if (/(e-?ac-?3|eac3|ddp)/.test(codecIdentity)) {
    pushLabel('E-AC3')
  }

  if (/(^|[^a-z0-9])ac-?4([^a-z0-9]|$)/.test(codecIdentity)) {
    pushLabel('AC4')
  }

  if (/(^|[^a-z0-9])ac-?3([^a-z0-9]|$)/.test(codecIdentity)) {
    pushLabel('AC3')
  }

  if (/(dts[- ]?hd.*master|dts xll)/.test(codecIdentity)) {
    pushLabel('DTS-HD MA')
  } else if (/(dts[- ]?hd.*high|dts[- ]?hd hr)/.test(codecIdentity)) {
    pushLabel('DTS-HD HR')
  } else if (/(dts[: ]?x|dtsx)/.test(codecIdentity)) {
    pushLabel('DTS:X')
  } else if (/(^|[^a-z0-9])dts([^a-z0-9]|$)/.test(codecIdentity)) {
    pushLabel('DTS')
  }

  if (/he[- ]?aac/.test(codecIdentity)) {
    pushLabel('HE-AAC')
  } else if (/(^|[^a-z0-9])aac([^a-z0-9]|$)/.test(codecIdentity)) {
    pushLabel('AAC')
  }

  if (/(^|[^a-z0-9])flac([^a-z0-9]|$)/.test(codecIdentity)) {
    pushLabel('FLAC')
  }
  if (/(^|[^a-z0-9])opus([^a-z0-9]|$)/.test(codecIdentity)) {
    pushLabel('Opus')
  }
  if (/(^|[^a-z0-9])mp3([^a-z0-9]|$)/.test(codecIdentity)) {
    pushLabel('MP3')
  }
  if (/(^|[^a-z0-9])pcm([^a-z0-9]|$)/.test(codecIdentity)) {
    pushLabel('PCM')
  }

  if (labels.length > 0) {
    return labels
  }

  const fallbackFormat = getFirstTrackValueByKeyTerms(audioTrack, ['format'])
  return fallbackFormat ? [fallbackFormat] : []
}

const detectAudioCodecs = (audioTracks: TrackFields[]): string => {
  if (audioTracks.length === 0) {
    return '-'
  }

  const labels: string[] = []
  for (const audioTrack of audioTracks) {
    for (const label of detectAudioCodecLabels(audioTrack)) {
      if (!labels.includes(label)) {
        labels.push(label)
      }
    }
  }

  return labels.length > 0 ? labels.join(', ') : '-'
}

const detectAudioLanguages = (audioTracks: TrackFields[], fileName: string): string => {
  if (audioTracks.length === 0) {
    return '-'
  }

  const labels: string[] = []
  const baseLanguageSet = new Set<string>()
  const normalizedFileName = normalizeText(fileName)
  const fileHasVff = /(^|[^a-z0-9])vff([^a-z0-9]|$)/.test(normalizedFileName)
  const fileHasVfq = /(^|[^a-z0-9])vfq([^a-z0-9]|$)/.test(normalizedFileName)

  const addLabel = (label: string): void => {
    if (!labels.includes(label)) {
      labels.push(label)
    }
  }

  for (const audioTrack of audioTracks) {
    const languageValues = getTrackValuesByKeyTerms(audioTrack, ['language', 'langue'])
    const trackIdentity = normalizeText(
      `${getTrackValuesByKeyTerms(audioTrack, ['title', 'titre']).join(' ')} ${languageValues.join(' ')}`,
    )
    const trackHasVff = fileHasVff || /(^|[^a-z0-9])vff([^a-z0-9]|$)/.test(trackIdentity)
    const trackHasVfq = fileHasVfq || /(^|[^a-z0-9])vfq([^a-z0-9]|$)/.test(trackIdentity)

    for (const languageValue of languageValues) {
      const mapped = mapLanguageLabel(languageValue)
      if (mapped) {
        baseLanguageSet.add(mapped)
        if (mapped === 'Fran\u00e7ais') {
          if (trackHasVff) {
            addLabel('Fran\u00e7ais (VFF)')
          } else if (trackHasVfq) {
            addLabel('Fran\u00e7ais (VFQ)')
          } else {
            addLabel('Fran\u00e7ais')
          }
        } else {
          addLabel(mapped)
        }
      }
    }
  }

  if (labels.length === 0) {
    if (fileHasVff) {
      return 'Fran\u00e7ais (VFF)'
    }
    if (fileHasVfq) {
      return 'Fran\u00e7ais (VFQ)'
    }
    return '-'
  }

  if (baseLanguageSet.size > 1) {
    addLabel('MULTI')
  }

  return labels.join(', ')
}

const detectSubtitleLanguages = (textTracks: TrackFields[]): string => {
  if (textTracks.length === 0) {
    return 'Aucun'
  }

  const languageSet = new Set<string>()

  for (const textTrack of textTracks) {
    const languageValues = getTrackValuesByKeyTerms(textTrack, ['language', 'langue'])
    for (const languageValue of languageValues) {
      const mapped = mapLanguageLabel(languageValue)
      if (mapped) {
        languageSet.add(mapped)
      }
    }
  }

  if (languageSet.size === 0) {
    return 'Oui'
  }

  const labels = Array.from(languageSet)
  if (labels.length === 1) {
    const singleLanguage = labels[0] ?? ''
    if (singleLanguage === 'Fran\u00e7ais' && textTracks.length > 1) {
      return 'Fran\u00e7ais (Complet)'
    }

    return singleLanguage
  }

  return labels.join(', ')
}

const isValidTeamCandidate = (value: string): boolean => {
  const normalized = normalizeTeamCandidate(value)
  if (!normalized || normalized.length < 2) {
    return false
  }

  return !nonTeamTokens.has(normalized)
}

export const extractTeamName = (fileName: string): string => {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  const candidates = [
    withoutExtension.match(/-([^-]+)$/)?.[1] ?? '',
    withoutExtension.match(/\[([^[\]]+)\]\s*$/)?.[1] ?? '',
    withoutExtension.match(/\(([^(]+)\)\s*$/)?.[1] ?? '',
  ]

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (!trimmed) {
      continue
    }

    if (isValidTeamCandidate(trimmed)) {
      return trimmed
    }
  }

  return ''
}

export const buildNfoPreview = (rawNfo: string, teamName: string): string => {
  if (!rawNfo) {
    return ''
  }

  const cleaned = rawNfo.trimEnd()
  if (!teamName.trim()) {
    return `${cleaned}\n`
  }

  return `${cleaned}\n\nSource                                   : ${teamName.trim()}\n`
}

export const buildBbcodePreview = (rawNfo: string, file: File | null): string => {
  if (!rawNfo.trim()) {
    return ''
  }

  const parsed = parseMediaInfoText(rawNfo)
  const firstVideoTrack = parsed.video[0]

  const quality = detectQuality(firstVideoTrack, rawNfo)
  const format = detectContainerFormat(parsed.general, file?.name ?? '', rawNfo)
  const videoCodec = detectVideoCodec(firstVideoTrack)
  const audioCodec = detectAudioCodecs(parsed.audio)
  const languages = detectAudioLanguages(parsed.audio, file?.name ?? '')
  const subtitles = detectSubtitleLanguages(parsed.text)
  const fileSizeValue =
    file?.size ??
    parseSizeToBytes(getFirstTrackValueByKeyTerms(parsed.general, ['file size', 'taille du fichier']))
  const size = formatBytesToGo(fileSizeValue)

  return [
    `[b]Qualit\u00e9 :[/b] ${quality}`,
    `[b]Format :[/b] ${format}`,
    `[b]Codec Vid\u00e9o :[/b] ${videoCodec}`,
    `[b]Codec Audio :[/b] ${audioCodec}`,
    `[b]Langues :[/b] ${languages}`,
    `[b]Sous-titres :[/b] ${subtitles}`,
    `[b]Taille :[/b] ${size}`,
  ].join('\n')
}
