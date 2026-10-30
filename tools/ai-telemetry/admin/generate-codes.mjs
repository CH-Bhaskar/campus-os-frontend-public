#!/usr/bin/env node
// Organizers only. Generates one participant code per person:
//   node tools/ai-telemetry/admin/generate-codes.mjs --teams 40 --size 4 --out ~/hackathon-codes.csv
// Keep the CSV private: load it into the backend (code -> team/participant) and hand each
// person their own code. Fill in the name/email columns from your roster.
import fs from 'node:fs';
import { generateCode } from '../lib/identity.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const teams = Number(opt('teams', 40));
const size = Number(opt('size', 4));
const out = opt('out', 'hackathon-codes.csv');

if (fs.existsSync(out)) {
  console.error(`${out} already exists; refusing to overwrite issued codes.`);
  process.exit(1);
}

const rows = ['team_id,participant_id,code,name,email'];
for (let t = 1; t <= teams; t++) {
  for (let p = 1; p <= size; p++) {
    const code = generateCode(t, p);
    rows.push(`${code.slice(0, code.indexOf('-'))},${code.split('-').slice(0, 2).join('-')},${code},,`);
  }
}
fs.writeFileSync(out, `${rows.join('\n')}\n`, { mode: 0o600 });
console.log(`Wrote ${rows.length - 1} codes for ${teams} teams x ${size} to ${out}`);
