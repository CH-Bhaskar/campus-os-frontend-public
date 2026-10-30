// Who is behind an event: an organizer-issued participant code (registered once per
// machine) plus a random machine id that exists even before registration.
// Code format: T07-P3-K7Q2-M9XD  (team 07, participant 3, 8-char secret, last char = checksum)
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HOME_DIR, readJson, writeJson } from './env.mjs';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
const IDENTITY_FILE = path.join(HOME_DIR, 'identity.json');
const MACHINE_FILE = path.join(HOME_DIR, 'machine.json');
const CODE_RE = /^T(\d{2,3})-P(\d{1,2})-([0-9A-Z]{4})-([0-9A-Z]{4})$/;

function checksum(text) {
  let sum = 0;
  for (const ch of text) sum = (sum * 31 + ch.charCodeAt(0)) % 32;
  return ALPHABET[sum];
}

export function generateCode(team, participant) {
  const prefix = `T${String(team).padStart(2, '0')}-P${participant}`;
  const secret = [...randomBytes(7)].map((b) => ALPHABET[b % 32]).join('');
  const body = `${prefix}-${secret.slice(0, 4)}-${secret.slice(4)}`;
  return body + checksum(body);
}

// Returns { code, team_id, participant_id } or null when malformed / checksum fails.
export function parseCode(raw) {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  const m = code.match(CODE_RE);
  if (!m || checksum(code.slice(0, -1)) !== code.at(-1)) return null;
  return { code, team_id: `T${m[1]}`, participant_id: `T${m[1]}-P${m[2]}` };
}

export function machineId() {
  const saved = readJson(MACHINE_FILE);
  if (saved?.machine_id) return saved.machine_id;
  fs.mkdirSync(HOME_DIR, { recursive: true });
  const id = randomUUID();
  writeJson(MACHINE_FILE, { machine_id: id, created_at: new Date().toISOString() });
  return id;
}

export function loadIdentity() {
  const saved = readJson(IDENTITY_FILE);
  return saved && parseCode(saved.code) ? saved : null;
}

export function saveIdentity(parsed) {
  fs.mkdirSync(HOME_DIR, { recursive: true });
  const identity = { ...parsed, registered_at: new Date().toISOString() };
  writeJson(IDENTITY_FILE, identity);
  fs.chmodSync(IDENTITY_FILE, 0o600);
  return identity;
}
