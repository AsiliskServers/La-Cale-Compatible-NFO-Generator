const acceptedExtensions = [
  'mkv',
  'mp4',
  'avi',
  'mov',
  'm4v',
  'wmv',
  'flv',
  'webm',
  'mpeg',
  'mpg',
  'ts',
  'm2ts',
] as const

const acceptedExtensionSet = new Set<string>(acceptedExtensions)

export const ACCEPTED_EXTENSIONS = acceptedExtensions
export const ACCEPTED_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(',')

export const getFileExtension = (fileName: string): string => {
  const parts = fileName.split('.')
  if (parts.length < 2) {
    return ''
  }

  return parts.at(-1)?.toLowerCase() ?? ''
}

export const isLikelyVideoFileName = (fileName: string): boolean =>
  acceptedExtensionSet.has(getFileExtension(fileName))

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  const rounded = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)

  return `${rounded} ${units[exponent]}`
}

export const buildNfoFilename = (fileName: string): string => {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  return `${withoutExtension || fileName}.nfo`
}
