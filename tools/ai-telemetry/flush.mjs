#!/usr/bin/env node
// Ships spooled events to the backend. Spawned detached by every hook; also safe to
// run by hand (`npm run telemetry:flush`). Failed batches stay in the spool for next time.
import fs from 'node:fs';
import path from 'node:path';
import { HOME_DIR, SPOOL_DIR, log } from './lib/env.mjs';
import { loadIdentity } from './lib/identity.mjs';
import { countTokens } from './lib/tokens.mjs';

const verbose = process.argv.includes('--verbose');
const MAX_FILES_PER_POST = 100;
const MAX_SPOOL_AGE_MS = 30 * 24 * 3600 * 1000;

async function finalize(obj, sendContent) {
  if (typeof obj._text !== 'string') return;
  obj.chars_written = obj._text.length;
  obj.written_tokens = await countTokens(obj._text);
  if (sendContent) obj.content = obj._text;
  delete obj._text;
}

async function finalizePrompt(obj, sendPrompts) {
  if (typeof obj._prompt !== 'string') return;
  obj.prompt_chars = obj._prompt.length;
  obj.prompt_tokens = await countTokens(obj._prompt);
  if (sendPrompts) obj.prompt = obj._prompt;
  delete obj._prompt;
}

function readBatch(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fs.mkdirSync(path.join(SPOOL_DIR, 'bad'), { recursive: true });
    fs.renameSync(file, path.join(SPOOL_DIR, 'bad', path.basename(file)));
    return null;
  }
}

async function post(endpoint, apiKeyEnv, events) {
  const headers = { 'content-type': 'application/json' };
  // The participant code is the credential; the backend maps it to team + person.
  const key = loadIdentity()?.code ?? (apiKeyEnv && process.env[apiKeyEnv]);
  if (key) headers.authorization = `Bearer ${key}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ events }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${endpoint}`);
}

async function flushOnce() {
  if (!fs.existsSync(SPOOL_DIR)) return { seen: 0, sent: 0 };
  const names = fs
    .readdirSync(SPOOL_DIR)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .slice(0, MAX_FILES_PER_POST);
  const groups = new Map();
  for (const name of names) {
    const file = path.join(SPOOL_DIR, name);
    if (Date.now() - fs.statSync(file).mtimeMs > MAX_SPOOL_AGE_MS) {
      fs.rmSync(file, { force: true });
      continue;
    }
    const batch = readBatch(file);
    if (!batch?.endpoint) continue;
    const key = `${batch.endpoint}\0${batch.api_key_env ?? ''}`;
    if (!groups.has(key)) groups.set(key, { endpoint: batch.endpoint, apiKeyEnv: batch.api_key_env, events: [], files: [] });
    const group = groups.get(key);
    for (const ev of batch.events) {
      await finalize(ev, batch.send_content);
      await finalizePrompt(ev, batch.send_prompts);
      for (const f of ev.files ?? []) await finalize(f, batch.send_content);
      group.events.push(ev);
    }
    group.files.push(file);
  }
  let sent = 0;
  for (const g of groups.values()) {
    await post(g.endpoint, g.apiKeyEnv, g.events);
    for (const f of g.files) fs.rmSync(f, { force: true });
    sent += g.events.length;
  }
  return { seen: names.length, sent };
}

function acquireLock(lock) {
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    if (Date.now() - fs.statSync(lock).mtimeMs < 60_000) return false; // another flush is running
    fs.rmSync(lock, { force: true });
    return acquireLock(lock);
  }
}

fs.mkdirSync(HOME_DIR, { recursive: true });
const lock = path.join(HOME_DIR, 'flush.lock');
// Wait for a running flush instead of exiting: it may have listed the spool before our event landed.
const deadline = Date.now() + 15_000;
while (!acquireLock(lock)) {
  if (Date.now() > deadline) process.exit(0);
  await new Promise((r) => setTimeout(r, 200));
}

let total = 0;
try {
  for (let round = 0; round < 20; round++) {
    const { seen, sent } = await flushOnce();
    total += sent;
    if (!seen || !sent) break;
  }
} catch (err) {
  log('[flush]', err.message);
  if (verbose) console.error(`flush failed: ${err.message} (events kept in ${SPOOL_DIR})`);
  process.exitCode = verbose ? 1 : 0;
} finally {
  fs.rmSync(lock, { force: true });
}
if (verbose && !process.exitCode) console.log(`sent ${total} event(s)`);
