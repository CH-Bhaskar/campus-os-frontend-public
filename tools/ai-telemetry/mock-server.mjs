#!/usr/bin/env node
// Local stand-in for the telemetry backend. Logs every event and OTLP (http/json)
// payload, and serves running totals at GET /summary.
//   npm run telemetry:mock            (PORT=8787 by default)
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 8787);
const LOG = process.env.MOCK_LOG ?? path.join(os.tmpdir(), 'ai-telemetry-mock.jsonl');
const events = [];

// With CODES_FILE=<generated csv>, behaves like the real backend: rejects unknown codes and
// trusts the code (not the self-reported fields) for team/participant.
const codes = new Map();
if (process.env.CODES_FILE) {
  for (const row of fs.readFileSync(process.env.CODES_FILE, 'utf8').split('\n').slice(1).filter(Boolean)) {
    const [team_id, participant_id, code] = row.split(',');
    codes.set(code, { team_id, participant_id });
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function describe(e) {
  const bits = [`${String(e.participant_id ?? `unreg:${e.machine_id?.slice(0, 8)}`).padEnd(14)} ${e.event.padEnd(14)} ${String(e.tool ?? '').padEnd(12)}`];
  if (e.file) bits.push(e.file);
  if (e.lines_added != null) bits.push(`+${e.lines_added}/-${e.lines_removed ?? 0}`);
  if (e.written_tokens != null) bits.push(`written_tokens=${e.written_tokens}`);
  if (e.output_tokens != null) bits.push(`model=${e.model} in=${e.input_tokens} out=${e.output_tokens} cache_read=${e.cache_read_tokens ?? 0}`);
  if (e.event === 'commit') bits.push(`${e.commit?.slice(0, 7)} ai=${e.ai_lines}/${e.nonblank_added} ${JSON.stringify(e.ai_by_tool ?? {})}`);
  if (e.files && e.event === 'turn_diff') bits.push(`${e.files.length} file(s)${e.partial ? ' partial' : ''}${e.interrupted ? ' interrupted' : ''}`);
  return bits.join('  ');
}

function summary() {
  const byTool = {};
  const byParticipant = {};
  for (const e of events) {
    const p = (byParticipant[e.participant_id ?? `unregistered:${e.machine_id}`] ??= { events: 0, commits: 0, ai_lines: 0, nonblank_added: 0, output_tokens: 0 });
    p.events++;
    if (e.event === 'commit') {
      p.commits++;
      p.ai_lines += e.ai_lines ?? 0;
      p.nonblank_added += e.nonblank_added ?? 0;
    }
    if (e.event === 'session_usage') p.output_tokens += e.output_tokens ?? 0;
  }
  const commits = { count: 0, nonblank_added: 0, ai_lines: 0 };
  for (const e of events) {
    if (e.event === 'commit') {
      commits.count++;
      commits.nonblank_added += e.nonblank_added ?? 0;
      commits.ai_lines += e.ai_lines ?? 0;
      continue;
    }
    const t = (byTool[e.tool ?? 'unknown'] ??= { edits: 0, lines_added: 0, written_tokens: 0, turn_lines_added: 0, input_tokens: 0, output_tokens: 0 });
    if (e.event === 'turn_diff') t.turn_lines_added += e.lines_added;
    else if (e.event === 'session_usage') {
      t.input_tokens += e.input_tokens ?? 0;
      t.output_tokens += e.output_tokens ?? 0;
    } else {
      t.edits++;
      t.lines_added += e.lines_added ?? 0;
      t.written_tokens += e.written_tokens ?? 0;
    }
  }
  commits.ai_share = commits.nonblank_added ? +(commits.ai_lines / commits.nonblank_added).toFixed(3) : 0;
  return { events: events.length, by_participant: byParticipant, by_tool: byTool, commits };
}

http
  .createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.method === 'POST' && req.url === '/v1/ai-events') {
      const who = codes.get(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
      if (codes.size && !who) {
        console.log('[reject] unknown participant code');
        res.writeHead(401).end();
        return;
      }
      const { events: batch = [] } = JSON.parse(body.toString('utf8') || '{}');
      for (const e of batch) {
        if (events.some((x) => x.id === e.id)) continue; // dedupe retried batches
        if (who) Object.assign(e, { team_id: who.team_id, participant_id: who.participant_id, verified: true });
        events.push(e);
        fs.appendFileSync(LOG, `${JSON.stringify(e)}\n`);
        console.log(`[event] ${describe(e)}`);
      }
      res.writeHead(202).end();
    } else if (req.method === 'POST' && req.url.startsWith('/v1/')) {
      // OTLP from Claude Code / Codex / Gemini.
      const kind = req.url.slice(4);
      let detail = `${body.length} bytes`;
      if (String(req.headers['content-type']).includes('json')) {
        const json = JSON.parse(body.toString('utf8'));
        const names = JSON.stringify(json).match(/"(?:name|event\.name)":"[^"]+"|"stringValue":"claude_code\.[^"]+"/g) ?? [];
        detail = [...new Set(names.map((n) => n.split(':')[1].replaceAll('"', '')))].join(', ');
      }
      fs.appendFileSync(LOG, `${JSON.stringify({ otlp: kind, ts: new Date().toISOString(), body: body.toString('utf8') })}\n`);
      console.log(`[otlp ${kind}] ${detail}`);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    } else if (req.method === 'GET' && req.url === '/summary') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(summary(), null, 2));
    } else {
      res.writeHead(404).end();
    }
  })
  .listen(PORT, () => console.log(`ai-telemetry mock listening on http://localhost:${PORT} (log: ${LOG})`));
