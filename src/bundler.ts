import type { MnAppBundle, BundleOptions, BundleResult, ValidateResult } from './types'
import { validateManifest, hashBytes, base64Encode } from './utils'
import { compileSFC, compile } from './compiler'
import { encodeBundle } from './build'

export async function bundleApp(options: BundleOptions): Promise<BundleResult> {
  const { manifest, sourceFiles, i18n, assets, minify } = options

  const validation = validateManifest(manifest)
  if (!validation.valid) {
    throw new Error(`Invalid manifest:\n${validation.errors.join('\n')}`)
  }

  const compiledParts: string[] = []
  const errors: string[] = []
  const warnings: string[] = []

  compiledParts.push('"use strict";')
  compiledParts.push('Object.defineProperty(exports, "__esModule", { value: true });')
  compiledParts.push('')
  compiledParts.push('const Vue = require("vue");')
  compiledParts.push('const MicronetSDK = require("@micronet/sdk");')
  compiledParts.push('')

  let componentRef = '__defaultComponent'

  for (const [filename, source] of Object.entries(sourceFiles)) {
    if (filename.endsWith('.vue')) {
      const result = compileSFC(source, { source, filename, minify })
      errors.push(...result.errors)
      warnings.push(...result.warnings)
      if (result.code) {
        compiledParts.push(`// --- ${filename} ---`)
        compiledParts.push(result.code)
        compiledParts.push('')
        componentRef = 'exports.default'
      }
    } else if (filename.endsWith('.ts') || filename.endsWith('.js')) {
      const result = compile(source, { source, filename, minify })
      errors.push(...result.errors)
      warnings.push(...result.warnings)
      if (result.code) {
        compiledParts.push(`// --- ${filename} ---`)
        compiledParts.push(result.code)
        compiledParts.push('')
      }
    }
  }

  compiledParts.push('')
  compiledParts.push(`exports.manifest = ${JSON.stringify(manifest)};`)
  compiledParts.push(`exports.component = ${componentRef} || { name: "App_${manifest.id}", setup() { return function() { return null; } } };`)
  compiledParts.push('exports.default = { manifest: exports.manifest, component: exports.component };')

  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.join('\n')}`)
  }

  let code = compiledParts.join('\n')
  if (minify) {
    code = minifyCode(code)
  }

  const processedAssets: Record<string, string> | undefined = assets
    ? Object.fromEntries(
      Object.entries(assets).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : base64Encode(value),
      ]),
    )
    : undefined

  const bundle: MnAppBundle = {
    manifest,
    code,
    i18n,
    assets: processedAssets,
  }

  const bytes = encodeBundle(bundle)
  const hash = await hashBytes(bytes)

  return {
    bundle,
    bytes,
    size: bytes.length,
    hash,
  }
}

export function validateBundle(bundle: MnAppBundle): ValidateResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!bundle.manifest) {
    errors.push('missing manifest')
    return { valid: false, errors, warnings }
  }

  const manifestResult = validateManifest(bundle.manifest)
  errors.push(...manifestResult.errors)
  warnings.push(...manifestResult.warnings)

  if (!bundle.code) {
    errors.push('missing code')
  } else {
    if (!bundle.code.includes('exports')) {
      warnings.push('code does not appear to export anything')
    }
    if (bundle.code.includes('require("vue")') || bundle.code.includes("require('vue')")) {
      warnings.push('code has runtime Vue dependency — ensure Vue is available in the host')
    }
  }

  if (bundle.i18n) {
    for (const [locale, messages] of Object.entries(bundle.i18n)) {
      if (!locale.match(/^[a-z]{2}(-[a-zA-Z]{2,4})?$/)) {
        warnings.push(`i18n locale "${locale}" may not be a valid locale code`)
      }
      if (typeof messages !== 'object' || messages === null) {
        errors.push(`i18n locale "${locale}" must be an object`)
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

function minifyCode(code: string): string {
  let result = code
  result = result.replace(/\/\/[^\n]*/g, '')
  result = result.replace(/\/\*[\s\S]*?\*\//g, '')
  result = result.replace(/\n\s*\n/g, '\n')
  result = result.replace(/^\s+/gm, '')
  result = result.replace(/\s+$/gm, '')
  result = result.replace(/\s*([{}();,:])\s*/g, '$1')
  return result.trim()
}

export function createProjectScaffold(appId: string, appName: string): Record<string, string> {
  const icon = '📱'
  const color = '#007aff'

  return {
    'manifest.json': JSON.stringify({
      id: appId,
      name: appName,
      version: '1.0.0',
      icon,
      color,
      description: `A Micronet app: ${appName}`,
      author: 'Developer',
      permissions: [],
      events: { 'go-back': 'back', 'go-home': 'home' },
    }, null, 2),

    'App.vue': `<template>
  <div class="app-screen">
    <div class="wallpaper"></div>
    <div class="content">
      <h1 class="title">${appName}</h1>
      <p class="subtitle">Welcome to your new Micronet app!</p>
      <button class="btn" @click="count++">
        Tapped {{ count }} times
      </button>
      <button class="btn btn-secondary" @click="goBack()">
        ← Back
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useNavigation } from '@micronet/sdk'

const { goBack } = useNavigation()
const count = ref(0)
</script>

<style scoped>
.app-screen {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.wallpaper {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, ${color} 0%, #5856d6 100%);
}
.content {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 20px;
}
.title {
  font-size: 28px;
  font-weight: 700;
  color: white;
}
.subtitle {
  font-size: 16px;
  color: rgba(255,255,255,0.8);
}
.btn {
  padding: 12px 28px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  background: white;
  color: #1c1c1e;
}
.btn:active { transform: scale(0.96); }
.btn-secondary {
  background: rgba(255,255,255,0.2);
  color: white;
}
</style>
`,

    'i18n/en.json': JSON.stringify({
      greeting: 'Hello!',
    }, null, 2),

    'README.md': `# ${appName}

A Micronet app.

## Development

\`\`\`bash
npx micronet build
\`\`\`

## Packaging

\`\`\`bash
npx micronet pack
\`\`\`
`,
  }
}
