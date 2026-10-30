// Exact model token usage, read from agent transcripts. Each reader remembers how far
// it got (per transcript) so every Stop only reports the tokens of the new turn.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, sha1, stateDir, writeJson } from './env.mjs';

const cursorFile = (transcript) => path.join(stateDir('usage'), `${sha1(transcript)}.json`);

function readNewLines(transcript) {
  const state = readJson(cursorFile(transcript), { offset: 0 });
  const buf = fs.readFileSync(transcript);
  const end = buf.lastIndexOf(0x0a) + 1; // only consume complete lines
  const start = state.offset <= end ? state.offset : 0; // file was rewritten
  const lines = buf.subarray(start, end).toString('utf8').split('\n').filter(Boolean);
  return { lines, state: { ...state, offset: end } };
}

function parse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// Claude Code JSONL: assistant entries carry message.usage. One API message can span
// several lines (one per content block), so dedupe by message.id and keep the last.
export function claudeUsage(transcript) {
  if (!transcript || !fs.existsSync(transcript)) return [];
  const { lines, state } = readNewLines(transcript);
  const byMessage = new Map();
  for (const line of lines) {
    const entry = parse(line);
    const msg = entry?.message;
    if (entry?.type === 'assistant' && msg?.usage) byMessage.set(msg.id ?? entry.uuid, msg);
  }
  const byModel = {};
  for (const msg of byMessage.values()) {
    const u = msg.usage;
    const m = (byModel[msg.model ?? 'unknown'] ??= {
      model: msg.model ?? 'unknown',
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    });
    m.requests++;
    m.input_tokens += u.input_tokens ?? 0;
    m.output_tokens += u.output_tokens ?? 0;
    m.cache_read_tokens += u.cache_read_input_tokens ?? 0;
    m.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
  }
  writeJson(cursorFile(transcript), state);
  return Object.values(byModel);
}

// Codex rollout JSONL: `token_count` events hold cumulative session totals, so report
// the delta since the last Stop. The format is not a stable interface: best effort.
export function codexUsage(transcript, model) {
  if (!transcript || !fs.existsSync(transcript)) return [];
  const { lines, state } = readNewLines(transcript);
  let total = null;
  for (const line of lines) {
    const payload = parse(line)?.payload;
    if (payload?.type === 'token_count' && payload.info?.total_token_usage) total = payload.info.total_token_usage;
    if (payload?.model) model ??= payload.model;
  }
  const prev = state.prev ?? {};
  writeJson(cursorFile(transcript), total ? { ...state, prev: total } : state);
  if (!total) return [];
  const delta = (k) => Math.max(0, (total[k] ?? 0) - (prev[k] ?? 0));
  return [
    {
      model: model ?? 'unknown',
      input_tokens: delta('input_tokens'),
      output_tokens: delta('output_tokens') + delta('reasoning_output_tokens'),
      cache_read_tokens: delta('cached_input_tokens'),
    },
  ];
}

// Antigravity transcript.jsonl: each model step carries its own input/output/cache token
// counts, so sum the steps added since the last Stop. Best effort, like the Codex reader.
export function antigravityUsage(transcript, model) {
  if (!transcript || !fs.existsSync(transcript)) return [];
  const { lines, state } = readNewLines(transcript);
  const total = { model: model ?? 'unknown', requests: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 };
  for (const line of lines) {
    const step = parse(line);
    if (step?.input_tokens == null && step?.output_tokens == null) continue;
    total.requests++;
    total.input_tokens += step.input_tokens ?? 0;
    total.output_tokens += step.output_tokens ?? 0;
    total.cache_read_tokens += step.cache_read_tokens ?? 0;
  }
  writeJson(cursorFile(transcript), state);
  return total.requests ? [total] : [];
}

export function usageEvents(tool, sessionId, records, extra = {}) {
  return records.map((r) => ({ event: 'session_usage', source: 'transcript', tool, session_id: sessionId, ...r, ...extra }));
}
