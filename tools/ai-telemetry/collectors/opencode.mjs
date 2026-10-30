#!/usr/bin/env node
// OpenCode (forwarded by .opencode/plugin/ai-telemetry.js, event name passed as argv[2]).
// OpenCode's plugin API changes between major versions, so this collector depends on nothing
// but "a tool is about to run" / "a tool finished": after each tool call it diffs the working
// tree against the previous checkpoint. No tool names or argument shapes are parsed, so new
// tools, renamed arguments and shell edits are all covered.
//   tool.before -> open the turn (snapshot) if none is open for this session
//   tool.after  -> file_edit per changed file since the last checkpoint (+ ledger credit)
//   prompt      -> prompt event; closes a turn still open (turn_diff) and reports new tokens
//   idle        -> close the turn (turn_diff) + session_usage: 1.x message totals, or on 2.x the
//                  growth of the session's cumulative totals since the last report
import fs from 'node:fs';
import path from 'node:path';
import { readJson, readStdinJson, runHook, stateDir, withLock, writeJson } from '../lib/env.mjs';
import { recordLedger } from '../lib/ledger.mjs';
import { editEvent, emit, promptEvents } from '../lib/spool.mjs';
import { diffTrees, snapshotTree } from '../lib/turn.mjs';
import { usageEvents } from '../lib/usage.mjs';

const TOOL = 'opencode';
const hookName = process.argv[2];
const stateFile = (sid) => path.join(stateDir('opencode'), `${String(sid ?? 'default').replace(/[^\w.-]/g, '_')}.json`);

// 2.x hands over the session's cumulative token totals (ctx.session.get): report only what was
// added since the last report, so repeated reads and restarts never count tokens twice.
function usageSince(sid, totals, model) {
  if (!totals) return [];
  const file = path.join(stateDir('opencode-usage'), `${String(sid ?? 'default').replace(/[^\w.-]/g, '_')}.json`);
  const now = {
    input: totals.input ?? 0,
    output: (totals.output ?? 0) + (totals.reasoning ?? 0),
    cache_read: totals.cache?.read ?? 0,
    cache_write: totals.cache?.write ?? 0,
  };
  const prev = readJson(file, {});
  writeJson(file, now);
  const delta = (k) => Math.max(0, now[k] - (prev[k] ?? 0));
  if (!delta('input') && !delta('output') && !delta('cache_read') && !delta('cache_write')) return [];
  return [
    {
      model: model ?? 'unknown',
      input_tokens: delta('input'),
      output_tokens: delta('output'),
      cache_read_tokens: delta('cache_read'),
      cache_creation_tokens: delta('cache_write'),
    },
  ];
}

function closeTurn(file, turn) {
  fs.rmSync(file, { force: true });
  const files = Object.entries(turn.files);
  if (!files.length) return [];
  return [
    {
      event: 'turn_diff',
      source: 'turn',
      tool: TOOL,
      session_id: turn.session_id,
      model: turn.model ?? null,
      started_at: turn.started_at,
      lines_added: files.reduce((n, [, f]) => n + f.lines_added, 0),
      lines_removed: files.reduce((n, [, f]) => n + f.lines_removed, 0),
      files: files.map(([name, f]) => ({ file: name, lines_added: f.lines_added, lines_removed: f.lines_removed, _text: f.text })),
    },
  ];
}

runHook(async () => {
  const p = await readStdinJson();
  const sid = p.session_id;
  const file = stateFile(sid);
  // Parallel tool calls finish at the same time: one checkpoint at a time per session, so each
  // change is reported (and credited to the ledger) exactly once.
  withLock(`${file}.lock`, () => handle(p, sid, file, readJson(file)));
});

function handle(p, sid, file, turn) {
  switch (hookName) {
    case 'tool.before':
      if (!turn) writeJson(file, { session_id: sid, model: p.model ?? null, tree: snapshotTree(), started_at: new Date().toISOString(), files: {} });
      break;

    case 'tool.after': {
      if (!turn) break;
      const tree = snapshotTree();
      const changed = diffTrees(turn.tree, tree);
      if (!changed.length) break;
      recordLedger(TOOL, changed);
      for (const f of changed) {
        const acc = (turn.files[f.file] ??= { lines_added: 0, lines_removed: 0, text: '' });
        acc.lines_added += f.lines_added;
        acc.lines_removed += f.lines_removed;
        acc.text += (acc.text && f.added_lines.length ? '\n' : '') + f.added_lines.join('\n');
      }
      writeJson(file, { ...turn, tree, model: turn.model ?? p.model ?? null });
      emit(changed.map((f) => editEvent({ tool: TOOL, file: f.file, diff: f, source: 'checkpoint', session_id: sid, tool_name: p.tool ?? null, model: turn.model ?? p.model ?? null })));
      break;
    }

    case 'prompt':
      emit([
        ...(turn ? closeTurn(file, turn) : []),
        ...promptEvents({ tool: TOOL, text: p.prompt, session_id: sid, model: p.model ?? null }),
        ...usageEvents(TOOL, sid, usageSince(sid, p.totals, p.model)),
      ]);
      break;

    case 'idle':
      emit([...(turn ? closeTurn(file, turn) : []), ...usageEvents(TOOL, sid, [...(p.usage ?? []), ...usageSince(sid, p.totals, p.model)])]);
      break;
  }
}
