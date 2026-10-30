#!/usr/bin/env node
// Editor-independent paste detection. Keeps the last few clipboard contents in memory (never on
// disk), polls `git status` for changed files, and reports a `paste` (source: 'watcher') when the
// lines a save added match something that was on the clipboard. Works for any editor or tool that
// writes files (JetBrains, Zed, Notepad, Vim, `cat > file`...), but only sees pastes once saved.
// Skips agent turns (credited to the agent) and lines the editor extension already reported.
//
//   --run     the watcher itself (spawned detached by ensureWatcher)
//   --ensure  start it if it is not running (npm postinstall / predev)
//   --status  print whether it is running
//   --stop    stop it
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { REPO_ROOT, excludePathspecs, git, log, readJson, withLock, writeJson } from './lib/env.mjs';
import { diffStrings } from './lib/diff.mjs';
import { creditedCount, recordLedger } from './lib/ledger.mjs';
import { emit } from './lib/spool.mjs';
import { activeTurns } from './lib/turn.mjs';
import { WATCHER_SCRIPT, ensureWatcher, isAlive, watcherEnabled, watcherFile } from './lib/watcher.mjs';

const POLL_FILES_MS = 1500;
const POLL_CLIPBOARD_MS = 1000;
const CLIP_TTL_MS = 30 * 60 * 1000; // a paste may be saved long after it was copied
const MAX_CLIPS = 20;
const MAX_CLIP_CHARS = 200_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
// Same thresholds as the editor extension (aiPasteTracker.minChars / minLines).
const MIN_CHARS = 120;
const MIN_LINES = 3;
// Share of the clipboard's meaningful lines that must show up in the save.
const MIN_MATCH = 0.6;

const isWin = process.platform === 'win32';
const scriptMtime = () => fs.statSync(WATCHER_SCRIPT).mtimeMs;

// ---- clipboard -------------------------------------------------------------------------------

const clips = []; // { ts, lines: trimmed non-blank lines }

function onClipboard(text) {
  if (!text || text.length > MAX_CLIP_CHARS) return;
  text = text.replace(/\r\n/g, '\n');
  if (text.length < MIN_CHARS && text.split('\n').length < MIN_LINES) return;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return;
  clips.push({ ts: Date.now(), lines });
  if (clips.length > MAX_CLIPS) clips.shift();
}

function onPath(name) {
  return (process.env.PATH ?? '').split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, name)));
}

// One long-lived PowerShell that prints the clipboard (base64) whenever it changes and exits
// when the watcher is gone, so no PowerShell is spawned per poll.
function watchWindowsClipboard() {
  const script = `$p=${process.pid};$last=$null
while($true){
  if(-not (Get-Process -Id $p -ErrorAction SilentlyContinue)){exit}
  try{$t=Get-Clipboard -Raw -ErrorAction Stop}catch{$t=$null}
  if($t -ne $last){$last=$t;if($t){[Console]::Out.WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t)));[Console]::Out.Flush()}}
  Start-Sleep -Milliseconds ${POLL_CLIPBOARD_MS}
}`;
  const start = () => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    ps.on('error', (err) => log('[paste-watcher] powershell', err));
    ps.on('exit', () => setTimeout(start, 5000).unref());
    readline.createInterface({ input: ps.stdout }).on('line', (line) => {
      if (line) onClipboard(Buffer.from(line, 'base64').toString('utf8'));
    });
    process.on('exit', () => ps.kill());
  };
  start();
  return true;
}

function clipboardCommand() {
  if (process.platform === 'darwin') return ['pbpaste'];
  if (process.env.WAYLAND_DISPLAY && onPath('wl-paste')) return ['wl-paste', '--no-newline'];
  if (onPath('xclip')) return ['xclip', '-selection', 'clipboard', '-o'];
  if (onPath('xsel')) return ['xsel', '--clipboard', '--output'];
  if (onPath('wl-paste')) return ['wl-paste', '--no-newline'];
  return null;
}

function watchClipboard() {
  if (isWin) return watchWindowsClipboard();
  const cmd = clipboardCommand();
  if (!cmd) return false;
  let last = null;
  setInterval(() => {
    execFile(cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 2000, maxBuffer: MAX_CLIP_CHARS * 4, windowsHide: true }, (err, out) => {
      if (err || out === last) return;
      last = out;
      onClipboard(out);
    });
  }, POLL_CLIPBOARD_MS);
  return true;
}

// ---- files -----------------------------------------------------------------------------------

const seen = new Map(); // repo-relative path -> { mtimeMs, size, text }

function changedFiles() {
  // --no-optional-locks: never take index.lock, so the student's own git commands don't collide.
  const out = git(['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--', '.', ...excludePathspecs()]);
  return out
    .split('\0')
    .filter((e) => e.length > 3 && !e.slice(0, 2).includes('D'))
    .map((e) => e.slice(3));
}

function readFile(rel) {
  try {
    const abs = path.join(REPO_ROOT, rel);
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
    const prev = seen.get(rel);
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) return { unchanged: true };
    const text = fs.readFileSync(abs, 'utf8');
    if (text.includes('\0')) return null; // binary
    return { mtimeMs: st.mtimeMs, size: st.size, text: text.replace(/\r\n/g, '\n') };
  } catch {
    return null;
  }
}

// Content before the first change we saw: the staged version, or nothing for a new file.
function baseline(rel) {
  try {
    return git(['show', `:${rel}`]).replace(/\r\n/g, '\n');
  } catch {
    return '';
  }
}

const meaningful = (line) => line.length >= 4; // `}` or `);` alone prove nothing

// Blocks of added lines that came from a clipboard entry (newest entry first).
function matchClips(added) {
  const pool = new Map(); // trimmed line -> original lines still unclaimed
  for (const line of added) {
    const key = line.trim();
    if (!key) continue;
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(line);
  }
  const blocks = [];
  const now = Date.now();
  for (const clip of [...clips].reverse()) {
    if (now - clip.ts > CLIP_TTL_MS) continue;
    const taken = [];
    let wanted = 0;
    let hits = 0;
    for (const key of clip.lines) {
      if (meaningful(key)) wanted++;
      const bucket = pool.get(key);
      if (!bucket?.length) continue;
      taken.push([key, bucket.shift()]);
      if (meaningful(key)) hits++;
    }
    const chars = taken.reduce((n, [, line]) => n + line.length, 0);
    if (hits > 0 && hits >= Math.ceil(wanted * MIN_MATCH) && (taken.length >= MIN_LINES || chars >= MIN_CHARS)) {
      blocks.push(taken.map(([, line]) => line));
    } else {
      for (const [key, line] of taken) pool.get(key).unshift(line);
    }
  }
  return blocks;
}

function tick({ seed = false } = {}) {
  const files = changedFiles();
  let agentBusy = null;
  for (const rel of files) {
    const cur = readFile(rel);
    if (!cur || cur.unchanged) continue;
    const before = seen.get(rel)?.text ?? (seed ? null : baseline(rel));
    seen.set(rel, cur);
    if (before == null || !clips.length) continue;
    // An agent writing the code a student pasted into its prompt is the agent's work.
    agentBusy ??= activeTurns().length > 0;
    if (agentBusy) continue;
    const { added_lines } = diffStrings(before, cur.text);
    if (!added_lines.length) continue;
    for (const block of matchClips(added_lines)) {
      // Already reported by the editor extension (or written by an agent earlier).
      if (creditedCount(rel, block) >= block.length * 0.8) continue;
      recordLedger('paste', [{ file: rel, added_lines: block }]);
      emit([
        {
          event: 'paste',
          source: 'watcher',
          tool: 'paste',
          editor: null,
          file: rel,
          lines_added: block.length,
          lines_removed: 0,
          during_agent_turn: false,
          _text: block.join('\n'),
        },
      ]);
    }
  }
}

// ---- lifecycle -------------------------------------------------------------------------------

function claim() {
  return withLock(`${watcherFile()}.lock`, () => {
    const state = readJson(watcherFile(), {});
    if (state.pid && state.pid !== process.pid && isAlive(state.pid)) return false;
    writeJson(watcherFile(), { pid: process.pid, started_at: new Date().toISOString(), repo: REPO_ROOT });
    return true;
  });
}

function release() {
  try {
    if (readJson(watcherFile(), {}).pid === process.pid) fs.rmSync(watcherFile(), { force: true });
  } catch {}
}

function run() {
  if (!watcherEnabled() || !claim()) return;
  if (!watchClipboard()) {
    const reason = 'no clipboard tool found (install xclip, xsel or wl-clipboard)';
    writeJson(watcherFile(), { pid: null, unavailable: reason, ts: new Date().toISOString() });
    log('[paste-watcher]', reason);
    return;
  }
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));

  try {
    tick({ seed: true }); // files already modified before we started are the baseline, not pastes
  } catch (err) {
    log('[paste-watcher]', err);
  }
  const startedMtime = scriptMtime();
  let busy = false;
  setInterval(() => {
    if (busy) return;
    busy = true;
    try {
      // Updated by a pull: exit so the next hook starts the new version. Also stop if the clone is gone.
      if (!fs.existsSync(WATCHER_SCRIPT) || scriptMtime() !== startedMtime) process.exit(0);
      if (readJson(watcherFile(), {}).pid !== process.pid) process.exit(0); // replaced or --stop
      tick();
    } catch (err) {
      log('[paste-watcher]', err);
    } finally {
      busy = false;
    }
  }, POLL_FILES_MS);
}

function status() {
  const state = readJson(watcherFile(), {});
  if (isAlive(state.pid)) console.log(`[ai-telemetry] paste watcher running (pid ${state.pid}, since ${state.started_at})`);
  else if (state.unavailable) console.log(`[ai-telemetry] paste watcher unavailable: ${state.unavailable}`);
  else console.log('[ai-telemetry] paste watcher not running (starts with the next hook, `npm run dev`, or --ensure)');
}

function stop() {
  const state = readJson(watcherFile(), {});
  fs.rmSync(watcherFile(), { force: true });
  if (isAlive(state.pid)) {
    try {
      process.kill(state.pid);
    } catch {}
    console.log(`[ai-telemetry] stopped paste watcher (pid ${state.pid})`);
  }
}

const arg = process.argv[2];
if (arg === '--run') run();
else if (arg === '--status') status();
else if (arg === '--stop') stop();
else ensureWatcher();
