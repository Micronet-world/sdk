import type { Component } from 'vue'
import { h, defineComponent } from 'vue'
import type { AppManifest, AppInstance, MnAppBundle, AppDefinition, AppStoreEntry, LoaderConfig } from './types'
import type { ScreenId, NavIntent } from '@micronet/kernel'
import { getKernel } from './kernel'
import * as store from './store'

const loadedApps = new Map<string, AppInstance>()
const appComponents = new Map<string, Component>()
const appBundles = new Map<string, MnAppBundle>()
let loaderConfig: LoaderConfig = {}

export function configureLoader(config: LoaderConfig): void {
  loaderConfig = { ...loaderConfig, ...config }
}

function createAppComponent(appDef: { manifest: AppManifest; component: Component }): Component {
  const { manifest, component } = appDef
  return defineComponent({
    name: `App_${manifest.id}`,
    setup() {
      return () => h(component)
    },
  })
}

function validateManifestStrict(manifest: AppManifest): string[] {
  const errors: string[] = []
  if (!manifest.id) errors.push('missing required field: id')
  if (!manifest.name) errors.push('missing required field: name')
  if (!manifest.version) errors.push('missing required field: version')
  if (loadedApps.has(manifest.id)) errors.push(`app already loaded: ${manifest.id}`)

  if (loaderConfig.maxApps && loadedApps.size >= loaderConfig.maxApps) {
    errors.push(`maximum number of apps reached (${loaderConfig.maxApps})`)
  }

  return errors
}

function parseEvents(events: Record<string, string> | undefined): Record<string, NavIntent> {
  if (!events) return {}
  const result: Record<string, NavIntent> = {}
  for (const [key, value] of Object.entries(events)) {
    if (value === 'back') result[key] = { type: 'back' }
    else if (value === 'home') result[key] = { type: 'home' }
    else if (value === 'lock') result[key] = { type: 'lock' }
    else if (value.startsWith('push:')) result[key] = { type: 'push', screen: value.slice(5) as ScreenId }
    else if (value.startsWith('navigate:')) result[key] = { type: 'navigate', screen: value.slice(9) as ScreenId }
  }
  return result
}

export async function loadApp(manifest: AppManifest, component: Component): Promise<AppInstance> {
  const hooks = loaderConfig.hooks

  if (hooks?.beforeLoad) {
    const allowed = await hooks.beforeLoad(manifest)
    if (!allowed) throw new Error(`Load denied by hook: ${manifest.id}`)
  }

  const errors = validateManifestStrict(manifest)
  if (errors.length > 0) throw new Error(`Invalid app manifest:\n${errors.join('\n')}`)

  if (manifest.dependencies && manifest.dependencies.length > 0) {
    for (const dep of manifest.dependencies) {
      if (!loadedApps.has(dep)) {
        throw new Error(`Missing dependency: ${dep}`)
      }
    }
  }

  const appComponent = createAppComponent({ manifest, component })
  const navIntents = parseEvents(manifest.events)

  getKernel().registerScreen(
    { id: manifest.id as ScreenId, label: manifest.name, color: manifest.color, icon: manifest.icon },
    navIntents,
  )

  const instance: AppInstance = {
    manifest,
    component: appComponent,
    loadedAt: Date.now(),
    enabled: true,
  }

  loadedApps.set(manifest.id, instance)
  appComponents.set(manifest.id, appComponent)

  try {
    await store.registerApp(manifest, 'local')
    await store.setAppState(manifest.id, 'loaded')
  } catch { /* store update is best-effort */ }

  if (hooks?.afterLoad) {
    await hooks.afterLoad(instance)
  }

  return instance
}

export function loadAppFromString(bundleCode: string): AppInstance {
  const module = { exports: {} as Record<string, unknown> }
  const resolver = loaderConfig.requireResolver || (() => ({}))
  new Function('module', 'exports', 'require', bundleCode)(module, module.exports, resolver)

  const result = module.exports as { default?: AppDefinition; manifest?: AppManifest; component?: Component }
  const appDef = result.default || result
  if (!appDef?.manifest || !appDef?.component) {
    throw new Error('Invalid .mnapp bundle: must export { manifest, component }')
  }

  const instance = loadAppSync(appDef.manifest, appDef.component)
  return instance
}

function loadAppSync(manifest: AppManifest, component: Component): AppInstance {
  const errors = validateManifestStrict(manifest)
  if (errors.length > 0) throw new Error(`Invalid app manifest:\n${errors.join('\n')}`)

  const appComponent = createAppComponent({ manifest, component })
  const navIntents = parseEvents(manifest.events)

  getKernel().registerScreen(
    { id: manifest.id as ScreenId, label: manifest.name, color: manifest.color, icon: manifest.icon },
    navIntents,
  )

  const instance: AppInstance = {
    manifest,
    component: appComponent,
    loadedAt: Date.now(),
    enabled: true,
  }

  loadedApps.set(manifest.id, instance)
  appComponents.set(manifest.id, appComponent)

  return instance
}

export async function loadAppFromUrl(url: string): Promise<AppInstance> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch app: ${response.statusText}`)

  const bundle: MnAppBundle = await response.json()
  if (!bundle.manifest || !bundle.code) {
    throw new Error('Invalid .mnapp bundle: missing manifest or code')
  }

  appBundles.set(bundle.manifest.id, bundle)
  return loadAppFromString(bundle.code)
}

export function loadAppFromBundle(bundle: MnAppBundle): AppInstance {
  appBundles.set(bundle.manifest.id, bundle)
  injectBundleAssets(bundle)
  return loadAppFromString(bundle.code)
}

function injectBundleAssets(bundle: MnAppBundle): void {
  if (!bundle.assets) return
  for (const [key, value] of Object.entries(bundle.assets)) {
    if (key.endsWith('.css') && typeof document !== 'undefined') {
      const existing = document.querySelector(`style[data-app="${bundle.manifest.id}"]`)
      if (existing) continue
      const style = document.createElement('style')
      style.setAttribute('data-app', bundle.manifest.id)
      style.textContent = value
      document.head.appendChild(style)
    }
  }
}

export async function loadAppFromStore(entry: AppStoreEntry): Promise<AppInstance | null> {
  if (entry.state === 'disabled') return null

  const bundle = appBundles.get(entry.id)
  if (bundle) return loadAppFromBundle(bundle)

  if (entry.sourceUrl) {
    try {
      return await loadAppFromUrl(entry.sourceUrl)
    } catch (err) {
      const hooks = loaderConfig.hooks
      if (hooks?.onError) hooks.onError(entry.id, err instanceof Error ? err : new Error(String(err)))
      await store.setAppState(entry.id, 'error')
      return null
    }
  }

  return null
}

export async function loadEnabledApps(): Promise<AppInstance[]> {
  const entries = await store.getEnabledEntries()
  const instances: AppInstance[] = []
  for (const entry of entries) {
    const instance = await loadAppFromStore(entry)
    if (instance) instances.push(instance)
  }
  return instances
}

export async function unloadApp(id: string): Promise<boolean> {
  const hooks = loaderConfig.hooks

  if (hooks?.beforeUnload) {
    const allowed = await hooks.beforeUnload(id)
    if (!allowed) return false
  }

  if (!loadedApps.has(id)) return false
  loadedApps.delete(id)
  appComponents.delete(id)
  appBundles.delete(id)

  try {
    await store.setAppState(id, 'registered')
  } catch { /* best-effort */ }

  if (hooks?.afterUnload) {
    await hooks.afterUnload(id)
  }

  return true
}

export async function enableApp(id: string): Promise<void> {
  const instance = loadedApps.get(id)
  if (instance) {
    instance.enabled = true
    await store.enableApp(id)
  }
}

export async function disableApp(id: string): Promise<void> {
  const instance = loadedApps.get(id)
  if (instance) {
    instance.enabled = false
    await store.disableApp(id)
  }
}

export function getApp(id: string): AppInstance | undefined {
  return loadedApps.get(id)
}

export function getLoadedApps(): AppInstance[] {
  return [...loadedApps.values()]
}

export function getEnabledApps(): AppInstance[] {
  return [...loadedApps.values()].filter(a => a.enabled)
}

export function getAppComponent(id: string): Component | undefined {
  return appComponents.get(id)
}

export function getAllAppComponents(): Record<string, Component> {
  return Object.fromEntries(appComponents)
}

export function getAppBundle(id: string): MnAppBundle | undefined {
  return appBundles.get(id)
}

export function isAppLoaded(id: string): boolean {
  return loadedApps.has(id)
}

export function isAppEnabled(id: string): boolean {
  return loadedApps.get(id)?.enabled ?? false
}

export function getLoaderConfig(): LoaderConfig {
  return { ...loaderConfig }
}

export async function unloadAllApps(): Promise<void> {
  const ids = [...loadedApps.keys()]
  for (const id of ids) await unloadApp(id)
}

export function registerAppInstance(manifest: AppManifest, component: Component): AppInstance {
  return loadAppSync(manifest, component)
}

export function clearLoadedApps(): void {
  loadedApps.clear()
  appComponents.clear()
  appBundles.clear()
}
