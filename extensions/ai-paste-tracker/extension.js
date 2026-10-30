// Detects text that was not typed: pastes (insert equals the clipboard) and other large
// single inserts (Copilot/Cursor Tab completions, chat "apply" buttons). Each one is handed
// to tools/ai-telemetry/collectors/editor.mjs, which records and ships it.
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const COLLECTOR = path.join('tools', 'ai-telemetry', 'collectors', 'editor.mjs');
const VERSION = require('./package.json').version;

const normalize = (s) => s.replace(/\s+/g, ' ').trim();

function guessTool() {
  const app = vscode.env.appName.toLowerCase();
  if (app.includes('cursor')) return 'cursor-tab';
  if (app.includes('windsurf')) return 'windsurf';
  const active = (id) => vscode.extensions.getExtension(id)?.isActive;
  if (active('GitHub.copilot') || active('GitHub.copilot-chat')) return 'copilot';
  return 'unknown';
}

function send(collector, payload) {
  // Run the collector with the editor's bundled Node so no `node` on PATH is needed.
  const child = cp.spawn(process.execPath, [collector], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'ignore', 'ignore'],
    detached: true,
  });
  child.on('error', () => {});
  child.stdin.end(JSON.stringify(payload));
  child.unref();
}

// Nearest enclosing repo that has the collector, so it works whether the student opened
// the repo itself, a parent folder, or a single file. Cached per directory.
const collectorByDir = new Map();
function findCollector(dir) {
  if (collectorByDir.has(dir)) return collectorByDir.get(dir);
  const candidate = path.join(dir, COLLECTOR);
  const parent = path.dirname(dir);
  const found = fs.existsSync(candidate) ? candidate : parent === dir ? null : findCollector(parent);
  collectorByDir.set(dir, found);
  return found;
}

// One `editor_ready` per repo per editor session: lets organizers see who has the extension.
const announced = new Set();
function announce(collector) {
  if (announced.has(collector)) return;
  announced.add(collector);
  send(collector, { kind: 'ready', app: vscode.env.appName, version: VERSION, tool: guessTool() });
}

function activate(context) {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const collector = findCollector(folder.uri.fsPath);
    if (collector) announce(collector);
  }

  const listener = vscode.workspace.onDidChangeTextDocument(async (e) => {
    const doc = e.document;
    // Skip undo/redo, non-files, and disk reloads (doc stays clean).
    if (e.reason || doc.uri.scheme !== 'file' || !doc.isDirty) return;

    const cfg = vscode.workspace.getConfiguration('aiPasteTracker');
    const big = e.contentChanges.filter(
      (c) => c.text.length >= cfg.get('minChars', 120) || c.text.split('\n').length >= cfg.get('minLines', 3),
    );
    if (!big.length) return;
    const collector = findCollector(path.dirname(doc.uri.fsPath));
    if (!collector) return;
    announce(collector);

    const clip = await vscode.env.clipboard.readText();
    for (const { text } of big) {
      const isPaste = clip.length > 0 && normalize(clip) === normalize(text);
      send(collector, {
        kind: isPaste ? 'paste' : 'insert',
        tool: isPaste ? 'paste' : guessTool(),
        file: doc.uri.fsPath,
        text,
        app: vscode.env.appName,
      });
    }
  });
  context.subscriptions.push(listener);
}

module.exports = { activate, deactivate() {} };
