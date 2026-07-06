import type { CompileOptions, CompileResult } from './types'

interface SFCDescriptor {
  template: string | null
  script: string | null
  scriptSetup: string | null
  styles: string[]
  customBlocks: { type: string; content: string }[]
}

function parseSFC(source: string): SFCDescriptor {
  const descriptor: SFCDescriptor = {
    template: null,
    script: null,
    scriptSetup: null,
    styles: [],
    customBlocks: [],
  }

  const tagRegex = /<(\w+)(\s[^>]*)?>([\s\S]*?)<\/\1>/g
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(source)) !== null) {
    const [, tag, attrs, content] = match
    const trimmed = content.trim()

    if (tag === 'template') {
      if (!descriptor.template) descriptor.template = trimmed
    } else if (tag === 'script') {
      if (attrs && attrs.includes('setup')) {
        descriptor.scriptSetup = trimmed
      } else {
        descriptor.script = trimmed
      }
    } else if (tag === 'style') {
      descriptor.styles.push(trimmed)
    } else {
      descriptor.customBlocks.push({ type: tag, content: trimmed })
    }
  }

  return descriptor
}

function extractTemplateContent(template: string): string {
  const innerMatch = template.match(/^<template[^>]*>([\s\S]*)<\/template>$/)
  return innerMatch ? innerMatch[1].trim() : template
}

function compileTemplate(html: string): string {
  const escaped = html
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')

  return `function __render() {
  return \`${escaped}\`
}`
}

function transformScript(code: string): string {
  let result = code

  result = result.replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?/g, '')
  result = result.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"]\s*;?/g, (_match, imports: string) => {
    const names = imports.split(',').map((s: string) => s.trim()).filter(Boolean)
    return names.map((n: string) => {
      const parts = n.split(/\s+as\s+/)
      const local = parts[1]?.trim() || parts[0].trim()
      const imported = parts[0].trim()
      return `const ${local} = Vue.${imported};`
    }).join('\n')
  })

  result = result.replace(/import\s+\{([^}]+)\}\s+from\s+['"]@micronet\/sdk['"]\s*;?/g, (_match, imports: string) => {
    const names = imports.split(',').map((s: string) => s.trim()).filter(Boolean)
    return names.map((n: string) => {
      const parts = n.split(/\s+as\s+/)
      const local = parts[1]?.trim() || parts[0].trim()
      return `const ${local} = MicronetSDK.${parts[0].trim()};`
    }).join('\n')
  })

  result = result.replace(/export\s+default\s+/g, 'module.exports.default = ')

  return result
}

export function compileSFC(source: string, options?: CompileOptions): CompileResult {
  const errors: string[] = []
  const warnings: string[] = []
  const filename = options?.filename || 'component.vue'

  try {
    const descriptor = parseSFC(source)

    if (!descriptor.template && !descriptor.script && !descriptor.scriptSetup) {
      errors.push(`${filename}: no template, script, or script setup block found`)
      return { code: '', errors, warnings }
    }

    const parts: string[] = []

    parts.push('"use strict";')
    parts.push('Object.defineProperty(exports, "__esModule", { value: true });')
    parts.push('')

    if (descriptor.scriptSetup) {
      const transformed = transformScript(descriptor.scriptSetup)
      parts.push(transformed)
      parts.push('')

      if (descriptor.template) {
        const templateContent = extractTemplateContent(descriptor.template)
        parts.push(compileTemplate(templateContent))
        parts.push('')
      }

      parts.push('const __component = {')
      parts.push(`  name: "${filename.replace(/[^a-zA-Z0-9]/g, '_')}",`)
      parts.push('  setup() { return __render(); }')
      parts.push('};')
    } else if (descriptor.script) {
      const transformed = transformScript(descriptor.script)
      parts.push(transformed)
      parts.push('')

      if (descriptor.template) {
        const templateContent = extractTemplateContent(descriptor.template)
        parts.push(compileTemplate(templateContent))
        parts.push('')
      }
    } else if (descriptor.template) {
      const templateContent = extractTemplateContent(descriptor.template)
      parts.push(compileTemplate(templateContent))
      parts.push('')
      parts.push('const __component = {')
      parts.push(`  name: "${filename.replace(/[^a-zA-Z0-9]/g, '_')}",`)
      parts.push('  setup() { return __render(); }')
      parts.push('};')
    }

    if (descriptor.styles.length > 0) {
      const css = descriptor.styles.join('\n')
      const escaped = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
      parts.push(`const __styles = \`${escaped}\`;`)
      parts.push('if (typeof document !== "undefined") {')
      parts.push(`  const __style = document.createElement("style");`)
      parts.push(`  __style.textContent = __styles;`)
      parts.push('  document.head.appendChild(__style);')
      parts.push('}')
      parts.push('')
    }

    parts.push('exports.default = __component;')
    parts.push('module.exports = exports;')

    return { code: parts.join('\n'), errors, warnings }
  } catch (err) {
    errors.push(`${filename}: compilation failed: ${err instanceof Error ? err.message : String(err)}`)
    return { code: '', errors, warnings }
  }
}

export function compileJS(source: string, options?: CompileOptions): CompileResult {
  const errors: string[] = []
  const warnings: string[] = []
  const filename = options?.filename || 'app.js'

  try {
    let code = source

    code = code.replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?/g, '')

    code = code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"]\s*;?/g, (_match, imports: string) => {
      const names = imports.split(',').map((s: string) => s.trim()).filter(Boolean)
      return names.map((n: string) => {
        const parts = n.split(/\s+as\s+/)
        const local = parts[1]?.trim() || parts[0].trim()
        const imported = parts[0].trim()
        return `const ${local} = Vue.${imported};`
      }).join('\n')
    })

    code = code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]@micronet\/sdk['"]\s*;?/g, (_match, imports: string) => {
      const names = imports.split(',').map((s: string) => s.trim()).filter(Boolean)
      return names.map((n: string) => {
        const parts = n.split(/\s+as\s+/)
        const local = parts[1]?.trim() || parts[0].trim()
        return `const ${local} = MicronetSDK.${parts[0].trim()};`
      }).join('\n')
    })

    code = code.replace(/import\s+(\w+)\s+from\s+['"][^'"]+['"]\s*;?/g, (_match, name: string) => {
      return `const ${name} = require("${_match.match(/from\s+['"]([^'"]+)['"]/)?.[1] || name}");`
    })

    code = code.replace(/export\s+default\s+/g, 'module.exports.default = ')
    code = code.replace(/export\s+\{([^}]+)\}/g, (_match, exports: string) => {
      const names = exports.split(',').map((s: string) => s.trim()).filter(Boolean)
      return names.map((n: string) => `exports.${n} = ${n};`).join('\n')
    })

    return { code, errors, warnings }
  } catch (err) {
    errors.push(`${filename}: transform failed: ${err instanceof Error ? err.message : String(err)}`)
    return { code: '', errors, warnings }
  }
}

export function compile(source: string, options?: CompileOptions): CompileResult {
  const filename = options?.filename || 'app.js'
  if (filename.endsWith('.vue')) {
    return compileSFC(source, options)
  }
  return compileJS(source, options)
}
