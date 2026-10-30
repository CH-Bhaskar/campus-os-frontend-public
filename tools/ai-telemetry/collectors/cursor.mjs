#!/usr/bin/env node
// Cursor hooks (wired in .cursor/hooks.json, event name passed as argv[2]):
//   beforeSubmitPrompt -> start turn snapshot + prompt event (must answer {"continue": true})
//   afterFileEdit      -> file_edit event for agent edits
//   afterTabFileEdit   -> file_edit event for Cursor Tab completions (+ ledger)
//   stop               -> turn_diff
// Cursor exposes no token usage to hooks; use the Cursor Admin API for that.
import { readStdinJson, relPath, runHook } from '../lib/env.mjs';
import { diffPairs } from '../lib/diff.mjs';
import { recordLedger } from '../lib/ledger.mjs';
import { editEvent, emit, promptEvents } from '../lib/spool.mjs';
import { activeTurns, endTurn, startTurn } from '../lib/turn.mjs';

const hookName = process.argv[2];

runHook(
  async () => {
    const p = await readStdinJson();
    const sid = p.conversation_id;
    const meta = { model: p.model ?? null, agent_version: p.cursor_version ?? null };

    switch (hookName ?? p.hook_event_name) {
      case 'beforeSubmitPrompt':
        emit([...startTurn('cursor', sid, { model: meta.model }), ...promptEvents({ tool: 'cursor', text: p.prompt, session_id: sid, ...meta })]);
        break;

      case 'afterFileEdit':
      case 'afterTabFileEdit': {
        const rel = relPath(p.file_path, p.workspace_roots?.[0]);
        if (!rel) break;
        const tab = (hookName ?? p.hook_event_name) === 'afterTabFileEdit';
        const tool = tab ? 'cursor-tab' : 'cursor';
        const diff = diffPairs((p.edits ?? []).map((e) => [e.old_string ?? '', e.new_string ?? '']));
        // Agent edits are credited by the turn diff; Tab completions happen outside turns.
        if (tab && !activeTurns().length) recordLedger(tool, [{ file: rel, ...diff }]);
        emit([editEvent({ tool, file: rel, diff, source: 'hook', session_id: sid, ...meta })]);
        break;
      }

      case 'stop':
        emit(endTurn('cursor', sid, { status: p.status }));
        break;
    }
  },
  { stdout: hookName === 'beforeSubmitPrompt' ? { continue: true } : {} },
);
