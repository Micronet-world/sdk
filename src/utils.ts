import type { AppManifest, ValidateResult, AppPermission } from './types'

const ID_REGEX = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/
const VALID_PERMISSIONS: AppPermission[] = ['camera', 'bluetooth', 'photos', 'calendar', 'location', 'storage', 'network']

export function validateId(id: string): string[] {
  const errors: string[] = []
  if (!id) errors.push('id is required')
  else if (!ID_REGEX.test(id)) errors.push(`id must be lowercase alphanumeric with hyphens, 3-64 chars (got: "${id}")`)
  return errors
}

export function validateSemver(version: string): string[] {
  const errors: string[] = []
  if (!version) errors.push('version is required')
  else if (!SEMVER_REGEX.test(version)) errors.push(`version must be semver format (got: "${version}")`)
  return errors
}

export function validateManifest(manifest: AppManifest): ValidateResult {
  const errors: string[] = []
  const warnings: string[] = []

  errors.push(...validateId(manifest.id))
  if (!manifest.name) errors.push('name is required')
  else if (manifest.name.length > 64) errors.push('name must be 64 chars or fewer')
  errors.push(...validateSemver(manifest.version))
  if (!manifest.icon) errors.push('icon is required')
  if (!manifest.color) errors.push('color is required')
  else if (!/^#[0-9a-fA-F]{3,8}$/.test(manifest.color)) errors.push(`color must be a hex color (got: "${manifest.color}")`)

  if (manifest.permissions) {
    for (const p of manifest.permissions) {
      if (!VALID_PERMISSIONS.includes(p)) errors.push(`unknown permission: "${p}"`)
    }
  }

  if (manifest.events) {
    for (const [key, value] of Object.entries(manifest.events)) {
      if (!key) errors.push('event name cannot be empty')
      const validActions = ['back', 'home', 'lock']
      const isDirect = validActions.includes(value)
      const isPush = value.startsWith('push:')
      const isNavigate = value.startsWith('navigate:')
      if (!isDirect && !isPush && !isNavigate) {
        errors.push(`event "${key}": invalid action "${value}" (use back/home/lock/push:id/navigate:id)`)
      }
    }
  }

  if (manifest.dependencies) {
    for (const dep of manifest.dependencies) {
      if (!dep) errors.push('dependency id cannot be empty')
    }
  }

  if (!manifest.description) warnings.push('description is recommended')
  if (!manifest.author) warnings.push('author is recommended')

  return { valid: errors.length === 0, errors, warnings }
}

export async function hashBytes(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

export function joinPath(...parts: string[]): string {
  return parts.map(p => p.replace(/^\/|\/$/g, '')).filter(Boolean).join('/')
}

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(dot) : ''
}

export function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

export function base64Encode(data: Uint8Array): string {
  let binary = ''
  for (const byte of data) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64Decode(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export class AppError extends Error {
  appId: string
  code: string

  constructor(appId: string, message: string, code: string = 'APP_ERROR') {
    super(`[${appId}] ${message}`)
    this.name = 'AppError'
    this.appId = appId
    this.code = code
  }
}
