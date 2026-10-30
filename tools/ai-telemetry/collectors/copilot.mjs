#!/usr/bin/env node
// GitHub Copilot agent hooks (VS Code agent / Copilot CLI, wired in .github/hooks/ai-telemetry.json,
// event name passed as argv[2]):
//   userPromptSubmitted -> start turn snapshot + prompt event
//   preToolUse          -> save pre-image of the file about to be edited (prints nothing, so approvals are untouched)
//   postToolUse         -> file_edit event (exact diff vs pre-image, or parsed from apply_patch)
//   agentStop           -> turn_diff
// Copilot exposes no token usage to hooks. Payload fields are camelCase (toolName/toolArgs,
// toolArgs often a JSON string); the snake_case spellings are accepted too.
import path from 'node:path';
import { readStdinJson, readText, relPath, runHook } from '../lib/env.mjs';
import { diffPairs, diffStrings, parseApplyPatch } from '../lib/diff.mjs';
import { savePreImage, takePreImage } from '../lib/preimage.mjs';
import { editEvent, emit, promptEvents } from '../lib/spool.mjs';
import { activeTurns, endTurn, startTurn } from '../lib/turn.mjs';

const TOOL = 'copilot';
const hookName = process.argv[2];
const EDIT_TOOLS = new Set(['edit', 'str_replace', 'insert', 'create', 'str_replace_editor', 'apply_patch', 'git_apply_patch']);

function parseArgs(value) {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return { input: value };
  }
}

// Fallback when no pre-image exists: reconstruct the change from the tool arguments.
function diffFromArgs(a) {
  if (a.old_str != null) return diffPairs([[a.old_str, a.new_str ?? '']]);
  const content = a.file_text ?? a.new_str ?? a.content;
  return content == null ? null : diffStrings('', content);
}

runHook(async () => {
  const p = await readStdinJson();
  const sid = p.sessionId ?? p.session_id ?? 'default';
  const cwd = p.cwd ?? process.cwd();
  const toolName = p.toolName ?? p.tool_name;
  const args = parseArgs(p.toolArgs ?? p.tool_input);
  const file = typeof args.path === 'string' ? path.resolve(cwd, args.path) : null;
  const isPatch = /apply_patch/.test(toolName ?? '');

  switch (hookName) {
    case 'userPromptSubmitted': {
      const active = activeTurns().some(({ turn }) => turn.tool === TOOL && turn.session_id === sid);
      emit([...(active ? [] : startTurn(TOOL, sid)), ...promptEvents({ tool: TOOL, text: p.prompt, session_id: sid })]);
      break;
    }

    case 'preToolUse':
      if (EDIT_TOOLS.has(toolName) && !isPatch && file && relPath(file)) savePreImage(sid, file);
      break;

    case 'postToolUse': {
      if (!EDIT_TOOLS.has(toolName) || /failure|denied|rejected/.test(p.toolResult?.resultType ?? '')) break;
      const meta = { source: 'hook', session_id: sid, tool_name: toolName };
      if (isPatch) {
        const events = [];
        for (const f of parseApplyPatch(args.input ?? args.patch ?? '')) {
          const rel = relPath(f.file, cwd);
          if (!rel) continue;
          const event = f.kind === 'add' ? 'file_create' : f.kind === 'delete' ? 'file_delete' : 'file_edit';
          events.push(editEvent({ tool: TOOL, file: rel, diff: f, event, ...meta }));
        }
        emit(events);
        break;
      }
      const rel = relPath(file);
      if (!rel) break;
      const pre = takePreImage(sid, file);
      const diff = pre ? diffStrings(pre.content, readText(file)) : diffFromArgs(args);
      if (!diff) break;
      const created = pre?.content == null && (toolName === 'create' || args.command === 'create');
      emit([editEvent({ tool: TOOL, file: rel, diff, event: created ? 'file_create' : 'file_edit', ...meta })]);
      break;
    }

    case 'agentStop':
      emit(endTurn(TOOL, sid));
      break;
  }
});
