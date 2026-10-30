#!/usr/bin/env node
// Gemini CLI hooks (wired in .gemini/settings.json):
//   BeforeAgent -> start turn snapshot + prompt event
//   BeforeTool  -> save pre-image (write_file | replace)
//   AfterTool   -> file_edit event
//   AfterAgent  -> turn_diff
// Token usage comes from Gemini's native OTel telemetry (same settings file).
import path from 'node:path';
import { readStdinJson, readText, relPath, runHook } from '../lib/env.mjs';
import { diffPairs, diffStrings } from '../lib/diff.mjs';
import { savePreImage, takePreImage } from '../lib/preimage.mjs';
import { editEvent, emit, promptEvents } from '../lib/spool.mjs';
import { endTurn, startTurn } from '../lib/turn.mjs';

const TOOL = 'gemini';

runHook(
  async () => {
    const p = await readStdinJson();
    const sid = p.session_id ?? process.env.GEMINI_SESSION_ID;
    const input = p.tool_input ?? {};
    const file = input.file_path && path.resolve(p.cwd ?? process.cwd(), input.file_path);

    switch (p.hook_event_name) {
      case 'BeforeAgent':
        emit([...startTurn(TOOL, sid), ...promptEvents({ tool: TOOL, text: p.prompt, session_id: sid })]);
        break;

      case 'BeforeTool':
        if (file && relPath(file)) savePreImage(sid, file);
        break;

      case 'AfterTool': {
        const rel = relPath(file);
        if (!rel) break;
        const pre = takePreImage(sid, file);
        const diff = pre
          ? diffStrings(pre.content, readText(file))
          : 'old_string' in input
            ? diffPairs([[input.old_string, input.new_string]])
            : diffStrings('', input.content);
        const event = pre?.content == null && p.tool_name === 'write_file' ? 'file_create' : 'file_edit';
        emit([editEvent({ tool: TOOL, file: rel, diff, event, source: 'hook', session_id: sid, tool_name: p.tool_name })]);
        break;
      }

      case 'AfterAgent':
        emit(endTurn(TOOL, sid));
        break;
    }
  },
  { stdout: {} },
);
