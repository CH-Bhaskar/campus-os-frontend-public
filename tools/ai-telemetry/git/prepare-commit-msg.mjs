#!/usr/bin/env node
// git prepare-commit-msg <msgFile> [source] [sha]
// 1. Refuses the commit until this machine is registered (config.requireRegistration).
// 2. Credits in-progress agent turns, then appends trailers:
//      Telemetry-Participant: T07-P3        (always; lets organizers audit history)
//      AI-Assisted: claude-code, paste      (when AI lines are staged)
//      AI-Lines: 42/60
// Unlike pre-commit, this hook also runs under `git commit --no-verify`.
import { excludePathspecs, git, loadConfig, readText, runHook } from '../lib/env.mjs';
import { parseUnifiedDiff } from '../lib/diff.mjs';
import { loadIdentity } from '../lib/identity.mjs';
import { attribute, summarize } from '../lib/ledger.mjs';
import { emit } from '../lib/spool.mjs';
import { checkpointActiveTurns } from '../lib/turn.mjs';

const [msgFile, source] = process.argv.slice(2);
const identity = loadIdentity();

if (!identity && loadConfig().requireRegistration && !loadConfig().disabled) {
  process.stderr.write(
    '\n  Commit blocked: this machine is not registered for the hackathon.\n' +
      '  Run:  npm run telemetry:register -- <your participant code>\n' +
      '  (Your code is on the card / message from the organizers.)\n\n',
  );
  process.exit(1);
}

runHook(async () => {
  if (!msgFile || source === 'merge' || source === 'squash') return;

  // An agent committing mid-turn: credit its edits now, before the commit lands.
  emit(checkpointActiveTurns());

  const msg = readText(msgFile) ?? '';
  const trailers = [];
  if (identity && !/^Telemetry-Participant:/im.test(msg)) trailers.push(`Telemetry-Participant: ${identity.participant_id}`);

  const staged = git(['diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--no-renames', '--', '.', ...excludePathspecs()]);
  const total = summarize(attribute(parseUnifiedDiff(staged)));
  if (total.ai_lines && !/^AI-Assisted:/im.test(msg)) {
    trailers.push(`AI-Assisted: ${Object.keys(total.ai_by_tool).sort().join(', ')}`);
    trailers.push(`AI-Lines: ${total.ai_lines}/${total.nonblank_added}`);
  }
  if (trailers.length) git(['interpret-trailers', '--in-place', ...trailers.flatMap((t) => ['--trailer', t]), msgFile]);
});
