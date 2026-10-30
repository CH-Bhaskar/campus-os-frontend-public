// AI telemetry for OpenCode. Forwards tool start/finish to tools/ai-telemetry/collectors/opencode.mjs,
// which diffs the working tree itself, so nothing here depends on tool names or argument shapes.
// OpenCode's plugin API changed incompatibly between 1.x and 2.x; one default export serves both:
//   1.x calls server() and uses the hooks object it returns
//   2.x calls setup(ctx) and registers through ctx.tool / ctx.session
// Every hook is optional: whatever a version offers is used, missing ones are skipped.
// The prompt text is forwarded; flush drops it unless config.sendPrompts is true.
// Lives in .opencode/plugin/ (read by old and new versions).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root from this file's own location: no reliance on what the host passes in.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COLLECTOR = path.join(REPO_ROOT, 'tools/ai-telemetry/collectors/opencode.mjs');
const LOG_FILE = path.join(os.homedir(), '.ai-telemetry', 'telemetry.log');
// Tools that never change files; anything else (including unknown future tools) is checked.
const READ_ONLY = /^(read|glob|grep|list|ls|webfetch|websearch|codesearch|todoread|todowrite|question|skill|lsp.*)$/i;

function log(message) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [opencode-plugin] ${message}\n`);
  } catch {}
}

// `node` from PATH, like every other agent hook in this repo. Resolves when the collector exits.
function send(hook, payload) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('node', [COLLECTOR, hook], { cwd: REPO_ROOT, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    } catch (err) {
      log(`cannot start node: ${err.message}`);
      return resolve();
    }
    child.on('error', (err) => {
      log(`cannot start node: ${err.message}`);
      resolve();
    });
    child.on('close', resolve);
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}

// The typed text of a message: its text parts joined, ignoring files and synthetic parts.
function textOf(parts) {
  if (!Array.isArray(parts)) return null;
  const text = parts.filter((p) => p?.type === 'text' && !p.synthetic && typeof p.text === 'string').map((p) => p.text);
  return text.length ? text.join('\n') : null;
}

// Shared, version-independent handlers. Inputs are read defensively (sessionID / tool only).
function createTracker() {
  // sessionID -> pending turn snapshot. Tools that run in parallel all wait for the same
  // snapshot, so none of them can write a file before the turn's baseline is taken.
  const open = new Map();
  const usage = new Map(); // sessionID -> Map(messageID -> assistant message), 1.x events only
  const models = new Map(); // sessionID -> model id, from whichever input carries one
  const noteModel = (sid, input) => {
    const model = input?.model?.modelID ?? input?.model?.id ?? input?.modelID;
    if (sid && typeof model === 'string') models.set(sid, model);
  };
  return {
    // Before each model call (2.x): only remembers the model, never blocks or rewrites the request.
    model(input) {
      noteModel(input?.sessionID, input);
    },
    // `session` (2.x only): the session record, whose cumulative token totals the collector diffs.
    async prompt(input, text, session) {
      const sid = input?.sessionID;
      if (!sid) return;
      noteModel(sid, input);
      noteModel(sid, session);
      open.delete(sid);
      await send('prompt', { session_id: sid, prompt: typeof text === 'string' ? text : null, model: models.get(sid) ?? null, totals: session?.tokens ?? null });
    },
    async before(input) {
      const sid = input?.sessionID;
      noteModel(sid, input);
      if (!sid || READ_ONLY.test(input.tool ?? '')) return;
      if (!open.has(sid)) open.set(sid, send('tool.before', { session_id: sid, model: models.get(sid) ?? null }));
      await open.get(sid);
    },
    async after(input) {
      const sid = input?.sessionID;
      if (!sid || READ_ONLY.test(input.tool ?? '')) return;
      await send('tool.after', { session_id: sid, tool: input.tool ?? null, model: models.get(sid) ?? null });
    },
    message(msg) {
      if (msg?.role !== 'assistant' || !msg.sessionID) return;
      noteModel(msg.sessionID, msg);
      if (!usage.has(msg.sessionID)) usage.set(msg.sessionID, new Map());
      usage.get(msg.sessionID).set(msg.id, msg);
    },
    async idle(sessionID, session) {
      if (!sessionID) return;
      noteModel(sessionID, session);
      const byModel = {};
      for (const msg of usage.get(sessionID)?.values() ?? []) {
        const model = msg.modelID ?? 'unknown';
        const m = (byModel[model] ??= { model, requests: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 });
        m.requests++;
        m.input_tokens += msg.tokens?.input ?? 0;
        m.output_tokens += (msg.tokens?.output ?? 0) + (msg.tokens?.reasoning ?? 0);
        m.cache_read_tokens += msg.tokens?.cache?.read ?? 0;
        m.cache_creation_tokens += msg.tokens?.cache?.write ?? 0;
      }
      usage.delete(sessionID);
      open.delete(sessionID);
      await send('idle', { session_id: sessionID, usage: Object.values(byModel), totals: session?.tokens ?? null, model: models.get(sessionID) ?? null });
    },
  };
}

// OpenCode 1.x: returns a hooks object.
async function server() {
  const t = createTracker();
  return {
    'chat.message': async (input, output) => t.prompt(input, textOf(output?.parts)),
    'tool.execute.before': async (input) => t.before(input),
    'tool.execute.after': async (input) => t.after(input),
    event: async ({ event }) => {
      if (event?.type === 'message.updated') t.message(event.properties?.info);
      if (event?.type === 'session.idle') await t.idle(event.properties?.sessionID);
    },
  };
}

// OpenCode 2.x: registers hooks on the context.
async function setup(ctx) {
  const t = createTracker();
  const hook = async (domain, name, fn) => {
    try {
      if (typeof ctx?.[domain]?.hook === 'function') await ctx[domain].hook(name, fn);
    } catch (err) {
      log(`hook ${domain}.${name} unavailable: ${err?.message ?? err}`);
    }
  };
  // 2.x has no idle hook: read the session record (token totals) through the plugin API.
  const getSession = async (sid) => {
    try {
      if (!sid || typeof ctx?.session?.get !== 'function') return null;
      const s = await ctx.session.get({ sessionID: sid });
      return s?.data ?? s ?? null;
    } catch (err) {
      log(`session.get failed: ${err?.message ?? err}`);
      return null;
    }
  };
  // A model call means the agent loop is running: wait (in the background) until it is idle,
  // then close the turn and report the tokens it used. One waiter per session at a time.
  const waiting = new Set();
  const watchIdle = (sid) => {
    if (!sid || waiting.has(sid) || typeof ctx?.session?.wait !== 'function') return;
    waiting.add(sid);
    Promise.resolve()
      .then(() => ctx.session.wait({ sessionID: sid }))
      .then(async () => t.idle(sid, await getSession(sid)))
      .catch((err) => log(`session.wait failed: ${err?.message ?? err}`))
      .finally(() => waiting.delete(sid));
  };
  await hook('session', 'prompt', async (input) =>
    t.prompt(input, input?.prompt?.text ?? textOf(input?.prompt?.parts), await getSession(input?.sessionID)),
  );
  await hook('session', 'model.request', (input) => {
    t.model(input);
    watchIdle(input?.sessionID);
  });
  await hook('tool', 'execute.before', (input) => t.before(input));
  await hook('tool', 'execute.after', (input) => t.after(input));
}

export default { id: 'ai-telemetry', server, setup };
