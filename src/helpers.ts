import type { Component, Plugin } from 'vue'
import { ref } from 'vue'
import type { AppManifest, AppDefinition, AppStorage, AppEvents, AppI18n, AppPermission } from './types'
import { storage } from 'micronet-kernel'

export function defineManifest(config: AppManifest): AppManifest {
  return {
    ...config,
    id: config.id,
    name: config.name,
    version: config.version,
    icon: config.icon || '📱',
    color: config.color || '#007aff',
    permissions: config.permissions || [],
    events: config.events || {},
  }
}

export function defineApp(manifest: AppManifest, component: Component): AppDefinition {
  return { manifest, component }
}

export function useAppStorage(appId: string): AppStorage {
  const prefix = `app:${appId}:`

  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await storage.get(prefix + key)
      if (raw === null) return null
      try { return JSON.parse(raw) as T } catch { return raw as unknown as T }
    },
    async set<T>(key: string, value: T): Promise<void> {
      await storage.set(prefix + key, JSON.stringify(value))
    },
    async del(key: string): Promise<void> {
      await storage.del(prefix + key)
    },
    async keys(): Promise<string[]> {
      return []
    },
  }
}

export function useAppEvents(appId: string): AppEvents {
  const handlers = new Map<string, Set<(data: unknown) => void>>()

  return {
    emit(event: string, data?: unknown) {
      const key = `app:${appId}:${event}`
      const globalBus = (globalThis as Record<string, unknown>).__micronet_events as
        Map<string, Set<(data: unknown) => void>> | undefined
      if (globalBus) {
        const set = globalBus.get(key)
        if (set) for (const h of set) h(data)
      }
    },
    on(event: string, handler: (data: unknown) => void) {
      const key = `app:${appId}:${event}`
      let set = handlers.get(key)
      if (!set) { set = new Set(); handlers.set(key, set) }
      set.add(handler)

      const globalBus = (globalThis as Record<string, unknown>).__micronet_events as
        Map<string, Set<(data: unknown) => void>> | undefined
      if (globalBus) {
        let gset = globalBus.get(key)
        if (!gset) { gset = new Set(); globalBus.set(key, gset) }
        gset.add(handler)
      }

      return () => { this.off(event, handler) }
    },
    off(event: string, handler: (data: unknown) => void) {
      const key = `app:${appId}:${event}`
      const set = handlers.get(key)
      if (set) set.delete(handler)
      const globalBus = (globalThis as Record<string, unknown>).__micronet_events as
        Map<string, Set<(data: unknown) => void>> | undefined
      if (globalBus) {
        const gset = globalBus.get(key)
        if (gset) gset.delete(handler)
      }
    },
  }
}

export function useAppI18n(_appId: string, messages: Record<string, Record<string, string>>): AppI18n {
  const locale = ref((globalThis as Record<string, unknown>).__micronet_locale as string || 'en')

  return {
    t(key: string, params?: Record<string, unknown>): string {
      const lang = locale.value
      const dict = messages[lang] || messages['en'] || {}
      let text = dict[key] || key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return text
    },
    locale: locale.value,
  }
}

export function hasPermission(manifest: AppManifest, permission: AppPermission): boolean {
  if (!manifest.permissions || manifest.permissions.length === 0) return true
  return manifest.permissions.includes(permission)
}

export const SDK_VERSION = '1.0.0'

export function createMicronetPlugin(): Plugin {
  return {
    install() {
      (globalThis as Record<string, unknown>).__micronet_events =
        (globalThis as Record<string, unknown>).__micronet_events ||
        new Map<string, Set<(data: unknown) => void>>()
    },
  }
}
