#!/usr/bin/env node
// git post-commit: emits one `commit` event with the AI vs human split of the lines that
// actually landed, per file and per tool, plus any tools declared in commit trailers.
import { excludePathspecs, git, runHook } from '../lib/env.mjs';
import { parseUnifiedDiff } from '../lib/diff.mjs';
import { attribute, summarize } from '../lib/ledger.mjs';
import { emit } from '../lib/spool.mjs';

const AI_NAMES = /claude|copilot|cursor|codex|gemini|antigravity|opencode|aider|chatgpt|openai|windsurf|devin|\bai\b/i;

// Tools named in `AI-Assisted:` trailers (added by us or by hand) and AI co-authors (e.g. Aider).
function declaredTools(sha) {
  const trailers = git(['log', '-1', '--format=%(trailers:unfold,only)', sha]);
  const tools = new Set();
  for (const line of trailers.split('\n')) {
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^ai-assisted$/i.test(key)) value.split(',').forEach((t) => t.trim() && tools.add(t.trim().toLowerCase()));
    else if (/^co-authored-by$/i.test(key) && AI_NAMES.test(value)) tools.add(value.replace(/\s*<.*>$/, '').toLowerCase());
  }
  return [...tools];
}

runHook(async () => {
  const sha = git(['rev-parse', 'HEAD']).trim();
  const parents = git(['rev-list', '--parents', '-n', '1', sha]).trim().split(' ').length - 1;
  const [subject, author_name, author_email] = git(['log', '-1', '--format=%s%x00%an%x00%ae', sha]).trim().split('\0');
  const base = { event: 'commit', source: 'git', commit: sha, subject, author_name, author_email, parents };

  if (parents > 1) {
    emit([{ ...base, merge: true, declared_tools: declaredTools(sha) }]);
    return;
  }
  const diff = git(['diff-tree', '-p', '-U0', '--no-color', '--no-ext-diff', '--no-renames', '--root', '-r', sha, '--', '.', ...excludePathspecs()]);
  const files = attribute(parseUnifiedDiff(diff), { consume: true });
  emit([{ ...base, ...summarize(files), declared_tools: declaredTools(sha), files }]);
});
