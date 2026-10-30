// Keeps one paste-watcher process running per clone. Every hook calls ensureWatcher() (via emit),
// so after a reboot it comes back as soon as the student runs the app, commits, or prompts an agent.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { TOOL_DIR, loadConfig, readJson, stateDir } from './env.mjs';

export const WATCHER_SCRIPT = path.join(TOOL_DIR, 'paste-watcher.mjs');
export const watcherFile = () => path.join(stateDir(), 'watcher.json');
const RETRY_UNAVAILABLE_MS = 3600 * 1000;

export function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

export function watcherEnabled() {
  const cfg = loadConfig();
  return !cfg.disabled && cfg.pasteWatcher !== false && !process.env.CI && process.env.AI_TELEMETRY_SKIP_WATCHER !== '1';
}

export function ensureWatcher() {
  try {
    if (!watcherEnabled()) return;
    const state = readJson(watcherFile(), {});
    if (isAlive(state.pid)) return;
    // No clipboard tool on this machine (Linux without xclip/xsel/wl-paste): don't respawn on every hook.
    if (state.unavailable && Date.now() - Date.parse(state.ts) < RETRY_UNAVAILABLE_MS) return;
    spawn(process.execPath, [WATCHER_SCRIPT, '--run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {}
}
