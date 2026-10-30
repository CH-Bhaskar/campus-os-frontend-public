#!/usr/bin/env node
// Claude Code hooks (wired in .claude/settings.json):
//   UserPromptSubmit -> start turn snapshot + prompt event
//   PreToolUse       -> save pre-image of the file about to be edited
//   PostToolUse      -> file_edit event (exact diff vs pre-image)
//   Stop             -> turn_diff + session_usage from the transcript
//   SubagentStop     -> session_usage from the subagent transcript
import path from 'node:path';
import { readStdinJson, readText, relPath, runHook } from '../lib/env.mjs';
import { diffPairs, diffStrings } from '../lib/diff.mjs';
import { savePreImage, takePreImage } from '../lib/preimage.mjs';
import { editEvent, emit, promptEvents } from '../lib/spool.mjs';
import { endTurn, startTurn } from '../lib/turn.mjs';
import { claudeUsage, usageEvents } from '../lib/usage.mjs';

const TOOL = 'claude-code';

// Fallback when no pre-image exists: reconstruct the change from the tool input.
function diffFromInput(input) {
  if (Array.isArray(input.edits)) return diffPairs(input.edits.map((e) => [e.old_string, e.new_string]));
  if ('old_string' in input) return diffPairs([[input.old_string, input.new_string]]);
  return diffStrings('', input.content ?? input.new_source ?? '');
}

runHook(async () => {
  const p = await readStdinJson();
  const sid = p.session_id;
  const input = p.tool_input ?? {};
  const absFile = input.file_path ?? input.notebook_path;
  const file = absFile && path.resolve(p.cwd ?? process.cwd(), absFile);

  switch (p.hook_event_name) {
    case 'UserPromptSubmit':
      emit([...startTurn(TOOL, sid), ...promptEvents({ tool: TOOL, text: p.prompt, session_id: sid })]);
      break;

    case 'PreToolUse':
      if (file && relPath(file)) savePreImage(sid, file);
      break;

    case 'PostToolUse': {
      const rel = relPath(file);
      if (!rel) break;
      const pre = takePreImage(sid, file);
      const diff = pre ? diffStrings(pre.content, readText(file)) : diffFromInput(input);
      const event = pre?.content == null && p.tool_name === 'Write' ? 'file_create' : 'file_edit';
      emit([editEvent({ tool: TOOL, file: rel, diff, event, source: 'hook', session_id: sid, tool_name: p.tool_name })]);
      break;
    }

    case 'Stop':
      emit([...endTurn(TOOL, sid), ...usageEvents(TOOL, sid, claudeUsage(p.transcript_path))]);
      break;

    case 'SubagentStop':
      emit(usageEvents(TOOL, sid, claudeUsage(p.agent_transcript_path), { subagent: p.agent_type ?? true }));
      break;
  }
});
