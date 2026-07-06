import { describe, it, expect, beforeEach } from 'vitest'
import {
  validateManifest,
  validateId,
  validateSemver,
  hashString,
  normalizePath,
  joinPath,
  getExtension,
  stripExtension,
  base64Encode,
  base64Decode,
  formatSize,
  AppError,
} from '../utils'
import { compileSFC, compileJS } from '../compiler'
import { bundleApp, validateBundle, createProjectScaffold } from '../bundler'
import { runCli, commands } from '../cli'
import {
  registerApp,
  unregisterApp,
  enableApp,
  disableApp,
  getAppEntry,
  getAllEntries,
  clearStore,
  exportStore,
  importStore,
} from '../store'
import type { AppManifest } from '../types'

const testManifest: AppManifest = {
  id: 'test-app',
  name: 'Test App',
  version: '1.0.0',
  icon: '🧪',
  color: '#ff0000',
  description: 'A test app',
  author: 'Test',
  permissions: ['storage'],
  events: { 'go-back': 'back', 'go-home': 'home' },
}

describe('utils', () => {
  describe('validateId', () => {
    it('accepts valid ids', () => {
      expect(validateId('my-app')).toEqual([])
      expect(validateId('app123')).toEqual([])
      expect(validateId('a-b-c-d')).toEqual([])
    })
    it('rejects invalid ids', () => {
      expect(validateId('')).toHaveLength(1)
      expect(validateId('ab')).toHaveLength(1)
      expect(validateId('My-App')).toHaveLength(1)
      expect(validateId('-app')).toHaveLength(1)
      expect(validateId('app-')).toHaveLength(1)
    })
  })

  describe('validateSemver', () => {
    it('accepts valid semver', () => {
      expect(validateSemver('1.0.0')).toEqual([])
      expect(validateSemver('0.1.0-beta')).toEqual([])
    })
    it('rejects invalid semver', () => {
      expect(validateSemver('')).toHaveLength(1)
      expect(validateSemver('1.0')).toHaveLength(1)
      expect(validateSemver('v1.0.0')).toHaveLength(1)
    })
  })

  describe('validateManifest', () => {
    it('passes valid manifest', () => {
      const result = validateManifest(testManifest)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
    it('catches missing required fields', () => {
      const result = validateManifest({} as AppManifest)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
    it('warns on missing optional fields', () => {
      const result = validateManifest({ id: 'test-x', name: 'X', version: '1.0.0', icon: '📱', color: '#fff' })
      expect(result.valid).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
    })
    it('validates permissions', () => {
      const result = validateManifest({ ...testManifest, permissions: ['invalid' as any] })
      expect(result.valid).toBe(false)
    })
    it('validates events', () => {
      const result = validateManifest({ ...testManifest, events: { 'x': 'invalid' } })
      expect(result.valid).toBe(false)
    })
  })

  describe('hashString', () => {
    it('produces consistent hashes', () => {
      expect(hashString('hello')).toBe(hashString('hello'))
      expect(hashString('hello')).not.toBe(hashString('world'))
    })
  })

  describe('path helpers', () => {
    it('normalizePath', () => {
      expect(normalizePath('a//b/c/')).toBe('a/b/c')
    })
    it('joinPath', () => {
      expect(joinPath('a/', '/b', 'c')).toBe('a/b/c')
    })
    it('getExtension', () => {
      expect(getExtension('file.vue')).toBe('.vue')
      expect(getExtension('file')).toBe('')
    })
    it('stripExtension', () => {
      expect(stripExtension('file.vue')).toBe('file')
      expect(stripExtension('file')).toBe('file')
    })
  })

  describe('base64', () => {
    it('round-trips', () => {
      const data = new TextEncoder().encode('hello world')
      expect(new TextDecoder().decode(base64Decode(base64Encode(data)))).toBe('hello world')
    })
  })

  describe('formatSize', () => {
    it('formats bytes', () => {
      expect(formatSize(500)).toBe('500 B')
      expect(formatSize(1500)).toBe('1.5 KB')
      expect(formatSize(1500000)).toBe('1.4 MB')
    })
  })

  describe('AppError', () => {
    it('has appId and code', () => {
      const err = new AppError('my-app', 'something broke', 'ERR_001')
      expect(err.appId).toBe('my-app')
      expect(err.code).toBe('ERR_001')
      expect(err.message).toContain('my-app')
      expect(err.message).toContain('something broke')
    })
  })
})

describe('compiler', () => {
  describe('compileSFC', () => {
    it('compiles a minimal SFC', () => {
      const source = `<template><div>Hello</div></template>`
      const result = compileSFC(source, { source, filename: 'Test.vue' })
      expect(result.errors).toHaveLength(0)
      expect(result.code).toContain('exports')
    })

    it('compiles SFC with script setup', () => {
      const source = `
<template><div>{{ msg }}</div></template>
<script setup>
const msg = 'hello'
</script>`
      const result = compileSFC(source, { source, filename: 'Test.vue' })
      expect(result.errors).toHaveLength(0)
      expect(result.code).toContain('msg')
    })

    it('reports errors for empty source', () => {
      const result = compileSFC('', { source: '', filename: 'Empty.vue' })
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('compileJS', () => {
    it('transforms ES imports to require', () => {
      const source = `import { ref } from 'vue'\nconst x = ref(0)`
      const result = compileJS(source, { source })
      expect(result.errors).toHaveLength(0)
      expect(result.code).toContain('const ref = Vue.ref')
    })

    it('transforms SDK imports', () => {
      const source = `import { useNavigation } from '@micronet/sdk'`
      const result = compileJS(source, { source })
      expect(result.errors).toHaveLength(0)
      expect(result.code).toContain('MicronetSDK.useNavigation')
    })
  })
})

describe('bundler', () => {
  describe('bundleApp', () => {
    it('creates a bundle from source files', async () => {
      const result = await bundleApp({
        manifest: testManifest,
        sourceFiles: {
          'App.vue': '<template><div>Hello</div></template>',
        },
      })
      expect(result.bundle.manifest.id).toBe('test-app')
      expect(result.bundle.code).toContain('exports')
      expect(result.size).toBeGreaterThan(0)
      expect(result.hash).toBeTruthy()
    })

    it('throws on invalid manifest', async () => {
      await expect(bundleApp({
        manifest: {} as AppManifest,
        sourceFiles: { 'App.vue': '<template><div>X</div></template>' },
      })).rejects.toThrow()
    })
  })

  describe('validateBundle', () => {
    it('validates a good bundle', () => {
      const result = validateBundle({
        manifest: testManifest,
        code: 'exports.default = {}',
      })
      expect(result.valid).toBe(true)
    })

    it('catches missing manifest', () => {
      const result = validateBundle({} as any)
      expect(result.valid).toBe(false)
    })

    it('catches missing code', () => {
      const result = validateBundle({ manifest: testManifest, code: '' })
      expect(result.valid).toBe(false)
    })
  })

  describe('createProjectScaffold', () => {
    it('creates expected files', () => {
      const files = createProjectScaffold('my-app', 'My App')
      expect(files['manifest.json']).toBeTruthy()
      expect(files['App.vue']).toBeTruthy()
      expect(files['i18n/en.json']).toBeTruthy()
      expect(files['README.md']).toContain('My App')
    })
  })
})

describe('store', () => {
  beforeEach(async () => {
    await clearStore()
  })

  it('registers and retrieves an app', async () => {
    const entry = await registerApp(testManifest, 'local')
    expect(entry.id).toBe('test-app')
    expect(entry.state).toBe('registered')
    const retrieved = await getAppEntry('test-app')
    expect(retrieved?.manifest.name).toBe('Test App')
  })

  it('unregisters an app', async () => {
    await registerApp(testManifest)
    const removed = await unregisterApp('test-app')
    expect(removed).toBe(true)
    expect(await getAppEntry('test-app')).toBeUndefined()
  })

  it('enables and disables apps', async () => {
    await registerApp(testManifest)
    await enableApp('test-app')
    let entry = await getAppEntry('test-app')
    expect(entry?.state).toBe('enabled')

    await disableApp('test-app')
    entry = await getAppEntry('test-app')
    expect(entry?.state).toBe('disabled')
  })

  it('lists all entries', async () => {
    await registerApp(testManifest)
    await registerApp({ ...testManifest, id: 'app-2', name: 'App 2' })
    const all = await getAllEntries()
    expect(all).toHaveLength(2)
  })

  it('exports and imports store', async () => {
    await registerApp(testManifest)
    const exported = await exportStore()
    await clearStore()
    expect(await getAllEntries()).toHaveLength(0)
    const count = await importStore(exported)
    expect(count).toBe(1)
    expect(await getAppEntry('test-app')).toBeDefined()
  })
})

describe('cli', () => {
  it('has all expected commands', () => {
    expect(commands.has('init')).toBe(true)
    expect(commands.has('build')).toBe(true)
    expect(commands.has('validate')).toBe(true)
    expect(commands.has('pack')).toBe(true)
    expect(commands.has('list')).toBe(true)
    expect(commands.has('info')).toBe(true)
    expect(commands.has('help')).toBe(true)
  })

  it('runs help without error', async () => {
    await expect(runCli(['help'])).resolves.not.toThrow()
  })

  it('runs help for specific command', async () => {
    await expect(runCli(['help', 'init'])).resolves.not.toThrow()
  })

  it('runs with no args shows help', async () => {
    await expect(runCli([])).resolves.not.toThrow()
  })
})
