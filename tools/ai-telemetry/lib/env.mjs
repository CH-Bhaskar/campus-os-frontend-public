// Shared paths, config, git helpers and the hook wrapper used by every collector.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(TOOL_DIR, '../..');
export const HOME_DIR = path.join(os.homedir(), '.ai-telemetry');
export const SPOOL_DIR = path.join(HOME_DIR, 'spool');
const LOG_FILE = path.join(HOME_DIR, 'telemetry.log');

export function git(args, opts = {}) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true, // background processes (watcher, flush) would otherwise flash a console per call
    ...opts,
  });
}

export function tryGit(args, opts) {
  try {
    return git(args, opts).trim();
  } catch {
    return '';
  }
}

let gitDirCache;
export function gitDir() {
  return (gitDirCache ??= tryGit(['rev-parse', '--absolute-git-dir']) || path.join(REPO_ROOT, '.git'));
}

// Machine-local state (turn snapshots, pre-images, ledger). Lives inside .git so it is never committed.
export function stateDir(...sub) {
  const dir = path.join(gitDir(), 'ai-telemetry', ...sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let configCache;
export function loadConfig() {
  if (configCache) return configCache;
  const cfg = readJson(path.join(TOOL_DIR, 'config.json'), {});
  if (process.env.AI_TELEMETRY_ENDPOINT) cfg.endpoint = process.env.AI_TELEMETRY_ENDPOINT;
  cfg.disabled = process.env.AI_TELEMETRY_DISABLED === '1';
  cfg.exclude ??= [];
  return (configCache = cfg);
}

// Pathspecs that keep lockfiles and build output out of line counts.
export function excludePathspecs() {
  return loadConfig().exclude.map((p) => `:(exclude,glob)${p.includes('/') ? p : `**/${p}`}`);
}

// "github.com/org/team-repo" from any remote URL form, without credentials or .git.
function normalizeRemote(url) {
  if (!url) return null;
  return url
    .replace(/^[a-z+]+:\/\//i, '')
    .replace(/^[^@/]+@/, '')
    .replace(/:(?!\d+\/)/, '/')
    .replace(/\.git$/, '');
}

let ctxCache;
export function repoContext() {
  return (ctxCache ??= {
    template: loadConfig().repo || null,
    repo: normalizeRemote(tryGit(['remote', 'get-url', 'origin'])) ?? path.basename(REPO_ROOT),
    branch: tryGit(['rev-parse', '--abbrev-ref', 'HEAD']) || null,
    git_email: tryGit(['config', 'user.email']) || null,
    os_user: os.userInfo().username,
  });
}

// Returns the repo-relative path, or null when the file is outside the repo or gitignored
// (node_modules, dist, the organizer backend...), matching what turn and commit diffs see.
export function relPath(file, cwd = REPO_ROOT) {
  if (!file) return null;
  const rel = path.relative(REPO_ROOT, path.resolve(cwd, file));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const posix = rel.split(path.sep).join('/');
  try {
    git(['check-ignore', '-q', '--', posix]);
    return null; // exit 0 = ignored
  } catch {
    return posix;
  }
}

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function readJson(file, fallback = null) {
  const text = readText(file);
  if (text == null) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

export function sha1(text) {
  return createHash('sha1').update(text).digest('hex');
}

const sleeper = new Int32Array(new SharedArrayBuffer(4));

// Cross-process mutex. Gives up after ~3s rather than stall an agent.
export function withLock(lockFile, fn) {
  const deadline = Date.now() + 3000;
  let owned = false;
  while (!owned) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      owned = true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - fs.statSync(lockFile).mtimeMs > 10_000) fs.rmSync(lockFile, { force: true });
      } catch {}
      if (Date.now() > deadline) break;
      Atomics.wait(sleeper, 0, 0, 20);
    }
  }
  try {
    return fn();
  } finally {
    if (owned) fs.rmSync(lockFile, { force: true });
  }
}

export function log(...parts) {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    const line = parts.map((p) => (p instanceof Error ? p.stack : typeof p === 'string' ? p : JSON.stringify(p)));
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line.join(' ')}\n`);
  } catch {}
}

export async function readStdinJson() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

// Hooks must never fail or slow the agent/commit: swallow errors, always exit 0.
// `stdout` is what the host tool expects to read back (e.g. Cursor wants JSON).
export async function runHook(fn, { stdout } = {}) {
  try {
    if (!loadConfig().disabled) await fn();
  } catch (err) {
    log(`[${path.basename(process.argv[1])}]`, err);
  }
  if (stdout !== undefined) process.stdout.write(typeof stdout === 'string' ? stdout : JSON.stringify(stdout));
  process.exit(0);
}
