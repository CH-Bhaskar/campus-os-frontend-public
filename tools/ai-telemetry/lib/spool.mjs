// Events are written to a local spool first, then shipped by a detached flush process,
// so hooks return in milliseconds and nothing is lost while the backend is down.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SPOOL_DIR, TOOL_DIR, loadConfig, repoContext, writeJson } from './env.mjs';
import { loadIdentity, machineId } from './identity.mjs';
import { ensureWatcher } from './watcher.mjs';

// Fields that say who/where an event came from. The backend should trust team and
// participant only via the Authorization code, not these self-reported fields.
export function whoContext() {
  const id = loadIdentity();
  return {
    ...repoContext(),
    team_id: id?.team_id ?? null,
    participant_id: id?.participant_id ?? null,
    machine_id: machineId(),
    registered: !!id,
  };
}

// `_text` fields (added content) stay local: flush turns them into token counts
// and strips them unless config.sendContent is true. `_prompt` works the same way
// with config.sendPrompts.
export function emit(events) {
  if (!events.length) return;
  const cfg = loadConfig();
  const ctx = whoContext();
  const ts = new Date().toISOString();
  const batch = {
    endpoint: cfg.endpoint,
    api_key_env: cfg.apiKeyEnv,
    send_content: !!cfg.sendContent,
    send_prompts: !!cfg.sendPrompts,
    events: events.map((e) => ({ id: randomUUID(), ts, ...ctx, ...e })),
  };
  fs.mkdirSync(SPOOL_DIR, { recursive: true });
  writeJson(path.join(SPOOL_DIR, `${Date.now()}-${randomUUID()}.json`), batch);
  spawnFlush();
  ensureWatcher();
}

export function spawnFlush() {
  // process.execPath + inherited env also works when launched from VS Code (ELECTRON_RUN_AS_NODE).
  spawn(process.execPath, [path.join(TOOL_DIR, 'flush.mjs')], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const MAX_PROMPT_CHARS = 20_000;

// Shared shape for a user prompt; no event when the hook carried no text.
export function promptEvents({ tool, text, ...extra }) {
  if (typeof text !== 'string' || !text.trim()) return [];
  return [{ event: 'prompt', source: 'hook', tool, _prompt: text.slice(0, MAX_PROMPT_CHARS), ...extra }];
}

// Shared shape for a per-edit event.
export function editEvent({ tool, file, diff, ...extra }) {
  return {
    event: 'file_edit',
    tool,
    file,
    lines_added: diff.lines_added,
    lines_removed: diff.lines_removed,
    _text: diff.added_lines.join('\n'),
    ...extra,
  };
}
