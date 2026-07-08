import { describe, it, expect } from 'vitest'
import {
  encodeBundle,
  decodeBundle,
  buildBundle,
  bundleToString,
  serializeComponent,
  createAppTemplate,
  MNAPP_MAGIC,
  MNAPP_VERSION,
} from '../build'
import type { AppManifest, MnAppBundle } from '../types'

function makeManifest(id = 'test-app'): AppManifest {
  return {
    id,
    name: 'Test App',
    version: '1.0.0',
    icon: '📱',
    color: '#007aff',
    permissions: [],
    events: {},
  }
}

describe('.mnapp binary format', () => {
  describe('MNAPP constants', () => {
    it('has magic string MNAPP', () => {
      expect(MNAPP_MAGIC).toBe('MNAPP')
    })

    it('has version 1', () => {
      expect(MNAPP_VERSION).toBe(1)
    })
  })

  describe('encodeBundle', () => {
    it('produces correct magic header bytes', () => {
      const bundle: MnAppBundle = { manifest: makeManifest(), code: 'test' }
      const bytes = encodeBundle(bundle)

      expect(bytes[0]).toBe(0x4d) // M
      expect(bytes[1]).toBe(0x4e) // N
      expect(bytes[2]).toBe(0x41) // A
      expect(bytes[3]).toBe(0x50) // P
      expect(bytes[4]).toBe(0x50) // P
    })

    it('sets version byte to 1', () => {
      const bundle: MnAppBundle = { manifest: makeManifest(), code: 'test' }
      const bytes = encodeBundle(bundle)

      expect(bytes[5]).toBe(1)
    })

    it('encodes data length at offset 10 (big-endian uint32)', () => {
      const bundle: MnAppBundle = { manifest: makeManifest(), code: 'hello' }
      const bytes = encodeBundle(bundle)

      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const dataLen = view.getUint32(10, false)
      const expectedJson = JSON.stringify(bundle)
      expect(dataLen).toBe(new TextEncoder().encode(expectedJson).length)
    })

    it('header is exactly 14 bytes', () => {
      const bundle: MnAppBundle = { manifest: makeManifest(), code: 'x' }
      const bytes = encodeBundle(bundle)

      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const dataLen = view.getUint32(10, false)
      expect(bytes.length).toBe(14 + dataLen)
    })

    it('encodes JSON payload starting at byte 14', () => {
      const bundle: MnAppBundle = { manifest: makeManifest(), code: 'payload-test' }
      const bytes = encodeBundle(bundle)

      const decoder = new TextDecoder()
      const payload = decoder.decode(bytes.slice(14))
      const parsed = JSON.parse(payload)
      expect(parsed.code).toBe('payload-test')
    })

    it('handles empty code string', () => {
      const bundle: MnAppBundle = { manifest: makeManifest(), code: '' }
      const bytes = encodeBundle(bundle)
      const decoded = decodeBundle(bytes)
      expect(decoded.code).toBe('')
    })

    it('handles large payloads', () => {
      const largeCode = 'x'.repeat(100_000)
      const bundle: MnAppBundle = { manifest: makeManifest(), code: largeCode }
      const bytes = encodeBundle(bundle)

      expect(bytes.length).toBeGreaterThan(100_000)
      const decoded = decodeBundle(bytes)
      expect(decoded.code).toBe(largeCode)
    })

    it('handles unicode in manifest and code', () => {
      const manifest = { ...makeManifest(), name: '日本語アプリ', icon: '🎌' }
      const bundle: MnAppBundle = { manifest, code: 'const x = "中文";' }
      const bytes = encodeBundle(bundle)
      const decoded = decodeBundle(bytes)

      expect(decoded.manifest.name).toBe('日本語アプリ')
      expect(decoded.manifest.icon).toBe('🎌')
      expect(decoded.code).toContain('中文')
    })

    it('preserves i18n and assets fields', () => {
      const bundle: MnAppBundle = {
        manifest: makeManifest(),
        code: 'test',
        i18n: { en: { hello: 'Hello' }, zh: { hello: '你好' } },
        assets: { 'style.css': '.test { color: red; }' },
      }
      const bytes = encodeBundle(bundle)
      const decoded = decodeBundle(bytes)

      expect(decoded.i18n?.en?.hello).toBe('Hello')
      expect(decoded.i18n?.zh?.hello).toBe('你好')
      expect(decoded.assets?.['style.css']).toBe('.test { color: red; }')
    })
  })

  describe('decodeBundle', () => {
    it('rejects invalid magic bytes', () => {
      expect(() => decodeBundle(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toThrow('bad magic')
    })

    it('rejects partial magic (MNAP without final P)', () => {
      const bytes = new Uint8Array([0x4d, 0x4e, 0x41, 0x50, 0x00, 1, 0, 0, 0, 0, 0, 0, 0, 4])
      expect(() => decodeBundle(bytes)).toThrow('bad magic')
    })

    it('rejects unsupported version', () => {
      const bundle: MnAppBundle = { manifest: makeManifest(), code: 'test' }
      const bytes = encodeBundle(bundle)
      bytes[5] = 99 // invalid version

      expect(() => decodeBundle(bytes)).toThrow('Unsupported .mnapp version: 99')
    })

    it('rejects empty input', () => {
      expect(() => decodeBundle(new Uint8Array(0))).toThrow()
    })

    it('round-trips through encode/decode', () => {
      const original: MnAppBundle = {
        manifest: makeManifest('roundtrip'),
        code: 'const x = 42;',
        i18n: { en: { key: 'value' } },
      }

      const encoded = encodeBundle(original)
      const decoded = decodeBundle(encoded)

      expect(decoded).toEqual(original)
    })

    it('round-trips with all manifest fields', () => {
      const manifest: AppManifest = {
        id: 'full-manifest',
        name: 'Full Manifest App',
        version: '2.1.0',
        icon: '🔥',
        color: '#ff3b30',
        description: 'A test app with all fields',
        author: 'Test Author',
        license: 'MIT',
        homepage: 'https://example.com',
        permissions: ['camera', 'bluetooth', 'location'],
        events: { 'go-back': 'back', 'push-settings': 'push:settings' },
        dependencies: ['dep-1'],
        minPlatformVersion: '1.0.0',
      }

      const bundle: MnAppBundle = { manifest, code: 'test code' }
      const encoded = encodeBundle(bundle)
      const decoded = decodeBundle(encoded)

      expect(decoded.manifest).toEqual(manifest)
    })
  })

  describe('buildBundle', () => {
    it('creates a valid bundle with defaults', () => {
      const manifest = makeManifest()
      const bundle = buildBundle({ manifest, code: 'test' })

      expect(bundle.manifest.id).toBe('test-app')
      expect(bundle.code).toBe('test')
      expect(bundle.manifest.icon).toBe('📱')
      expect(bundle.manifest.color).toBe('#007aff')
      expect(bundle.manifest.permissions).toEqual([])
      expect(bundle.manifest.events).toEqual({})
    })

    it('throws on missing manifest.id', () => {
      expect(() => buildBundle({ manifest: { ...makeManifest(), id: '' }, code: 'x' })).toThrow('manifest.id is required')
    })

    it('throws on missing manifest.name', () => {
      expect(() => buildBundle({ manifest: { ...makeManifest(), name: '' }, code: 'x' })).toThrow('manifest.name is required')
    })

    it('throws on missing manifest.version', () => {
      expect(() => buildBundle({ manifest: { ...makeManifest(), version: '' }, code: 'x' })).toThrow('manifest.version is required')
    })

    it('throws on missing code', () => {
      expect(() => buildBundle({ manifest: makeManifest(), code: '' })).toThrow('code is required')
    })

    it('includes i18n when provided', () => {
      const bundle = buildBundle({
        manifest: makeManifest(),
        code: 'test',
        i18n: { en: { hello: 'Hello' } },
      })
      expect(bundle.i18n?.en?.hello).toBe('Hello')
    })

    it('includes assets when provided', () => {
      const bundle = buildBundle({
        manifest: makeManifest(),
        code: 'test',
        assets: { 'app.css': 'body {}' },
      })
      expect(bundle.assets?.['app.css']).toBe('body {}')
    })
  })

  describe('bundleToString', () => {
    it('produces valid JSON', () => {
      const bundle = buildBundle({ manifest: makeManifest(), code: 'test' })
      const json = bundleToString(bundle)
      const parsed = JSON.parse(json)

      expect(parsed.manifest.id).toBe('test-app')
      expect(parsed.code).toBe('test')
    })

    it('is pretty-printed with 2-space indent', () => {
      const bundle = buildBundle({ manifest: makeManifest(), code: 'test' })
      const json = bundleToString(bundle)

      expect(json).toContain('\n')
      expect(json).toContain('  ')
    })
  })

  describe('serializeComponent', () => {
    it('produces valid CommonJS module code', () => {
      const manifest = makeManifest('serialize-test')
      const code = serializeComponent(manifest, '', 'function() { return null; }')

      expect(code).toContain('"use strict"')
      expect(code).toContain('exports.default')
      expect(code).toContain('exports.manifest')
      expect(code).toContain('exports.component')
    })

    it('embeds the manifest JSON', () => {
      const manifest = makeManifest('embed-test')
      const code = serializeComponent(manifest, '', 'function() { return null; }')

      expect(code).toContain('"embed-test"')
      expect(code).toContain('"Test App"')
    })

    it('embeds the render function', () => {
      const manifest = makeManifest()
      const renderFn = 'function() { return h("div", "hello"); }'
      const code = serializeComponent(manifest, '', renderFn)

      expect(code).toContain(renderFn)
    })

    it('includes the app id in the component name', () => {
      const manifest = makeManifest('named-comp')
      const code = serializeComponent(manifest, '', 'function() { return null; }')

      expect(code).toContain('App_named-comp')
    })

    it('produces code that can be executed', () => {
      const manifest = makeManifest('exec-test')
      const code = serializeComponent(manifest, '', 'function() { return null; }')

      const module = { exports: {} as Record<string, unknown> }
      new Function('module', 'exports', code)(module, module.exports)

      expect(module.exports.default).toBeDefined()
      expect(module.exports.default.manifest.id).toBe('exec-test')
      expect(module.exports.default.component.name).toBe('App_exec-test')
    })
  })

  describe('createAppTemplate', () => {
    it('produces valid JSON with manifest and componentCode', () => {
      const template = createAppTemplate('my-app', 'My App')
      const parsed = JSON.parse(template)

      expect(parsed.manifest.id).toBe('my-app')
      expect(parsed.manifest.name).toBe('My App')
      expect(parsed.componentCode).toContain('My App')
    })

    it('uses default icon and color', () => {
      const template = createAppTemplate('test', 'Test')
      const parsed = JSON.parse(template)

      expect(parsed.manifest.icon).toBe('📱')
      expect(parsed.manifest.color).toBe('#007aff')
    })

    it('accepts custom icon and color', () => {
      const template = createAppTemplate('custom', 'Custom', { icon: '🔥', color: '#ff0000' })
      const parsed = JSON.parse(template)

      expect(parsed.manifest.icon).toBe('🔥')
      expect(parsed.manifest.color).toBe('#ff0000')
    })

    it('accepts custom description', () => {
      const template = createAppTemplate('desc', 'Desc', { description: 'Custom description' })
      const parsed = JSON.parse(template)

      expect(parsed.manifest.description).toBe('Custom description')
    })

    it('generates default description from name', () => {
      const template = createAppTemplate('auto-desc', 'Auto Desc')
      const parsed = JSON.parse(template)

      expect(parsed.manifest.description).toContain('Auto Desc')
    })
  })
})
