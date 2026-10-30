// Turn snapshots: capture the whole working tree as a git tree object when an agent
// turn starts and diff it when the turn ends. This catches every change the agent made,
// including ones made through shell commands that per-edit hooks never see.
import fs from 'node:fs';
import path from 'node:path';
import { excludePathspecs, git, gitDir, readJson, stateDir, writeJson } from './env.mjs';
import { parseUnifiedDiff } from './diff.mjs';
import { recordLedger } from './ledger.mjs';

const STALE_MS = 6 * 3600 * 1000;

const turnFile = (tool, sessionId) =>
  path.join(stateDir('turns'), `${tool}--${String(sessionId ?? 'default').replace(/[^\w.-]/g, '_')}.json`);

export function snapshotTree() {
  // Seed a throwaway index from the real one so unchanged files reuse cached stat info.
  const index = path.join(stateDir(), `index-${process.pid}-${Date.now()}`);
  try {
    fs.copyFileSync(path.join(gitDir(), 'index'), index);
  } catch {}
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(['add', '-A', '--', '.'], { env });
    return git(['write-tree'], { env }).trim();
  } finally {
    fs.rmSync(index, { force: true });
  }
}

export function diffTrees(from, to) {
  if (from === to) return [];
  const out = git(['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', from, to, '--', '.', ...excludePathspecs()]);
  return parseUnifiedDiff(out);
}

function turnDiffEvent(turn, files, extra) {
  return {
    event: 'turn_diff',
    source: 'turn',
    tool: turn.tool,
    session_id: turn.session_id,
    model: turn.model ?? null,
    started_at: turn.started_at,
    lines_added: files.reduce((n, f) => n + f.lines_added, 0),
    lines_removed: files.reduce((n, f) => n + f.lines_removed, 0),
    files: files.map((f) => ({
      file: f.file,
      lines_added: f.lines_added,
      lines_removed: f.lines_removed,
      _text: f.added_lines.join('\n'),
    })),
    ...extra,
  };
}

// Diff a turn up to now, credit its added lines to the tool in the ledger, and either
// close the turn or move its baseline forward (partial checkpoint, e.g. before a commit).
function settle(file, turn, { partial = false, ...extra } = {}) {
  const tree = snapshotTree();
  const files = diffTrees(turn.tree, tree);
  recordLedger(turn.tool, files);
  if (partial) writeJson(file, { ...turn, tree });
  else fs.rmSync(file, { force: true });
  return files.length ? turnDiffEvent(turn, files, { partial, ...extra }) : null;
}

// Returns events to emit (an unfinished previous turn is closed as interrupted).
export function startTurn(tool, sessionId, extra = {}) {
  const file = turnFile(tool, sessionId);
  const prev = readJson(file);
  const events = [];
  if (prev) {
    const ev = settle(file, prev, { interrupted: true });
    if (ev) events.push(ev);
  }
  writeJson(file, { tool, session_id: sessionId, tree: snapshotTree(), started_at: new Date().toISOString(), ...extra });
  return events;
}

export function endTurn(tool, sessionId, extra = {}) {
  const file = turnFile(tool, sessionId);
  const turn = readJson(file);
  if (!turn) return [];
  const ev = settle(file, { ...turn, ...extra });
  return ev ? [ev] : [];
}

export function activeTurns() {
  const dir = stateDir('turns');
  const turns = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    const turn = readJson(file);
    if (!turn || Date.now() - Date.parse(turn.started_at) > STALE_MS) fs.rmSync(file, { force: true });
    else turns.push({ file, turn });
  }
  return turns;
}

// Called before a commit so that agent edits made mid-turn are attributed to the agent.
export function checkpointActiveTurns() {
  return activeTurns()
    .map(({ file, turn }) => settle(file, turn, { partial: true }))
    .filter(Boolean);
}
