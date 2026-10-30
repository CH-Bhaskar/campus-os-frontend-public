#!/usr/bin/env node
// Codex CLI hooks (wired in .codex/config.toml; Codex loads them only for trusted projects):
//   UserPromptSubmit -> start turn snapshot + prompt event
//   PostToolUse      -> file_edit events parsed from the apply_patch envelope
//   Stop             -> turn_diff + session_usage from the rollout transcript
import { readStdinJson, relPath, runHook } from '../lib/env.mjs';
import { parseApplyPatch } from '../lib/diff.mjs';
import { editEvent, emit, promptEvents } from '../lib/spool.mjs';
import { endTurn, startTurn } from '../lib/turn.mjs';
import { codexUsage, usageEvents } from '../lib/usage.mjs';

const TOOL = 'codex';

function patchText(input) {
  const cmd = input?.command ?? input?.patch ?? input?.input;
  if (Array.isArray(cmd)) return cmd.find((c) => typeof c === 'string' && c.includes('*** Begin Patch')) ?? '';
  return typeof cmd === 'string' ? cmd : '';
}

runHook(async () => {
  const p = await readStdinJson();
  const sid = p.session_id;
  const meta = { session_id: sid, model: p.model ?? null, turn_id: p.turn_id ?? null };

  switch (p.hook_event_name) {
    case 'UserPromptSubmit':
      emit([...startTurn(TOOL, sid, { model: meta.model }), ...promptEvents({ tool: TOOL, text: p.prompt, ...meta })]);
      break;

    case 'PostToolUse': {
      const events = [];
      for (const f of parseApplyPatch(patchText(p.tool_input))) {
        const rel = relPath(f.file, p.cwd);
        if (!rel) continue;
        const event = f.kind === 'add' ? 'file_create' : f.kind === 'delete' ? 'file_delete' : 'file_edit';
        events.push(editEvent({ tool: TOOL, file: rel, diff: f, event, source: 'hook', tool_name: p.tool_name, ...meta }));
      }
      emit(events);
      break;
    }

    case 'Stop':
      emit([...endTurn(TOOL, sid), ...usageEvents(TOOL, sid, codexUsage(p.transcript_path, p.model))]);
      break;
  }
});
