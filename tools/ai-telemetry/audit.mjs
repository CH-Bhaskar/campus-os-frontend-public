#!/usr/bin/env node
// Audits a team repo's history from git alone:
//   npm run telemetry:audit [-- <rev-range>]
// Every commit made with the hooks installed carries a Telemetry-Participant trailer.
// Commits without one were made with telemetry bypassed (no `npm install`, hooks
// disabled, or rewritten history). Root commits are skipped: repos created via GitHub's
// "Use this template" start with a squashed commit that never ran the hooks.
import { git } from './lib/env.mjs';

const range = process.argv[2] ?? 'HEAD';
const SEP = '\x1f';
const log = git([
  'log',
  range,
  `--format=%H${SEP}%P${SEP}%ae${SEP}%as${SEP}%(trailers:key=Telemetry-Participant,valueonly,separator=;)${SEP}%(trailers:key=AI-Lines,valueonly,separator=;)${SEP}%(trailers:key=AI-Assisted,valueonly,separator=;)${SEP}%s`,
]);

const perParticipant = {};
const missing = [];
for (const line of log.split('\n').filter(Boolean)) {
  const [sha, parents, email, date, participant, aiLines, aiTools, subject] = line.split(SEP);
  if (!parents.trim()) continue;
  if (!participant.trim()) {
    missing.push(`${sha.slice(0, 8)}  ${date}  ${email}  ${subject}`);
    continue;
  }
  const p = (perParticipant[participant.trim()] ??= { commits: 0, ai_lines: 0, lines: 0, emails: new Set(), tools: new Set() });
  p.commits++;
  p.emails.add(email);
  const [ai, total] = (aiLines.trim() || '0/0').split('/').map(Number);
  p.ai_lines += ai || 0;
  p.lines += total || 0;
  aiTools.split(/[;,]/).forEach((t) => t.trim() && p.tools.add(t.trim()));
}

console.log('participant   commits  ai_lines/attributed  tools  (git emails)');
for (const [id, p] of Object.entries(perParticipant).sort()) {
  console.log(`${id.padEnd(12)}  ${String(p.commits).padStart(7)}  ${`${p.ai_lines}/${p.lines}`.padStart(19)}  ${[...p.tools].join(',') || '-'}  (${[...p.emails].join(', ')})`);
}
console.log(`\n${missing.length} commit(s) without a Telemetry-Participant trailer${missing.length ? ':' : '.'}`);
for (const m of missing) console.log(`  ${m}`);
process.exitCode = missing.length ? 2 : 0;
