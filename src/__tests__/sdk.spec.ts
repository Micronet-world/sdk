import { describe, it, expect, beforeEach } from 'vitest'
import { h } from 'vue'
import {
  defineManifest,
  defineApp,
  buildBundle,
  bundleToString,
  serializeComponent,
  encodeBundle,
  decodeBundle,
  registerAppInstance,
  loadAppFromString,
  getApp,
  getLoadedApps,
  getAppComponent,
  getAllAppComponents,
  unloadApp,
  unloadAllApps,
  useAppStorage,
  useAppEvents,
  useAppI18n,
  hasPermission,
  SDK_VERSION,
} from '../index'
import { resetRegistry, resetBus, getRegisteredScreen } from '@micronet/kernel'
import { manifest, componentCode, bundle, serialized } from './example-app'

describe('SDK', () => {
  beforeEach(() => {
    unloadAllApps()
    resetRegistry()
    resetBus()
  })

  describe('defineManifest', () => {
    it('returns a complete manifest with defaults', () => {
      const m = defineManifest({ id: 'test', name: 'Test', version: '1.0.0', icon: '🧪', color: '#ff0000' })
      expect(m.id).toBe('test')
      expect(m.name).toBe('Test')
      expect(m.version).toBe('1.0.0')
      expect(m.icon).toBe('🧪')
      expect(m.color).toBe('#ff0000')
      expect(m.permissions).toEqual([])
      expect(m.events).toEqual({})
    })
  })

  describe('defineApp', () => {
    it('creates an app definition from manifest and component', () => {
      const m = defineManifest({ id: 'test', name: 'Test', version: '1.0.0', icon: '🧪', color: '#fff' })
      const comp = { name: 'TestComp', setup() { return () => h('div') } }
      const app = defineApp(m, comp)
      expect(app.manifest.id).toBe('test')
      expect(app.component).toBe(comp)
    })
  })

  describe('buildBundle', () => {
    it('creates a valid bundle from options', () => {
      const b = buildBundle({ manifest, code: 'console.log("hello")' })
      expect(b.manifest.id).toBe('example-hello')
      expect(b.code).toBe('console.log("hello")')
      expect(b.i18n).toBeUndefined()
      expect(b.assets).toBeUndefined()
    })

    it('throws on missing required fields', () => {
      expect(() => buildBundle({ manifest: { ...manifest, id: '' }, code: 'x' })).toThrow()
      expect(() => buildBundle({ manifest, code: '' })).toThrow()
    })
  })

  describe('bundleToString / serializeComponent', () => {
    it('round-trips through JSON', () => {
      const json = bundleToString(bundle)
      const parsed = JSON.parse(json)
      expect(parsed.manifest.id).toBe('example-hello')
      expect(parsed.code).toBeTruthy()
    })

    it('serializeComponent produces valid JS with exports', () => {
      const code = serializeComponent(manifest, componentCode, 'function() { return null; }')
      expect(code).toContain('exports.default')
      expect(code).toContain('exports.manifest')
      expect(code).toContain('exports.component')
    })
  })

  describe('encodeBundle / decodeBundle', () => {
    it('round-trips through binary encoding', () => {
      const bytes = encodeBundle(bundle)
      expect(bytes[0]).toBe(0x4d) // 'M'
      expect(bytes[1]).toBe(0x4e) // 'N'
      const decoded = decodeBundle(bytes)
      expect(decoded.manifest.id).toBe('example-hello')
      expect(decoded.code).toBe(bundle.code)
    })

    it('rejects invalid magic bytes', () => {
      expect(() => decodeBundle(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toThrow('bad magic')
    })
  })

  describe('registerAppInstance', () => {
    it('registers an app and makes it available', () => {
      const comp = { name: 'TestComp', setup() { return () => h('div') } }
      const instance = registerAppInstance(manifest, comp)
      expect(instance.manifest.id).toBe('example-hello')
      expect(getApp('example-hello')).toBe(instance)
      expect(getLoadedApps()).toHaveLength(1)
    })

    it('throws on duplicate registration', () => {
      const comp = { name: 'TestComp', setup() { return () => h('div') } }
      registerAppInstance(manifest, comp)
      expect(() => registerAppInstance(manifest, comp)).toThrow('already loaded')
    })

    it('registers with middleware registry', () => {
      const comp = { name: 'TestComp', setup() { return () => h('div') } }
      registerAppInstance(manifest, comp)
      expect(getRegisteredScreen('example-hello' as any)).toBeDefined()
    })
  })

  describe('loadAppFromString', () => {
    it('loads a valid bundle code string', () => {
      const m = { ...manifest, id: 'loadable', name: 'Loadable' }
      const code = serializeComponent(m, '', 'function() { return null; }')
      const instance = loadAppFromString(code)
      expect(instance.manifest.id).toBe('loadable')
      expect(getApp('loadable')).toBeDefined()
    })

    it('throws on invalid bundle code', () => {
      expect(() => loadAppFromString('exports.x = null')).toThrow()
    })
  })

  describe('unloadApp / unloadAllApps', () => {
    it('removes a loaded app', async () => {
      const comp = { name: 'TestComp', setup() { return () => h('div') } }
      registerAppInstance(manifest, comp)
      expect(getApp('example-hello')).toBeDefined()
      const result = await unloadApp('example-hello')
      expect(result).toBe(true)
      expect(getApp('example-hello')).toBeUndefined()
    })

    it('returns false for unknown app', async () => {
      expect(await unloadApp('nonexistent')).toBe(false)
    })

    it('unloads all apps', async () => {
      const comp = { name: 'TestComp', setup() { return () => h('div') } }
      registerAppInstance(manifest, comp)
      await unloadAllApps()
      expect(getLoadedApps()).toHaveLength(0)
    })
  })

  describe('getAppComponent / getAllAppComponents', () => {
    it('returns the Vue component for a loaded app', () => {
      const comp = { name: 'TestComp', setup() { return () => h('div') } }
      registerAppInstance(manifest, comp)
      const appComp = getAppComponent('example-hello')
      expect(appComp).toBeDefined()
      expect(appComp!.name).toBe('App_example-hello')
    })

    it('returns all components as a record', () => {
      const comp = { name: 'TestComp', setup() { return () => h('div') } }
      registerAppInstance(manifest, comp)
      const all = getAllAppComponents()
      expect(Object.keys(all)).toContain('example-hello')
    })
  })

  describe('useAppStorage', () => {
    it('provides namespaced get/set/del', async () => {
      const store = useAppStorage('test-app')
      await store.set('key1', 'value1')
      const val = await store.get<string>('key1')
      expect(val).toBe('value1')
      await store.del('key1')
      const after = await store.get<string>('key1')
      expect(after).toBeNull()
    })
  })

  describe('useAppI18n', () => {
    it('returns translated strings with params', () => {
      const i18n = useAppI18n('test', {
        en: { greeting: 'Hello {name}!', count: '{n} items' },
        zh: { greeting: '你好 {name}！', count: '{n} 个项目' },
      })
      expect(i18n.t('greeting', { name: 'World' })).toBe('Hello World!')
      expect(i18n.t('count', { n: 5 })).toBe('5 items')
    })

    it('falls back to key when translation is missing', () => {
      const i18n = useAppI18n('test', { en: { hello: 'Hi' } })
      expect(i18n.t('nonexistent')).toBe('nonexistent')
    })
  })

  describe('useAppEvents', () => {
    it('provides emit/on/off', () => {
      ;(globalThis as Record<string, unknown>).__micronet_events =
        (globalThis as Record<string, unknown>).__micronet_events ||
        new Map<string, Set<(data: unknown) => void>>()
      const events = useAppEvents('test-app')
      let received: unknown = null
      const off = events.on('test-event', (data) => { received = data })
      events.emit('test-event', { value: 42 })
      expect(received).toEqual({ value: 42 })
      off()
      events.emit('test-event', { value: 99 })
      expect(received).toEqual({ value: 42 })
    })
  })

  describe('hasPermission', () => {
    it('returns true when permission is listed', () => {
      const m = defineManifest({ id: 't', name: 'T', version: '1', icon: '📱', color: '#fff', permissions: ['camera'] })
      expect(hasPermission(m, 'camera')).toBe(true)
      expect(hasPermission(m, 'bluetooth')).toBe(false)
    })

    it('returns true for all when no permissions specified', () => {
      const m = defineManifest({ id: 't', name: 'T', version: '1', icon: '📱', color: '#fff' })
      expect(hasPermission(m, 'camera')).toBe(true)
    })
  })

  describe('SDK_VERSION', () => {
    it('is a semver string', () => {
      expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    })
  })

  describe('example app bundle', () => {
    it('has valid manifest', () => {
      expect(bundle.manifest.id).toBe('example-hello')
      expect(bundle.manifest.name).toBe('Hello World')
      expect(bundle.manifest.version).toBe('1.0.0')
    })

    it('has code that exports manifest and component', () => {
      expect(bundle.code).toContain('manifest')
      expect(bundle.code).toContain('component')
    })

    it('has i18n messages', () => {
      expect(bundle.i18n?.en?.greeting).toBe('Hello, World!')
      expect(bundle.i18n?.zh?.greeting).toBe('你好，世界！')
    })

    it('serialized form is valid JSON', () => {
      const parsed = JSON.parse(serialized)
      expect(parsed.manifest.id).toBe('example-hello')
    })
  })
})
