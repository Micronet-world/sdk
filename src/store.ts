import type { AppId, AppManifest, AppStoreEntry, AppStoreConfig, AppState } from './types'
import { storage } from 'micronet-kernel'
import { validateManifest } from './utils'

const STORE_KEY = 'micronet-app-store'
const CONFIG_KEY = 'micronet-app-store-config'

let entries = new Map<AppId, AppStoreEntry>()
let config: AppStoreConfig = {}
let initialized = false

async function loadStore(): Promise<void> {
  if (initialized) return
  const raw = await storage.get(STORE_KEY)
  if (raw) {
    try {
      const arr: AppStoreEntry[] = JSON.parse(raw)
      entries = new Map(arr.map(e => [e.id, e]))
    } catch { /* corrupted store, start fresh */ }
  }
  const rawConfig = await storage.get(CONFIG_KEY)
  if (rawConfig) {
    try { config = JSON.parse(rawConfig) } catch { /* ignore */ }
  }
  initialized = true
}

async function saveStore(): Promise<void> {
  await storage.set(STORE_KEY, JSON.stringify([...entries.values()]))
}

export async function initStore(storeConfig?: AppStoreConfig): Promise<void> {
  if (storeConfig) config = { ...config, ...storeConfig }
  await storage.set(CONFIG_KEY, JSON.stringify(config))
  await loadStore()
}

export async function registerApp(
  manifest: AppManifest,
  source: AppStoreEntry['source'] = 'local',
  sourceUrl?: string,
): Promise<AppStoreEntry> {
  await loadStore()

  const validation = validateManifest(manifest)
  if (!validation.valid) {
    throw new Error(`Invalid manifest:\n${validation.errors.join('\n')}`)
  }

  if (config.allowedPermissions && manifest.permissions) {
    const denied = manifest.permissions.filter(p => !config.allowedPermissions!.includes(p))
    if (denied.length > 0) {
      throw new Error(`Permissions not allowed: ${denied.join(', ')}`)
    }
  }

  const existing = entries.get(manifest.id)
  const now = Date.now()

  const entry: AppStoreEntry = {
    id: manifest.id,
    manifest,
    state: existing ? existing.state : 'registered',
    installedAt: existing?.installedAt || now,
    updatedAt: now,
    config: existing?.config || {},
    source,
    sourceUrl,
  }

  entries.set(manifest.id, entry)
  await saveStore()
  return entry
}

export async function unregisterApp(id: AppId): Promise<boolean> {
  await loadStore()
  const existed = entries.has(id)
  entries.delete(id)
  if (existed) await saveStore()
  return existed
}

export async function setAppState(id: AppId, state: AppState): Promise<void> {
  await loadStore()
  const entry = entries.get(id)
  if (!entry) throw new Error(`App not found: ${id}`)
  entry.state = state
  entry.updatedAt = Date.now()
  await saveStore()
}

export async function setAppConfig(id: AppId, config: Record<string, unknown>): Promise<void> {
  await loadStore()
  const entry = entries.get(id)
  if (!entry) throw new Error(`App not found: ${id}`)
  entry.config = { ...entry.config, ...config }
  entry.updatedAt = Date.now()
  await saveStore()
}

export async function getAppEntry(id: AppId): Promise<AppStoreEntry | undefined> {
  await loadStore()
  return entries.get(id)
}

export async function getAllEntries(): Promise<AppStoreEntry[]> {
  await loadStore()
  return [...entries.values()]
}

export async function getEntriesByState(state: AppState): Promise<AppStoreEntry[]> {
  await loadStore()
  return [...entries.values()].filter(e => e.state === state)
}

export async function getEnabledEntries(): Promise<AppStoreEntry[]> {
  return getEntriesByState('enabled')
}

export async function enableApp(id: AppId): Promise<void> {
  await setAppState(id, 'enabled')
}

export async function disableApp(id: AppId): Promise<void> {
  await setAppState(id, 'disabled')
}

export async function getStoreConfig(): Promise<AppStoreConfig> {
  await loadStore()
  return { ...config }
}

export async function updateStoreConfig(patch: Partial<AppStoreConfig>): Promise<void> {
  await loadStore()
  config = { ...config, ...patch }
  await storage.set(CONFIG_KEY, JSON.stringify(config))
}

export async function clearStore(): Promise<void> {
  entries.clear()
  config = {}
  initialized = false
  await storage.del(STORE_KEY)
  await storage.del(CONFIG_KEY)
}

export async function importBundle(bundleJson: string): Promise<AppStoreEntry> {
  const bundle = JSON.parse(bundleJson)
  if (!bundle.manifest) throw new Error('Invalid bundle: missing manifest')
  return registerApp(bundle.manifest, 'local')
}

export async function exportStore(): Promise<string> {
  await loadStore()
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: [...entries.values()],
    config,
  }, null, 2)
}

export async function importStore(data: string): Promise<number> {
  const parsed = JSON.parse(data)
  if (!parsed.entries || !Array.isArray(parsed.entries)) {
    throw new Error('Invalid store export: missing entries array')
  }
  await loadStore()
  let count = 0
  for (const entry of parsed.entries) {
    if (entry.id && entry.manifest) {
      entries.set(entry.id, entry)
      count++
    }
  }
  await saveStore()
  return count
}
