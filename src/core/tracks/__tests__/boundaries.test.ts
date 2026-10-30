// Architecture test: keeps tracks independent so teams can't break each other.
// A track may import from '@/ui', '@/theme', '@/core', npm packages, and its own folder.
// Test files may also use the shared helpers in '@/test'.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../../..')
const TRACKS = join(SRC, 'tracks')
const ALLOWED_ALIASES = ['@/ui', '@/theme', '@/core']
const TEST_ALIASES = [...ALLOWED_ALIASES, '@/test']
const IMPORT = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    // E2E specs run in Node against the built app and may import the shared e2e/ fixtures.
    if (statSync(path).isDirectory()) return name === 'e2e' ? [] : walk(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

function violations(file: string): string[] {
  const track = relative(TRACKS, file).split(sep)[0]
  const trackRoot = join(TRACKS, track)
  const allowed = /\.test\.tsx?$/.test(file) ? TEST_ALIASES : ALLOWED_ALIASES
  const found: string[] = []

  for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    const spec = match[1] ?? match[2]
    if (spec.startsWith('.')) {
      const target = resolve(file, '..', spec)
      if (!target.startsWith(trackRoot + sep) && target !== trackRoot) found.push(spec)
    } else if (spec.startsWith('@/')) {
      if (spec === '@/core/tracks/registry') found.push(spec)
      else if (!allowed.some((alias) => spec === alias || spec.startsWith(`${alias}/`))) found.push(spec)
    }
  }
  return found.map((spec) => `${relative(SRC, file)} → ${spec}`)
}

describe('track boundaries', () => {
  it('tracks only import shared code (@/ui, @/theme, @/core) or their own files', () => {
    const problems = walk(TRACKS).flatMap(violations)
    expect(problems, `Cross-track or forbidden imports:\n${problems.join('\n')}`).toEqual([])
  })
})
