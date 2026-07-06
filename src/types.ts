import type { Component } from 'vue'

export type AppId = string

export interface AppManifest {
  id: AppId
  name: string
  version: string
  icon: string
  color: string
  description?: string
  author?: string
  license?: string
  homepage?: string
  permissions?: AppPermission[]
  events?: Record<string, string>
  i18n?: Record<string, Record<string, string>>
  dependencies?: string[]
  minPlatformVersion?: string
}

export type AppPermission = 'camera' | 'bluetooth' | 'photos' | 'calendar' | 'location' | 'storage' | 'network'

export interface AppDefinition {
  manifest: AppManifest
  component: Component
}

export interface AppInstance {
  manifest: AppManifest
  component: Component
  loadedAt: number
  enabled: boolean
  error?: string
}

export interface AppStorage {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  del(key: string): Promise<void>
  keys(): Promise<string[]>
}

export interface AppEvents {
  emit(event: string, data?: unknown): void
  on(event: string, handler: (data: unknown) => void): () => void
  off(event: string, handler: (data: unknown) => void): void
}

export interface AppI18n {
  t(key: string, params?: Record<string, unknown>): string
  locale: string
}

export interface MnAppBundle {
  manifest: AppManifest
  code: string
  i18n?: Record<string, Record<string, string>>
  assets?: Record<string, string>
}

export interface LoadAppOptions {
  url: string
  permissions?: AppPermission[]
}

export interface BuildAppOptions {
  manifest: AppManifest
  sourceDir: string
  outPath: string
  minify?: boolean
  externals?: string[]
}

export type AppState = 'registered' | 'loading' | 'loaded' | 'enabled' | 'disabled' | 'error'

export interface AppStoreEntry {
  id: AppId
  manifest: AppManifest
  state: AppState
  installedAt: number
  updatedAt: number
  config: Record<string, unknown>
  source: 'local' | 'url' | 'registry'
  sourceUrl?: string
  bundleHash?: string
}

export interface AppStoreConfig {
  registryUrl?: string
  autoUpdate?: boolean
  maxApps?: number
  allowedPermissions?: AppPermission[]
}

export interface LoaderHooks {
  beforeLoad?: (manifest: AppManifest) => boolean | Promise<boolean>
  afterLoad?: (instance: AppInstance) => void | Promise<void>
  beforeUnload?: (id: AppId) => boolean | Promise<boolean>
  afterUnload?: (id: AppId) => void | Promise<void>
  onError?: (id: AppId, error: Error) => void
}

export interface LoaderConfig {
  hooks?: LoaderHooks
  sandbox?: boolean
  timeout?: number
  maxApps?: number
}

export interface CompileOptions {
  source: string
  filename?: string
  minify?: boolean
  externals?: string[]
}

export interface CompileResult {
  code: string
  errors: string[]
  warnings: string[]
}

export interface BundleOptions {
  manifest: AppManifest
  sourceFiles: Record<string, string>
  i18n?: Record<string, Record<string, string>>
  assets?: Record<string, string | Uint8Array>
  minify?: boolean
}

export interface BundleResult {
  bundle: MnAppBundle
  bytes: Uint8Array
  size: number
  hash: string
}

export interface ValidateResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface CliCommand {
  name: string
  description: string
  args: string[]
  options: Record<string, string>
  run: (args: string[], options: Record<string, string>) => Promise<void>
}
