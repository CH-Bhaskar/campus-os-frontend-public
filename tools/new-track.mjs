#!/usr/bin/env node
// Scaffold a feature track, or run the tests for one track.
//
//   npm run new-track <id> [-- --title "My Feature" --team "Team 7"]
//   npm run test:track <id> [-- --e2e]
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = resolve(import.meta.dirname, '..')
const TRACKS = join(ROOT, 'src', 'tracks')
const TEMPLATE = join(TRACKS, '_template')
const TRACK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    test: { type: 'boolean', default: false },
    e2e: { type: 'boolean', default: false },
    title: { type: 'string' },
    team: { type: 'string', default: '' },
  },
})

const id = positionals[0]
if (!id || !TRACK_ID.test(id)) {
  console.error('Usage: npm run new-track <kebab-case-id>   e.g. npm run new-track lost-and-found')
  process.exit(1)
}

if (values.test) runTests(id)
else scaffold(id)

function scaffold(trackId) {
  const dest = join(TRACKS, trackId)
  if (existsSync(dest)) {
    console.error(`src/tracks/${trackId} already exists.`)
    process.exit(1)
  }

  const title = values.title ?? trackId.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
  cpSync(TEMPLATE, dest, { recursive: true })

  for (const file of walk(dest)) {
    const content = readFileSync(file, 'utf8')
      .replaceAll('__TRACK_ID__', trackId)
      .replaceAll('__TRACK_TITLE__', title)
      .replaceAll('__TEAM__', values.team)
    writeFileSync(file, content)
  }
  // Template's e2e spec is named generically; keep it but make it obvious which track it belongs to.
  renameSync(join(dest, 'e2e', 'home.spec.ts'), join(dest, 'e2e', `${trackId}.spec.ts`))

  console.log(`Created src/tracks/${trackId}

Next steps:
  1. npm run dev              → open /tracks/${trackId}
  2. Edit src/tracks/${trackId}/index.ts (description, team, icon)
  3. npm run test:track ${trackId}
  4. Optional: claim the folder in .github/CODEOWNERS`)
}

function runTests(trackId) {
  if (!existsSync(join(TRACKS, trackId))) {
    console.error(`No track at src/tracks/${trackId}.`)
    process.exit(1)
  }
  const run = (cmd, args) => {
    const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  run('npx', ['vitest', 'run', `src/tracks/${trackId}/`])
  if (values.e2e) run('npx', ['playwright', 'test', `src/tracks/${trackId}/e2e/`])
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}
