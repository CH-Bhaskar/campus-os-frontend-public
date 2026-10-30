// Saves a file's content right before an agent edits it, so the post-edit hook can
// compute an exact diff even for full-file overwrites.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, readText, sha1, stateDir, writeJson } from './env.mjs';

const preFile = (sessionId, file) => path.join(stateDir('pre'), `${sha1(`${sessionId}\0${file}`)}.json`);

export function savePreImage(sessionId, file) {
  writeJson(preFile(sessionId, file), { content: readText(file) });
}

// Returns { content: string|null } or undefined when no pre-image was saved.
export function takePreImage(sessionId, file) {
  const p = preFile(sessionId, file);
  const pre = readJson(p, undefined);
  fs.rmSync(p, { force: true });
  return pre;
}
