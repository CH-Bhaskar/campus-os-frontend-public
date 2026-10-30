#!/usr/bin/env node
// Antigravity hooks (wired in .agents/hooks.json, event name passed as argv[2]):
//   PreInvocation -> start turn snapshot + prompt event from lastUserInput
//                    (fires before every model call, so both only once per turn)
//   PostToolUse   -> file_edit event from the edit tool's arguments
//   Stop          -> turn_diff + session_usage from the transcript
// PreToolUse is not used: it must answer allow/deny, which would override the user's approvals.
// Tool and argument names differ between Antigravity builds (write_file/edit_file with
// Path/Content/Target/Replacement vs write_to_file/replace_file_content with TargetFile/
// CodeContent/TargetContent/ReplacementContent), so both spellings are accepted.
import path from 'node:path';
import { readJson, readStdinJson, relPath, runHook, sha1, stateDir, writeJson } from '../lib/env.mjs';
import { diffPairs, diffStrings } from '../lib/diff.mjs';
import { editEvent, emit, promptEvents } from '../lib/spool.mjs';
import { activeTurns, endTurn, startTurn } from '../lib/turn.mjs';
import { antigravityUsage, usageEvents } from '../lib/usage.mjs';

const TOOL = 'antigravity';
// The payload doesn't name the event, so .agents/hooks.json passes it as argv[2] (like Cursor).
const hookName = process.argv[2];

// Some builds pass each argument JSON-encoded ("\"d:\\\\repo\\\\a.ts\"").
function decode(value) {
  if (typeof value !== 'string' || !value.startsWith('"')) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// The typed prompt, without the <USER_REQUEST> wrapper and metadata Antigravity may add.
function userRequest(input) {
  if (typeof input !== 'string') return input;
  return input.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/)?.[1] ?? input;
}

// No pre-image without PreToolUse, so reconstruct the change from the tool arguments.
// Whole-file writes count all their lines as added; the turn diff stays exact.
function diffFromArgs(a) {
  const chunks = decode(a.ReplacementChunks);
  if (Array.isArray(chunks)) return diffPairs(chunks.map((c) => [c.TargetContent ?? '', c.ReplacementContent ?? '']));
  const replacement = decode(a.ReplacementContent ?? a.Replacement);
  if (replacement != null) return diffPairs([[decode(a.TargetContent ?? a.Target) ?? '', replacement]]);
  const content = decode(a.CodeContent ?? a.Content);
  return content == null ? null : diffStrings('', content);
}

runHook(
  async () => {
    const p = await readStdinJson();
    const sid = p.conversationId;
    const meta = { model: p.modelName ?? null };

    switch (hookName) {
      case 'PreInvocation': {
        const active = activeTurns().some(({ turn }) => turn.tool === TOOL && turn.session_id === sid);
        // Every invocation repeats lastUserInput: send it when a turn starts or the text changes.
        const promptFile = path.join(stateDir('prompts'), `${TOOL}--${String(sid ?? 'default').replace(/[^\w.-]/g, '_')}.json`);
        const text = userRequest(p.lastUserInput);
        const hash = typeof text === 'string' ? sha1(text) : null;
        const isNew = hash && (!active || readJson(promptFile)?.hash !== hash);
        if (isNew) writeJson(promptFile, { hash });
        emit([...(active ? [] : startTurn(TOOL, sid, meta)), ...(isNew ? promptEvents({ tool: TOOL, text, session_id: sid, ...meta }) : [])]);
        break;
      }

      case 'PostToolUse': {
        const { name, args = {} } = p.toolCall ?? {};
        const rel = !p.error && relPath(decode(args.TargetFile ?? args.Path), p.workspacePaths?.[0]);
        const diff = rel && diffFromArgs(args);
        if (!diff) break;
        const created = /^write/.test(name) && !decode(args.Overwrite);
        emit([editEvent({ tool: TOOL, file: rel, diff, event: created ? 'file_create' : 'file_edit', source: 'hook', session_id: sid, tool_name: name, ...meta })]);
        break;
      }

      case 'Stop':
        emit([
          ...endTurn(TOOL, sid, { status: p.terminationReason ?? null }),
          ...usageEvents(TOOL, sid, antigravityUsage(p.transcriptPath, p.modelName)),
        ]);
        break;
    }
  },
  { stdout: {} },
);
