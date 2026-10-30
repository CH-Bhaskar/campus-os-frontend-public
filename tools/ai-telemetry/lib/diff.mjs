// Line-level diff stats. Every diff is normalised to
// { file, lines_added, lines_removed, added_lines: string[] }.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function entry(map, file) {
  if (!map.has(file)) map.set(file, { file, lines_added: 0, lines_removed: 0, added_lines: [] });
  return map.get(file);
}

// Parses `git diff -U0` output (also works for `git diff-tree -p` / `git show`).
export function parseUnifiedDiff(out) {
  const files = new Map();
  let cur = null;
  let oldPath = null;
  let inHeader = false;
  for (const line of out.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHeader = true;
      cur = null;
      oldPath = null;
      continue;
    }
    if (inHeader) {
      if (line.startsWith('--- ')) oldPath = line.slice(4).replace(/^a\//, '');
      else if (line.startsWith('+++ ')) {
        const newPath = line.slice(4);
        cur = entry(files, newPath === '/dev/null' ? oldPath : newPath.replace(/^b\//, ''));
      } else if (line.startsWith('@@')) inHeader = false;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('+')) {
      cur.lines_added++;
      cur.added_lines.push(line.slice(1));
    } else if (line.startsWith('-')) cur.lines_removed++;
  }
  return [...files.values()];
}

// Parses the Codex `apply_patch` envelope (*** Begin Patch / *** Update File: ...).
export function parseApplyPatch(patch) {
  const files = new Map();
  let cur = null;
  for (const line of patch.split('\n')) {
    const header = line.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (header) {
      cur = entry(files, header[2].trim());
      cur.kind = header[1].toLowerCase();
      continue;
    }
    const move = line.match(/^\*\*\* Move to: (.+)$/);
    if (move && cur) {
      files.delete(cur.file);
      cur.file = move[1].trim();
      files.set(cur.file, cur);
      continue;
    }
    if (!cur || line.startsWith('***')) continue;
    if (line.startsWith('+')) {
      cur.lines_added++;
      cur.added_lines.push(line.slice(1));
    } else if (line.startsWith('-')) cur.lines_removed++;
  }
  return [...files.values()];
}

function splitLines(text) {
  if (!text) return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

// Diff two in-memory versions of a file using git's diff engine.
export function diffStrings(oldText, newText) {
  oldText ??= '';
  newText ??= '';
  if (oldText === newText) return { lines_added: 0, lines_removed: 0, added_lines: [] };
  if (!oldText || !newText) {
    const added = splitLines(newText);
    return { lines_added: added.length, lines_removed: splitLines(oldText).length, added_lines: added };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tel-'));
  let out = '';
  try {
    fs.writeFileSync(path.join(dir, 'a'), oldText);
    fs.writeFileSync(path.join(dir, 'b'), newText);
    out = execFileSync('git', ['diff', '--no-index', '-U0', '--no-color', '--no-ext-diff', 'a', 'b'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 256 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (err) {
    out = err.stdout ?? ''; // git diff --no-index exits 1 when the files differ
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const [file] = parseUnifiedDiff(out);
  return file ?? { lines_added: 0, lines_removed: 0, added_lines: [] };
}

// Sum several old/new string pairs (Cursor `edits`, Claude MultiEdit, ...).
export function diffPairs(pairs) {
  const total = { lines_added: 0, lines_removed: 0, added_lines: [] };
  for (const [oldText, newText] of pairs) {
    const d = diffStrings(oldText, newText);
    total.lines_added += d.lines_added;
    total.lines_removed += d.lines_removed;
    total.added_lines.push(...d.added_lines);
  }
  return total;
}
