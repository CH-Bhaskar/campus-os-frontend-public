#!/usr/bin/env node
// One-time per machine:  npm run telemetry:register -- T07-P3-K7Q2-M9XD [--yes] [--force]
import readline from 'node:readline/promises';
import { loadIdentity, machineId, parseCode, saveIdentity } from './lib/identity.mjs';
import { emit } from './lib/spool.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
let rawCode = args.find((a) => !a.startsWith('--'));

const DISCLOSURE = `
This hackathon template measures how AI tools are used while you build.
What is collected, linked to your participant code:
  - which files were changed by which tool (Claude Code, Cursor, Codex, Gemini, Antigravity, OpenCode, Copilot, pastes)
  - line counts and token counts of the changes, and AI model token usage
  - per commit: how many lines were AI-written vs typed by you
  - the prompts you send to AI coding tools in this repo (their full text)
What is NOT collected: your code, or anything outside this repo.
Don't put passwords or personal data in prompts.
Data goes to the organizers' server only. Questions? Ask an organizer.
`;

const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;

try {
  const existing = loadIdentity();
  if (existing && !flag('--force')) {
    console.log(`Already registered as ${existing.participant_id}. Use --force to replace it.`);
    process.exit(0);
  }

  console.log(DISCLOSURE);
  if (!rawCode && rl) rawCode = await rl.question('Participant code: ');
  const parsed = parseCode(rawCode);
  if (!parsed) {
    console.error(`"${rawCode ?? ''}" is not a valid participant code. Check for typos (format T07-P3-XXXX-XXXX).`);
    process.exit(1);
  }

  if (!flag('--yes')) {
    if (!rl) {
      console.error('Re-run with --yes to accept the collection described above.');
      process.exit(1);
    }
    const answer = await rl.question(`Register this machine as ${parsed.participant_id} and accept the above? [y/N] `);
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('Not registered. Commits stay blocked until you register.');
      process.exit(1);
    }
  }

  const identity = saveIdentity(parsed);
  // Lets the backend attach this machine's earlier, unregistered events to the participant.
  emit([{ event: 'register', source: 'register', previous_participant_id: existing?.participant_id ?? null }]);
  console.log(`\nRegistered ${identity.participant_id} (team ${identity.team_id}) on machine ${machineId().slice(0, 8)}. Happy hacking!`);
} finally {
  rl?.close();
}
