#!/usr/bin/env node
// Receives large inserts / pastes detected by the ai-paste-tracker editor extension.
// stdin: { kind: 'paste' | 'insert', tool, file (absolute), text, app }
//     or { kind: 'ready', tool, app, version } once per editor session (extension is installed).
import { readStdinJson, relPath, runHook } from '../lib/env.mjs';
import { recordLedger } from '../lib/ledger.mjs';
import { emit } from '../lib/spool.mjs';
import { activeTurns } from '../lib/turn.mjs';

runHook(async () => {
  const p = await readStdinJson();
  if (p.kind === 'ready') {
    emit([{ event: 'editor_ready', source: 'editor', tool: p.tool, editor: p.app ?? null, extension_version: p.version ?? null }]);
    return;
  }
  const rel = relPath(p.file);
  if (!rel || !p.text) return;
  const lines = p.text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  // While an agent turn is running its own turn diff credits these lines; avoid double counting.
  const duringAgentTurn = activeTurns().length > 0;
  if (!duringAgentTurn) recordLedger(p.tool, [{ file: rel, added_lines: lines }]);
  emit([
    {
      event: p.kind === 'paste' ? 'paste' : 'editor_insert',
      source: 'editor',
      tool: p.tool,
      editor: p.app ?? null,
      file: rel,
      lines_added: lines.length,
      lines_removed: 0,
      during_agent_turn: duringAgentTurn,
      _text: p.text,
    },
  ]);
});
