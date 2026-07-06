import type { AppManifest, MnAppBundle } from './types'

export interface BuildOptions {
  manifest: AppManifest
  code: string
  i18n?: Record<string, Record<string, string>>
  assets?: Record<string, string>
  minify?: boolean
}

export function buildBundle(options: BuildOptions): MnAppBundle {
  const { manifest, code, i18n, assets } = options

  if (!manifest.id) throw new Error('manifest.id is required')
  if (!manifest.name) throw new Error('manifest.name is required')
  if (!manifest.version) throw new Error('manifest.version is required')
  if (!code) throw new Error('code is required')

  return {
    manifest: {
      ...manifest,
      icon: manifest.icon || '📱',
      color: manifest.color || '#007aff',
      permissions: manifest.permissions || [],
      events: manifest.events || {},
    },
    code,
    i18n,
    assets,
  }
}

export function bundleToString(bundle: MnAppBundle): string {
  return JSON.stringify(bundle, null, 2)
}

export function serializeComponent(
  manifest: AppManifest,
  _componentCode: string,
  renderFunction: string,
): string {
  return [
    '"use strict";',
    'Object.defineProperty(exports, "__esModule", { value: true });',
    '',
    'const manifest = ' + JSON.stringify(manifest) + ';',
    '',
    'const component = {',
    '  name: "App_' + manifest.id + '",',
    '  setup() {',
    '    return ' + renderFunction + ';',
    '  }',
    '};',
    '',
    'exports.default = { manifest, component };',
    'exports.manifest = manifest;',
    'exports.component = component;',
  ].join('\n')
}

export function createAppTemplate(
  id: string,
  name: string,
  options?: { icon?: string; color?: string; description?: string },
): string {
  const icon = options?.icon || '📱'
  const color = options?.color || '#007aff'
  const description = options?.description || `A Micronet app: ${name}`

  return JSON.stringify({
    manifest: {
      id,
      name,
      version: '1.0.0',
      icon,
      color,
      description,
      author: 'Third-party Developer',
      permissions: [],
      events: {},
    },
    componentCode: [
      'const { h } = require("vue");',
      '',
      'function render() {',
      '  return h("div", { class: "app-screen" }, [',
      '    h("h1", null, "' + name + '"),',
      '    h("p", null, "Welcome to ' + name + '!"),',
      '  ]);',
      '}',
    ].join('\n'),
    renderFunction: 'function() { return render(); }',
  }, null, 2)
}

export const MNAPP_MAGIC = 'MNAPP'
export const MNAPP_VERSION = 1

export function encodeBundle(bundle: MnAppBundle): Uint8Array {
  const json = JSON.stringify(bundle)
  const encoder = new TextEncoder()
  const data = encoder.encode(json)
  const headerSize = 14 // MNAPP(5) + version(1) + pad(4) + len(4)
  const buf = new ArrayBuffer(headerSize + data.length)
  const view = new DataView(buf)
  const header = new Uint8Array(buf)
  // Magic: MNAPP
  header[0] = 0x4d // M
  header[1] = 0x4e // N
  header[2] = 0x41 // A
  header[3] = 0x50 // P
  header[4] = 0x50 // P
  header[5] = MNAPP_VERSION
  view.setUint32(10, data.length, false)
  header.set(data, headerSize)
  return header
}

export function decodeBundle(bytes: Uint8Array): MnAppBundle {
  const decoder = new TextDecoder()
  if (bytes[0] !== 0x4d || bytes[1] !== 0x4e || bytes[2] !== 0x41 || bytes[3] !== 0x50 || bytes[4] !== 0x50) {
    throw new Error('Invalid .mnapp file: bad magic bytes')
  }
  if (bytes[5] !== MNAPP_VERSION) throw new Error(`Unsupported .mnapp version: ${bytes[5]}`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dataLen = view.getUint32(10, false)
  const json = decoder.decode(bytes.slice(14, 14 + dataLen))
  return JSON.parse(json) as MnAppBundle
}
