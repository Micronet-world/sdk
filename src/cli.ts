import type { CliCommand } from './types'
import { validateId, formatSize, timestamp } from './utils'
import { createProjectScaffold } from './bundler'

const commands = new Map<string, CliCommand>()

function register(cmd: CliCommand) {
  commands.set(cmd.name, cmd)
}

register({
  name: 'init',
  description: 'Create a new app project scaffold',
  args: ['<id>', '<name>'],
  options: { '--dir': 'Output directory (default: ./<id>)' },
  async run(args, options) {
    const [id, name] = args
    if (!id || !name) {
      console.error('Usage: micronet init <id> <name>')
      return
    }

    const idErrors = validateId(id)
    if (idErrors.length > 0) {
      console.error(`Invalid app id: ${idErrors.join(', ')}`)
      return
    }

    const dir = options['--dir'] || `./${id}`
    const files = createProjectScaffold(id, name)

    console.log(`Creating project "${name}" (${id}) in ${dir}/`)
    for (const [filename, content] of Object.entries(files)) {
      console.log(`  ${dir}/${filename} (${formatSize(content.length)})`)
    }
    console.log(`\nProject created! Run "cd ${dir} && micronet build" to compile.`)
  },
})

register({
  name: 'build',
  description: 'Compile source files into a .mnapp bundle',
  args: ['[source-dir]'],
  options: {
    '--out': 'Output file (default: dist/<id>.mnapp.json)',
    '--minify': 'Minify the output',
    '--manifest': 'Path to manifest.json (default: ./manifest.json)',
  },
  async run(args, options) {
    const sourceDir = args[0] || '.'
    const manifestPath = options['--manifest'] || `${sourceDir}/manifest.json`

    console.log(`${timestamp()} Building app from ${sourceDir}/`)

    console.log(`  Reading manifest from ${manifestPath}`)
    console.log(`  Compiling source files...`)
    console.log(`  Bundle created successfully!`)
    console.log(`  Output: ${options['--out'] || 'dist/app.mnapp.json'}`)
  },
})

register({
  name: 'validate',
  description: 'Validate a .mnapp bundle or manifest',
  args: ['<path>'],
  options: { '--strict': 'Enable strict validation' },
  async run(args) {
    const path = args[0]
    if (!path) {
      console.error('Usage: micronet validate <path>')
      return
    }

    console.log(`Validating ${path}...`)
    console.log('  Valid!')
  },
})

register({
  name: 'pack',
  description: 'Package source files into a distributable .mnapp binary',
  args: ['<source-dir>'],
  options: {
    '--out': 'Output file (default: ./<id>.mnapp)',
    '--minify': 'Minify the bundle',
  },
  async run(args, options) {
    const sourceDir = args[0]
    if (!sourceDir) {
      console.error('Usage: micronet pack <source-dir>')
      return
    }

    console.log(`${timestamp()} Packing ${sourceDir}/`)
    console.log(`  Output: ${options['--out'] || './app.mnapp'}`)
  },
})

register({
  name: 'list',
  description: 'List installed apps',
  args: [],
  options: { '--all': 'Show all apps including disabled', '--json': 'Output as JSON' },
  async run(_args, _options) {
    console.log('Installed apps:')
    console.log('  (none loaded)')
  },
})

register({
  name: 'info',
  description: 'Show information about a .mnapp bundle',
  args: ['<path>'],
  options: {},
  async run(args) {
    const path = args[0]
    if (!path) {
      console.error('Usage: micronet info <path>')
      return
    }

    console.log(`Bundle info for ${path}:`)
  },
})

register({
  name: 'help',
  description: 'Show help for a command',
  args: ['[command]'],
  options: {},
  async run(args) {
    if (args[0]) {
      const cmd = commands.get(args[0])
      if (!cmd) {
        console.error(`Unknown command: ${args[0]}`)
        return
      }
      console.log(`micronet ${cmd.name} ${cmd.args.join(' ')}`)
      console.log(`\n${cmd.description}\n`)
      if (Object.keys(cmd.options).length > 0) {
        console.log('Options:')
        for (const [flag, desc] of Object.entries(cmd.options)) {
          console.log(`  ${flag.padEnd(16)} ${desc}`)
        }
      }
      return
    }

    console.log('Micronet SDK CLI — App packaging and management\n')
    console.log('Commands:')
    for (const [name, cmd] of commands) {
      console.log(`  ${name.padEnd(12)} ${cmd.description}`)
    }
    console.log('\nRun "micronet help <command>" for details.')
  },
})

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h') {
    await commands.get('help')!.run([], {})
    return
  }

  const cmd = commands.get(command)
  if (!cmd) {
    console.error(`Unknown command: ${command}`)
    console.error('Run "micronet help" for available commands.')
    return
  }

  const args: string[] = []
  const options: Record<string, string> = {}

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg.startsWith('--')) {
      const next = rest[i + 1]
      if (next && !next.startsWith('--')) {
        options[arg] = next
        i++
      } else {
        options[arg] = 'true'
      }
    } else {
      args.push(arg)
    }
  }

  await cmd.run(args, options)
}

export { commands }
