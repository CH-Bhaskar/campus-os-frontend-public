// The ledger remembers which lines (by hash, per file) were written by which AI tool,
// so git hooks can split each commit into AI vs human lines.
// Shape: { files: { [file]: { ts, tools: { [tool]: { [lineHash]: count } } } } }
import path from 'node:path';
import { readJson, sha1, stateDir, withLock, writeJson } from './env.mjs';

const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

const ledgerFile = () => path.join(stateDir(), 'ledger.json');
const lineKey = (line) => sha1(line.trim()).slice(0, 16);

function update(fn) {
  return withLock(`${ledgerFile()}.lock`, () => {
    const ledger = readJson(ledgerFile(), { files: {} });
    const result = fn(ledger);
    writeJson(ledgerFile(), ledger);
    return result;
  });
}

export function recordLedger(tool, files) {
  if (!files.some((f) => f.added_lines.length)) return;
  update((ledger) => {
    const now = Date.now();
    for (const f of files) {
      const lines = f.added_lines.filter((l) => l.trim());
      if (!lines.length) continue;
      const entry = (ledger.files[f.file] ??= { ts: now, tools: {} });
      entry.ts = now;
      const hashes = (entry.tools[tool] ??= {});
      for (const line of lines) hashes[lineKey(line)] = (hashes[lineKey(line)] ?? 0) + 1;
    }
    for (const [file, entry] of Object.entries(ledger.files)) {
      if (now - entry.ts > MAX_AGE_MS) delete ledger.files[file];
    }
  });
}

// How many of `lines` are already credited to some tool in `file` (each ledger hit used once).
export function creditedCount(file, lines) {
  const tools = structuredClone(readJson(ledgerFile(), { files: {} }).files[file]?.tools ?? {});
  let n = 0;
  for (const line of lines) {
    const key = lineKey(line);
    const hashes = Object.values(tools).find((h) => h[key] > 0);
    if (hashes) {
      hashes[key]--;
      n++;
    }
  }
  return n;
}

// Classifies the non-blank added lines of each file as AI (by tool) or human.
// With consume=true, matched lines are removed from the ledger (used by post-commit).
export function attribute(files, { consume = false } = {}) {
  const run = (ledger) =>
    files.map((f) => {
      const tools = ledger.files[f.file]?.tools ?? {};
      const aiByTool = {};
      let nonblank = 0;
      for (const line of f.added_lines) {
        if (!line.trim()) continue;
        nonblank++;
        const key = lineKey(line);
        for (const [tool, hashes] of Object.entries(tools)) {
          if (hashes[key] > 0) {
            if (--hashes[key] === 0) delete hashes[key];
            aiByTool[tool] = (aiByTool[tool] ?? 0) + 1;
            break;
          }
        }
      }
      const ai = Object.values(aiByTool).reduce((a, b) => a + b, 0);
      return {
        file: f.file,
        lines_added: f.lines_added,
        lines_removed: f.lines_removed,
        nonblank_added: nonblank,
        ai_lines: ai,
        human_lines: nonblank - ai,
        ai_by_tool: aiByTool,
      };
    });
  if (consume) return update(run);
  return run(structuredClone(readJson(ledgerFile(), { files: {} })));
}

export function summarize(perFile) {
  const total = { lines_added: 0, lines_removed: 0, nonblank_added: 0, ai_lines: 0, human_lines: 0, ai_by_tool: {} };
  for (const f of perFile) {
    for (const k of ['lines_added', 'lines_removed', 'nonblank_added', 'ai_lines', 'human_lines']) total[k] += f[k];
    for (const [tool, n] of Object.entries(f.ai_by_tool)) total.ai_by_tool[tool] = (total.ai_by_tool[tool] ?? 0) + n;
  }
  return total;
}
