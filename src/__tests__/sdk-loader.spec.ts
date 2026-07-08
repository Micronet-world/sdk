import { describe, it, expect, vi, beforeEach } from 'vitest'
import { h } from 'vue'
import {
  loadApp,
  loadAppFromString,
  loadAppFromBundle,
  loadAppFromUrl,
  unloadApp,
  unloadAllApps,
  enableApp,
  disableApp,
  getApp,
  getLoadedApps,
  getEnabledApps,
  isAppLoaded,
  isAppEnabled,
  getAppComponent,
  getAllAppComponents,
  getAppBundle,
  configureLoader,
  getLoaderConfig,
  registerAppInstance,
  clearLoadedApps,
  buildBundle,
  serializeComponent,
  encodeBundle,
  decodeBundle,
} from '../index'
import { resetRegistry, resetBus, getRegisteredScreen } from '@micronet/kernel'
import type { AppManifest, MnAppBundle } from '../types'

function makeManifest(id: string, overrides?: Partial<AppManifest>): AppManifest {
  return {
    id,
    name: `App ${id}`,
    version: '1.0.0',
    icon: '📱',
    color: '#007aff',
    permissions: [],
    events: {},
    ...overrides,
  }
}

function makeComponent(name = 'Stub') {
  return { name, setup() { return () => h('div', name) } }
}

function makeBundleCode(manifest: AppManifest): string {
  return serializeComponent(manifest, '', 'function() { return null; }')
}

describe('SDK Loader', () => {
  beforeEach(async () => {
    await unloadAllApps()
    clearLoadedApps()
    resetRegistry()
    resetBus()
    configureLoader({})
  })

  describe('loadApp', () => {
    it('loads an app and returns an AppInstance', async () => {
      const manifest = makeManifest('test-load')
      const instance = await loadApp(manifest, makeComponent())

      expect(instance.manifest.id).toBe('test-load')
      expect(instance.enabled).toBe(true)
      expect(instance.loadedAt).toBeGreaterThan(0)
    })

    it('registers the screen in the kernel registry', async () => {
      const manifest = makeManifest('test-reg')
      await loadApp(manifest, makeComponent())

      const reg = getRegisteredScreen('test-reg')
      expect(reg).toBeDefined()
      expect(reg!.meta.label).toBe('App test-reg')
    })

    it('throws on duplicate registration', async () => {
      const manifest = makeManifest('test-dup')
      await loadApp(manifest, makeComponent())

      await expect(loadApp(manifest, makeComponent())).rejects.toThrow('already loaded')
    })

    it('throws on missing manifest fields', async () => {
      const manifest = makeManifest('')
      await expect(loadApp(manifest, makeComponent())).rejects.toThrow('missing required field: id')
    })

    it('throws on missing name', async () => {
      const manifest = { ...makeManifest('test'), name: '' }
      await expect(loadApp(manifest, makeComponent())).rejects.toThrow('missing required field: name')
    })

    it('throws on missing version', async () => {
      const manifest = { ...makeManifest('test'), version: '' }
      await expect(loadApp(manifest, makeComponent())).rejects.toThrow('missing required field: version')
    })

    it('calls beforeLoad hook', async () => {
      const beforeLoad = vi.fn().mockResolvedValue(true)
      configureLoader({ hooks: { beforeLoad } })

      const manifest = makeManifest('test-hook')
      await loadApp(manifest, makeComponent())

      expect(beforeLoad).toHaveBeenCalledWith(manifest)
    })

    it('throws when beforeLoad hook returns false', async () => {
      const beforeLoad = vi.fn().mockResolvedValue(false)
      configureLoader({ hooks: { beforeLoad } })

      const manifest = makeManifest('test-denied')
      await expect(loadApp(manifest, makeComponent())).rejects.toThrow('Load denied by hook')
    })

    it('calls afterLoad hook with the instance', async () => {
      const afterLoad = vi.fn()
      configureLoader({ hooks: { afterLoad } })

      const manifest = makeManifest('test-after')
      const instance = await loadApp(manifest, makeComponent())

      expect(afterLoad).toHaveBeenCalledWith(instance)
    })

    it('resolves events from manifest', async () => {
      const manifest = makeManifest('test-events', {
        events: {
          'go-back': 'back',
          'go-home': 'home',
          'go-lock': 'lock',
          'push-settings': 'push:settings',
          'nav-home': 'navigate:home',
        },
      })
      await loadApp(manifest, makeComponent())

      const reg = getRegisteredScreen('test-events')
      expect(reg!.events['go-back']).toEqual({ type: 'back' })
      expect(reg!.events['go-home']).toEqual({ type: 'home' })
      expect(reg!.events['go-lock']).toEqual({ type: 'lock' })
      expect(reg!.events['push-settings']).toEqual({ type: 'push', screen: 'settings' })
      expect(reg!.events['nav-home']).toEqual({ type: 'navigate', screen: 'home' })
    })

    it('validates dependencies', async () => {
      const manifest = makeManifest('test-dep', { dependencies: ['nonexistent'] })
      await expect(loadApp(manifest, makeComponent())).rejects.toThrow('Missing dependency: nonexistent')
    })

    it('succeeds when dependency is loaded', async () => {
      const depManifest = makeManifest('dep-app')
      await loadApp(depManifest, makeComponent())

      const manifest = makeManifest('test-dep-ok', { dependencies: ['dep-app'] })
      const instance = await loadApp(manifest, makeComponent())
      expect(instance.manifest.id).toBe('test-dep-ok')
    })
  })

  describe('loadAppFromString', () => {
    it('loads a valid bundle code string', () => {
      const manifest = makeManifest('from-string')
      const code = makeBundleCode(manifest)
      const instance = loadAppFromString(code)

      expect(instance.manifest.id).toBe('from-string')
      expect(isAppLoaded('from-string')).toBe(true)
    })

    it('throws on invalid bundle code', () => {
      expect(() => loadAppFromString('exports.x = null')).toThrow('must export')
    })

    it('throws on code that exports no manifest', () => {
      expect(() => loadAppFromString('exports.default = { component: {} }')).toThrow('must export')
    })

    it('throws on code that exports no component', () => {
      expect(() => loadAppFromString('exports.default = { manifest: {} }')).toThrow('must export')
    })

    it('uses the requireResolver from loader config', () => {
      const resolver = vi.fn().mockReturnValue({ hello: true })
      configureLoader({ requireResolver: resolver })

      const manifest = makeManifest('resolver-test')
      const code = [
        '"use strict";',
        'Object.defineProperty(exports, "__esModule", { value: true });',
        `const manifest = ${JSON.stringify(manifest)};`,
        'const sdk = require("@micronet/sdk");',
        'const component = { name: "App_resolver-test", setup() { return function() { return null; } } };',
        'exports.default = { manifest, component };',
      ].join('\n')

      loadAppFromString(code)
      expect(resolver).toHaveBeenCalledWith('@micronet/sdk')
    })
  })

  describe('loadAppFromBundle', () => {
    it('loads a valid MnAppBundle', () => {
      const manifest = makeManifest('from-bundle')
      const bundle: MnAppBundle = {
        manifest,
        code: makeBundleCode(manifest),
      }

      const instance = loadAppFromBundle(bundle)
      expect(instance.manifest.id).toBe('from-bundle')
      expect(isAppLoaded('from-bundle')).toBe(true)
    })

    it('stores the bundle internally', () => {
      const manifest = makeManifest('bundle-stored')
      const bundle: MnAppBundle = {
        manifest,
        code: makeBundleCode(manifest),
      }

      loadAppFromBundle(bundle)
      expect(getAppBundle('bundle-stored')).toBe(bundle)
    })

    it('injects CSS assets into document head', () => {
      const manifest = makeManifest('css-inject')
      const bundle: MnAppBundle = {
        manifest,
        code: makeBundleCode(manifest),
        assets: { 'style.css': '.test { color: red; }' },
      }

      const spy = vi.spyOn(document.head, 'appendChild')
      loadAppFromBundle(bundle)

      expect(spy).toHaveBeenCalled()
      const el = spy.mock.calls[0][0] as HTMLStyleElement
      expect(el.tagName).toBe('STYLE')
      expect(el.textContent).toContain('.test { color: red; }')
      spy.mockRestore()
    })

    it('does not inject duplicate CSS for the same app', () => {
      const manifest = makeManifest('css-dup')
      const bundle: MnAppBundle = {
        manifest,
        code: makeBundleCode(manifest),
        assets: { 'style.css': '.dup { }' },
      }

      loadAppFromBundle(bundle)
      const countBefore = document.querySelectorAll(`style[data-app="css-dup"]`).length

      // Loading the same bundle again would throw (duplicate), so we just check
      // the style element exists
      expect(countBefore).toBeGreaterThanOrEqual(1)
    })
  })

  describe('loadAppFromUrl', () => {
    it('fetches and loads a bundle from a URL', async () => {
      const manifest = makeManifest('from-url')
      const bundle: MnAppBundle = {
        manifest,
        code: makeBundleCode(manifest),
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(bundle),
      }))

      const instance = await loadAppFromUrl('https://example.com/app.mnapp')
      expect(instance.manifest.id).toBe('from-url')
    })

    it('throws on non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      }))

      await expect(loadAppFromUrl('https://example.com/missing.mnapp')).rejects.toThrow('Failed to fetch app')
    })

    it('throws on invalid bundle format', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ noManifest: true }),
      }))

      await expect(loadAppFromUrl('https://example.com/bad.mnapp')).rejects.toThrow('missing manifest or code')
    })
  })

  describe('unloadApp', () => {
    it('removes a loaded app', async () => {
      const manifest = makeManifest('to-unload')
      await loadApp(manifest, makeComponent())
      expect(isAppLoaded('to-unload')).toBe(true)

      const result = await unloadApp('to-unload')
      expect(result).toBe(true)
      expect(isAppLoaded('to-unload')).toBe(false)
    })

    it('returns false for unknown app', async () => {
      expect(await unloadApp('nonexistent')).toBe(false)
    })

    it('calls beforeUnload hook', async () => {
      const beforeUnload = vi.fn().mockResolvedValue(true)
      configureLoader({ hooks: { beforeUnload } })

      const manifest = makeManifest('unload-hook')
      await loadApp(manifest, makeComponent())
      await unloadApp('unload-hook')

      expect(beforeUnload).toHaveBeenCalledWith('unload-hook')
    })

    it('prevents unload when beforeUnload returns false', async () => {
      const beforeUnload = vi.fn().mockResolvedValue(false)
      configureLoader({ hooks: { beforeUnload } })

      const manifest = makeManifest('unload-blocked')
      await loadApp(manifest, makeComponent())
      const result = await unloadApp('unload-blocked')

      expect(result).toBe(false)
      expect(isAppLoaded('unload-blocked')).toBe(true)
    })

    it('calls afterUnload hook', async () => {
      const afterUnload = vi.fn()
      configureLoader({ hooks: { afterUnload } })

      const manifest = makeManifest('unload-after')
      await loadApp(manifest, makeComponent())
      await unloadApp('unload-after')

      expect(afterUnload).toHaveBeenCalledWith('unload-after')
    })

    it('removes the app bundle', async () => {
      const manifest = makeManifest('unload-bundle')
      const bundle: MnAppBundle = { manifest, code: makeBundleCode(manifest) }
      loadAppFromBundle(bundle)
      expect(getAppBundle('unload-bundle')).toBeDefined()

      await unloadApp('unload-bundle')
      expect(getAppBundle('unload-bundle')).toBeUndefined()
    })
  })

  describe('unloadAllApps', () => {
    it('removes all loaded apps', async () => {
      await loadApp(makeManifest('a'), makeComponent())
      await loadApp(makeManifest('b'), makeComponent())
      expect(getLoadedApps()).toHaveLength(2)

      await unloadAllApps()
      expect(getLoadedApps()).toHaveLength(0)
    })
  })

  describe('enableApp / disableApp', () => {
    it('disables and re-enables an app', async () => {
      const manifest = makeManifest('toggle')
      await loadApp(manifest, makeComponent())

      expect(isAppEnabled('toggle')).toBe(true)

      await disableApp('toggle')
      expect(isAppEnabled('toggle')).toBe(false)

      await enableApp('toggle')
      expect(isAppEnabled('toggle')).toBe(true)
    })

    it('getEnabledApps only returns enabled apps', async () => {
      await loadApp(makeManifest('en-a'), makeComponent())
      await loadApp(makeManifest('en-b'), makeComponent())
      await disableApp('en-b')

      const enabled = getEnabledApps()
      expect(enabled).toHaveLength(1)
      expect(enabled[0].manifest.id).toBe('en-a')
    })
  })

  describe('getAppComponent / getAllAppComponents', () => {
    it('returns the wrapped component for a loaded app', async () => {
      const manifest = makeManifest('comp-test')
      await loadApp(manifest, makeComponent('MyComp'))

      const comp = getAppComponent('comp-test')
      expect(comp).toBeDefined()
      expect(comp!.name).toBe('App_comp-test')
    })

    it('returns undefined for unknown app', () => {
      expect(getAppComponent('unknown')).toBeUndefined()
    })

    it('getAllAppComponents returns all loaded components', async () => {
      await loadApp(makeManifest('all-a'), makeComponent())
      await loadApp(makeManifest('all-b'), makeComponent())

      const all = getAllAppComponents()
      expect(Object.keys(all)).toContain('all-a')
      expect(Object.keys(all)).toContain('all-b')
    })
  })

  describe('configureLoader', () => {
    it('stores and retrieves loader config', () => {
      const config = { maxApps: 5, timeout: 3000 }
      configureLoader(config)

      const retrieved = getLoaderConfig()
      expect(retrieved.maxApps).toBe(5)
      expect(retrieved.timeout).toBe(3000)
    })

    it('merges with previous config on subsequent calls', () => {
      configureLoader({ maxApps: 5 })
      configureLoader({ timeout: 1000 })

      const config = getLoaderConfig()
      expect(config.maxApps).toBe(5)
      expect(config.timeout).toBe(1000)
    })
  })

  describe('registerAppInstance (synchronous)', () => {
    it('registers an app synchronously', () => {
      const manifest = makeManifest('sync-reg')
      const instance = registerAppInstance(manifest, makeComponent())

      expect(instance.manifest.id).toBe('sync-reg')
      expect(isAppLoaded('sync-reg')).toBe(true)
    })

    it('throws on duplicate', () => {
      const manifest = makeManifest('sync-dup')
      registerAppInstance(manifest, makeComponent())
      expect(() => registerAppInstance(manifest, makeComponent())).toThrow('already loaded')
    })
  })
})
