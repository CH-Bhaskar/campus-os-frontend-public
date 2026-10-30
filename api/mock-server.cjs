/**
 * CampusOS Mock API Server — for the 2026-10-30 hackathon.
 *
 * A faithful stand-in for the organisers' CampusOS API so all four lanes can
 * develop + test WITHOUT waiting for the real base URL / admin OTP.
 *
 * Zero dependencies — plain Node.js. Run:  node server.js   (or PORT=3100 node server.js)
 * Then point the frontend at it:  VITE_API_BASE_URL=http://localhost:3100
 *
 * Implements the endpoints the scaffold's typed client calls (see
 * ../campusos-frontend/src/api/*.ts), with the conventions from the cookbook:
 *  - error shape { error: { code, message, details, request_id } }
 *  - lists { items, count, next_cursor }, newest first
 *  - all timestamps UTC ISO strings
 *  - ID prefixes: FND- CLM- LST- NTC- DBT- DTY- DRQ- ITY- TKT-
 *  - role/dept rules incl. the "Student Affairs" / "Campus Maintenance" magic depts
 *  - the 409 codes the UI drives logic off (POST_HAS_PENDING_CLAIMS, ALREADY_ANSWERED, …)
 *
 * Honest limits: data is in-memory (restart = fresh seed); tokens never expire;
 * file URLs don't expire; uploads are stored in RAM (keep test files small).
 * This is a DEVELOPMENT mock, not the real API — always re-test against the
 * real base URL when the organisers hand it over.
 */
'use strict';
const http = require('http');

const PORT = parseInt(process.env.PORT || '3100', 10);

/* ============================== helpers ============================== */

const nowIso = () => new Date().toISOString();
const rid = () => 'req-' + Math.random().toString(36).slice(2, 10);
const uid = (prefix) =>
  prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    ...headers,
  });
  res.end(payload);
}

function sendErr(res, status, code, message, details = null) {
  send(res, status, {
    error: { code, message, details, request_id: rid() },
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function splitBuffer(buf, sep) {
  const out = [];
  let i = 0,
    j;
  while ((j = buf.indexOf(sep, i)) !== -1) {
    out.push(buf.slice(i, j));
    i = j + sep.length;
  }
  out.push(buf.slice(i));
  return out;
}

/** Minimal multipart/form-data parser. Returns { fields, files }. */
function parseMultipart(req, body) {
  const ct = req.headers['content-type'] || '';
  const m = ct.match(/boundary=([^;]+)/);
  if (!m) return { fields: {}, files: {} };
  const boundary = Buffer.from('--' + m[1].trim().replace(/^"|"$/g, ''));
  const fields = {};
  const files = {};
  for (const part of splitBuffer(body, boundary)) {
    if (part.length < 10) continue;
    const headEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headEnd === -1) continue;
    const head = part.slice(0, headEnd).toString('utf8');
    let data = part.slice(headEnd + 4);
    if (data.length >= 2 && data[data.length - 2] === 13 && data[data.length - 1] === 10)
      data = data.slice(0, -2);
    const cd = head.match(/(?:^|[;\s])name="([^"]+)"(?:;\s*filename="([^"]*)")?/im);
    if (!cd) continue;
    const name = cd[1];
    const filename = cd[2];
    const typeM = head.match(/Content-Type:\s*([^\r\n;]+)/i);
    if (filename !== undefined) {
      (files[name] = files[name] || []).push({
        filename,
        content_type: (typeM && typeM[1].trim()) || 'application/octet-stream',
        data,
      });
    } else {
      fields[name] = data.toString('utf8');
    }
  }
  return { fields, files };
}

async function readJson(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return null; // signals invalid JSON
  }
}

/** cursor pagination: newest-first list → { items, count, next_cursor } */
function paginate(items, limit, cursor) {
  const lim = Math.min(Math.max(parseInt(limit || '25', 10) || 25, 1), 100);
  let offset = 0;
  if (cursor) {
    try {
      offset = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')).o || 0;
    } catch {
      offset = 0;
    }
  }
  const page = items.slice(offset, offset + lim);
  const next = offset + lim < items.length
    ? Buffer.from(JSON.stringify({ o: offset + lim })).toString('base64')
    : null;
  return { items: page, count: items.length, next_cursor: next };
}

const byNewest = (a, b) => (b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : 0);

/* ============================== store ============================== */

const DB = {
  admin: null, // { email_id, otp, profile }
  users: [], // UserProfile & { otp }
  tokens: {}, // token -> { kind: 'admin'|'user', email }
  posts: [],
  claims: [],
  lostRequests: [],
  notices: [],
  doubts: [],
  docTypes: [],
  docRequests: [],
  issueTypes: [],
  tickets: [],
  files: {}, // fileId -> { filename, content_type, data }
};

function storeFile(file) {
  const id = uid('F');
  DB.files[id] = {
    filename: file.filename || 'upload.bin',
    content_type: file.content_type,
    data: file.data,
  };
  return fileRef(id);
}

function fileRef(id) {
  const f = DB.files[id];
  return {
    file_id: id,
    filename: f.filename,
    content_type: f.content_type,
    size_bytes: f.data.length,
    url: `http://localhost:${PORT}/mock-files/${id}`,
  };
}

/* ============================== auth ============================== */

function authOf(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  const t = DB.tokens[m[1]];
  if (!t) return null;
  if (t.kind === 'admin') return { kind: 'admin', admin: DB.admin.profile, email: t.email };
  const user = DB.users.find((u) => u.email_id === t.email);
  if (!user) return null;
  return { kind: 'user', user, email: t.email };
}

function requireAuth(req, res) {
  const a = authOf(req);
  if (!a) {
    sendErr(res, 401, 'TOKEN_EXPIRED', 'Missing or invalid token — log in again.');
    return null;
  }
  return a;
}

function deptMatches(userDept, magic) {
  return (
    (userDept || '').replace(/\s*dept\s*$/i, '').trim().toLowerCase() ===
    magic.toLowerCase()
  );
}
const isStudentAffairs = (u) =>
  u && u.role === 'office_staff' && deptMatches(u.dept, 'Student Affairs');
const isCampusMaintenance = (u) =>
  u && u.role === 'office_staff' && deptMatches(u.dept, 'Campus Maintenance');
const isOfficeStaff = (u) => u && u.role === 'office_staff';

function loginResponse(kind, profile, token) {
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 43200,
    profile,
  };
}

/* ============================== seed data ============================== */

function mkUser(role, fields) {
  const base = {
    role,
    team_id: 'team-hackathon',
    name: fields.name,
    email_id: fields.email_id,
    phone_number: fields.phone_number,
    created_at: nowIso(),
    updated_at: nowIso(),
    otp: fields.otp,
  };
  if (role === 'student') {
    base.usn = fields.usn;
    base.dept = fields.dept;
  } else if (role === 'faculty') {
    base.designation = fields.designation;
  } else {
    base.dept = fields.dept;
    base.designation = fields.designation;
  }
  DB.users.push(base);
  return base;
}

function seed() {
  DB.admin = {
    email_id: 'admin@campusos.io',
    otp: '123456',
    profile: {
      role: 'admin',
      team_id: 'team-hackathon',
      institution_name: 'Demo Institute of Technology',
      name: 'Hackathon Admin',
      email_id: 'admin@campusos.io',
      phone_number: '+91 90000 00000',
    },
  };

  const s1 = mkUser('student', {
    name: 'Rahul Sharma', usn: '1RV23CS041', dept: 'Computer Science',
    email_id: 'rahul.sharma@campus.edu', phone_number: '+91 98765 43210', otp: '111111',
  });
  const s2 = mkUser('student', {
    name: 'Priya Nair', usn: '1RV23EC017', dept: 'Electronics',
    email_id: 'priya.nair@campus.edu', phone_number: '+91 98765 43211', otp: '222222',
  });
  const f1 = mkUser('faculty', {
    name: 'Dr. Meera Krishnan', designation: 'Associate Professor',
    email_id: 'meera.k@campus.edu', phone_number: '+91 98765 43212', otp: '333333',
  });
  const sa = mkUser('office_staff', {
    name: 'Arjun Menon', dept: 'Student Affairs', designation: 'Student Welfare Officer',
    email_id: 'arjun.menon@campus.edu', phone_number: '+91 98765 43213', otp: '444444',
  });
  const cm = mkUser('office_staff', {
    name: 'Vikram Singh', dept: 'Campus Maintenance', designation: 'Maintenance Supervisor',
    email_id: 'vikram.singh@campus.edu', phone_number: '+91 98765 43214', otp: '555555',
  });
  mkUser('office_staff', {
    name: 'Divya Rao', dept: 'Accounts', designation: 'Accounts Executive',
    email_id: 'divya.rao@campus.edu', phone_number: '+91 98765 43215', otp: '666666',
  });

  // Doc types (DocDesk bonus)
  const dty = (name, description) => {
    const d = {
      doc_type_id: uid('DTY'), name, description: description || null, status: 'active',
      created_by: sa.email_id, created_at: nowIso(), updated_at: nowIso(),
    };
    DB.docTypes.push(d);
    return d;
  };
  const bonafide = dty('Bonafide Certificate', 'Proof of enrollment for bank / visa / travel');
  dty('Transcript', 'Official semester-wise marks transcript');
  dty('Scholarship Form', 'Attested scholarship application form');
  dty('Experience Certificate', 'Internship / work experience letter');

  // Issue types (FixIt bonus)
  const ity = (name, description) => {
    const t = {
      issue_type_id: uid('ITY'), name, description: description || null,
      created_by: cm.email_id, created_at: nowIso(), updated_at: nowIso(),
    };
    DB.issueTypes.push(t);
    return t;
  };
  const electrical = ity('Electrical', 'Lights, fans, wiring, power outlets');
  const plumbing = ity('Plumbing', 'Taps, leaks, washrooms, water supply');
  ity('Furniture', 'Desks, chairs, beds, cupboards');
  ity('IT & Network', 'Wi-Fi, LAN, projectors, lab systems');

  // Found posts (FindIt)
  const mkPost = (title, description, location_found, found_on, by) => {
    const p = {
      post_id: uid('FND'), title, description, location_found, found_on,
      images: [], status: 'active', resolved: false,
      created_by: by.email_id, created_at: nowIso(), updated_at: nowIso(),
    };
    DB.posts.push(p);
    return p;
  };
  mkPost('Black HP laptop bag', 'Black HP laptop backpack, found with a water bottle in the side pocket. No laptop inside.', 'Central Library, 2nd floor reading hall', '2026-10-28', cm);
  mkPost('Silver Casio wristwatch', 'Silver Casio analog watch with a black dial, found near the sports complex gate.', 'Sports complex entrance', '2026-10-27', sa);

  // Notices (Notice Hub) — one pinned, one scheduled
  const mkNotice = (title, body, by, opts = {}) => {
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const n = {
      notice_id: uid('NTC'), title, body,
      status: opts.publish_at && new Date(opts.publish_at) > new Date() ? 'scheduled' : 'active',
      pinned: !!opts.pinned,
      publish_at: opts.publish_at || future,
      attachment: null,
      created_by: by.email_id, created_by_name: by.name, created_by_role: by.role,
      created_at: nowIso(), updated_at: nowIso(),
    };
    DB.notices.push(n);
    return n;
  };
  const n1 = mkNotice(
    'Mid-semester exam schedule released',
    'The mid-semester examination schedule for all branches is now available. Exams begin 9 Nov. Hall tickets will be issued from the Student Affairs office from 2 Nov.',
    f1, { pinned: true, publish_at: '2026-10-29T10:00:00' },
  );
  mkNotice(
    'Annual tech fest registrations open',
    'Registrations for TechNova 2026 are now open! 12 events across robotics, coding and design. Early-bird passes till 5 Nov.',
    sa, { publish_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 19) },
  );
  // one doubt + response on the exam notice, for the demo
  const d1 = {
    doubt_id: uid('DBT'), notice_id: n1.notice_id,
    question: 'Will the hall ticket be issued if I have a fee due pending?',
    asked_by: s1.email_id, asked_by_name: s1.name, asked_by_role: s1.role,
    answered: true,
    response: {
      message: 'You need to clear dues before 1 Nov to collect the hall ticket. Visit the Accounts office.',
      responded_by: f1.email_id, responded_by_name: f1.name, responded_by_role: f1.role,
      responded_at: nowIso(), updated_at: nowIso(),
    },
    created_at: nowIso(), updated_at: nowIso(),
  };
  DB.doubts.push(d1);

  // Tickets (FixIt)
  const mkTicket = (issueType, title, description, reporter) => {
    const t = {
      ticket_id: uid('TKT'), issue_type_id: issueType.issue_type_id,
      issue_type_name: issueType.name, title, description, photo: null,
      status: 'open', status_note: null, tat: null, overdue: false,
      reporter_email: reporter.email_id, reporter_name: reporter.name,
      reporter_role: reporter.role, reporter_phone_number: reporter.phone_number,
      acknowledged_at: null, created_at: nowIso(), updated_at: nowIso(),
    };
    DB.tickets.push(t);
    return t;
  };
  mkTicket(electrical, 'Ceiling fan not working in Room 304', 'Block C, Room 304: the ceiling fan near the window makes a grinding noise and barely rotates. Reported twice to the warden already.', s1);
  mkTicket(plumbing, 'Water leakage in Block B washroom', 'Block B, ground floor washroom: continuous leakage from the flush tank since yesterday morning. Floor is slippery.', s2);

  // One pending doc request (DocDesk)
  DB.docRequests.push({
    request_id: uid('DRQ'), doc_type_id: bonafide.doc_type_id, doc_type_name: bonafide.name,
    reason: 'Need a bonafide certificate for my education loan application at the bank. They asked for proof of current enrollment.',
    status: 'pending', tat: null, answer: null, document: null, filled_form: null,
    acknowledged_at: null,
    requested_by: s1.email_id, requested_by_name: s1.name, requested_by_role: s1.role,
    requested_by_dept: s1.dept, requested_by_phone_number: s1.phone_number,
    created_at: nowIso(), updated_at: nowIso(),
  });

  // one lost request (FindIt bonus)
  DB.lostRequests.push({
    request_id: uid('LST'), title: 'Lost: blue Titan wallet',
    description: 'Blue leather Titan wallet with my ID card inside. Last seen in the canteen around lunch.',
    location_lost: 'College canteen', lost_on: '2026-10-29', status: 'active',
    created_by: s2.email_id, created_by_role: s2.role, created_by_name: s2.name,
    created_by_phone_number: s2.phone_number,
    created_at: nowIso(), updated_at: nowIso(),
  });
}

/* ============================== route helpers ============================== */

const routes = [];
function route(method, pattern, handler) {
  routes.push({ method, pattern: new RegExp('^' + pattern + '$'), handler });
}
const P = (s) => s.replace(/\{(\w+)\}/g, (_, n) => `(?<${n}>[^/]+)`);

function notFound(res) {
  sendErr(res, 404, 'NOT_FOUND', 'No such endpoint or resource.');
}

async function dispatch(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204);

  // static file serving for mock-files
  if (path.startsWith('/mock-files/')) {
    const f = DB.files[path.slice('/mock-files/'.length)];
    if (!f) return sendErr(res, 404, 'NOT_FOUND', 'File not found.');
    res.writeHead(200, {
      'Content-Type': f.content_type,
      'Content-Length': f.data.length,
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(f.data);
  }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = path.match(r.pattern);
    if (!m) continue;
    const query = Object.fromEntries(url.searchParams.entries());
    try {
      await r.handler(req, res, { ...(m.groups || {}), ...query });
    } catch (e) {
      console.error('handler error', e);
      sendErr(res, 500, 'INTERNAL_ERROR', 'Mock server error: ' + e.message);
    }
    return;
  }
  notFound(res);
}

/* ============================== auth ============================== */

route('POST', P('/api/v1/auth/admin/login'), async (req, res) => {
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  if (body.email_id === DB.admin.email_id && String(body.otp) === DB.admin.otp) {
    const token = 'mock-admin-token';
    DB.tokens[token] = { kind: 'admin', email: DB.admin.email_id };
    return send(res, 200, loginResponse('admin', DB.admin.profile, token));
  }
  sendErr(res, 401, 'INVALID_CREDENTIALS', 'Wrong admin email or OTP.');
});

route('POST', P('/api/v1/auth/login'), async (req, res) => {
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  if (body.email_id === DB.admin.email_id)
    return sendErr(res, 400, 'USE_ADMIN_LOGIN', 'Admins must use /auth/admin/login.');
  const user = DB.users.find((u) => u.email_id === body.email_id);
  if (!user || String(body.otp) !== user.otp)
    return sendErr(res, 401, 'INVALID_CREDENTIALS', 'Wrong email or OTP.');
  const token = 'mock-u-' + Math.random().toString(36).slice(2, 10);
  DB.tokens[token] = { kind: 'user', email: user.email_id };
  const { otp, ...profile } = user;
  send(res, 200, loginResponse('user', profile, token));
});

route('GET', P('/api/v1/users/me'), async (req, res) => {
  const a = requireAuth(req, res);
  if (!a) return;
  if (a.kind !== 'user') return sendErr(res, 403, 'FORBIDDEN', 'Not a user account.');
  const { otp, ...profile } = a.user;
  send(res, 200, profile);
});

route('GET', P('/api/v1/admin/me'), async (req, res) => {
  const a = requireAuth(req, res);
  if (!a) return;
  if (a.kind !== 'admin') return sendErr(res, 403, 'FORBIDDEN', 'Admin only.');
  send(res, 200, a.admin);
});

/* ============================== admin: users ============================== */

function requireAdmin(req, res) {
  const a = requireAuth(req, res);
  if (!a) return null;
  if (a.kind !== 'admin') {
    sendErr(res, 403, 'FORBIDDEN', 'Admin only.');
    return null;
  }
  return a;
}

const ROLE_FIELDS = {
  student: ['name', 'usn', 'dept', 'email_id', 'phone_number'],
  faculty: ['name', 'designation', 'email_id', 'phone_number'],
  office_staff: ['name', 'dept', 'designation', 'email_id', 'phone_number'],
};

route('GET', P('/api/v1/admin/users'), async (req, res, q) => {
  if (!requireAdmin(req, res)) return;
  let items = [...DB.users].sort(byNewest);
  if (q.role) items = items.filter((u) => u.role === q.role);
  send(res, 200, paginate(items, q.limit, q.cursor));
});

route('GET', P('/api/v1/admin/users/{email}'), async (req, res, q) => {
  if (!requireAdmin(req, res)) return;
  const u = DB.users.find((x) => x.email_id === decodeURIComponent(q.email));
  if (!u) return sendErr(res, 404, 'NOT_FOUND', 'User not found.');
  send(res, 200, u);
});

route('POST', P('/api/v1/admin/users'), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const { role } = body;
  if (!ROLE_FIELDS[role]) return sendErr(res, 422, 'VALIDATION_ERROR', 'role must be student | faculty | office_staff.');
  const bad = Object.keys(body).filter((k) => k !== 'role' && !ROLE_FIELDS[role].includes(k));
  if (bad.length)
    return sendErr(res, 422, 'FIELD_NOT_ALLOWED_FOR_ROLE', `Fields not allowed for role ${role}: ${bad.join(', ')}`, { fields: bad });
  const missing = ROLE_FIELDS[role].filter((k) => !body[k]);
  if (missing.length)
    return sendErr(res, 422, 'VALIDATION_ERROR', `Missing required fields: ${missing.join(', ')}`, { fields: missing });
  if (DB.users.some((u) => u.email_id === body.email_id) || body.email_id === DB.admin.email_id)
    return sendErr(res, 409, 'ALREADY_EXISTS', 'A user with this email already exists.');
  const u = {
    role, team_id: 'team-hackathon',
    name: body.name, email_id: body.email_id, phone_number: body.phone_number,
    usn: body.usn, dept: body.dept, designation: body.designation,
    created_at: nowIso(), updated_at: nowIso(),
    otp: String(Math.floor(100000 + Math.random() * 900000)),
    created_by: DB.admin.email_id,
  };
  for (const k of Object.keys(u)) if (u[k] === undefined) delete u[k];
  DB.users.push(u);
  send(res, 201, u);
});

route('PATCH', P('/api/v1/admin/users/{email}'), async (req, res, q) => {
  if (!requireAdmin(req, res)) return;
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const u = DB.users.find((x) => x.email_id === decodeURIComponent(q.email));
  if (!u) return sendErr(res, 404, 'NOT_FOUND', 'User not found.');
  const bad = Object.keys(body).filter((k) => !ROLE_FIELDS[u.role].includes(k));
  if (bad.length)
    return sendErr(res, 422, 'FIELD_NOT_ALLOWED_FOR_ROLE', `Fields not allowed for role ${u.role}: ${bad.join(', ')}`, { fields: bad });
  Object.assign(u, body);
  u.updated_at = nowIso();
  const { otp, ...profile } = u;
  send(res, 200, profile);
});

route('POST', P('/api/v1/admin/users/{email}/regenerate-otp'), async (req, res, q) => {
  if (!requireAdmin(req, res)) return;
  const u = DB.users.find((x) => x.email_id === decodeURIComponent(q.email));
  if (!u) return sendErr(res, 404, 'NOT_FOUND', 'User not found.');
  u.otp = String(Math.floor(100000 + Math.random() * 900000));
  u.updated_at = nowIso();
  send(res, 200, u);
});

route('DELETE', P('/api/v1/admin/users/{email}'), async (req, res, q) => {
  if (!requireAdmin(req, res)) return;
  const i = DB.users.findIndex((x) => x.email_id === decodeURIComponent(q.email));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'User not found.');
  DB.users.splice(i, 1);
  send(res, 200, { message: 'User deleted.' });
});

/* ============================== FindIt ============================== */

function postView(p, viewer) {
  const v = { ...p };
  if (!isOfficeStaff(viewer)) delete v.resolution;
  return v;
}

route('POST', P('/api/v1/findit/posts'), async (req, res) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !isOfficeStaff(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only office staff can post found items.');
  const { fields, files } = parseMultipart(req, await readBody(req));
  const title = (fields.title || '').trim();
  if (title.length < 3 || title.length > 100)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'title must be 3–100 chars.', { fields: ['title'] });
  if ((fields.description || '').length > 2000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'description max 2000 chars.', { fields: ['description'] });
  if ((fields.location_found || '').trim().length < 2)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'location_found is required (2–120 chars).', { fields: ['location_found'] });
  const imgs = files.images || [];
  if (imgs.length > 5) return sendErr(res, 422, 'TOO_MANY_IMAGES', 'Max 5 images per post.');
  const p = {
    post_id: uid('FND'), title, description: fields.description || '',
    location_found: fields.location_found.trim(), found_on: fields.found_on || null,
    images: imgs.map(storeFile), status: 'active', resolved: false,
    created_by: a.user.email_id, created_at: nowIso(), updated_at: nowIso(),
  };
  DB.posts.push(p);
  send(res, 201, postView(p, a.user));
});

route('GET', P('/api/v1/findit/posts'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const viewer = a.kind === 'user' ? a.user : null;
  let items = [...DB.posts].sort(byNewest);
  items = items.filter((p) => p.status === (q.status || 'active'));
  send(res, 200, paginate(items.map((p) => postView(p, viewer)), q.limit, q.cursor));
});

route('GET', P('/api/v1/findit/posts/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const p = DB.posts.find((x) => x.post_id === decodeURIComponent(q.id));
  if (!p) return sendErr(res, 404, 'NOT_FOUND', 'Post not found.');
  send(res, 200, postView(p, a.kind === 'user' ? a.user : null));
});

route('PATCH', P('/api/v1/findit/posts/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !isOfficeStaff(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only office staff can edit found items.');
  const p = DB.posts.find((x) => x.post_id === decodeURIComponent(q.id));
  if (!p) return sendErr(res, 404, 'NOT_FOUND', 'Post not found.');
  const { fields, files } = parseMultipart(req, await readBody(req));
  if (fields.status === 'active' && p.resolved)
    return sendErr(res, 409, 'POST_RESOLVED', 'A resolved post cannot be reopened — undo the resolution instead.');
  if (fields.title !== undefined) {
    if (fields.title.trim().length < 3 || fields.title.trim().length > 100)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'title must be 3–100 chars.', { fields: ['title'] });
    p.title = fields.title.trim();
  }
  if (fields.description !== undefined) p.description = fields.description === '' ? '' : fields.description;
  if (fields.location_found !== undefined) p.location_found = fields.location_found;
  if (fields.found_on !== undefined) p.found_on = fields.found_on;
  if (files.images) {
    if (files.images.length > 5) return sendErr(res, 422, 'TOO_MANY_IMAGES', 'Max 5 images per post.');
    p.images = files.images.map(storeFile);
  } else if (fields.remove_images === 'true') p.images = [];
  if (fields.status === 'active' || fields.status === 'archived') p.status = fields.status;
  p.updated_at = nowIso();
  send(res, 200, postView(p, a.user));
});

route('DELETE', P('/api/v1/findit/posts/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !isOfficeStaff(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only office staff can delete found items.');
  const i = DB.posts.findIndex((x) => x.post_id === decodeURIComponent(q.id));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'Post not found.');
  const pending = DB.claims.some((c) => c.post_id === DB.posts[i].post_id && c.status === 'pending');
  if (pending)
    return sendErr(res, 409, 'POST_HAS_PENDING_CLAIMS', 'Resolve the pending claims first.');
  DB.claims = DB.claims.filter((c) => c.post_id !== DB.posts[i].post_id);
  DB.posts.splice(i, 1);
  send(res, 200, { message: 'Post deleted.' });
});

/* ---- claims ---- */

route('POST', P('/api/v1/findit/posts/{id}/claims'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user to claim.');
  const p = DB.posts.find((x) => x.post_id === decodeURIComponent(q.id));
  if (!p) return sendErr(res, 404, 'NOT_FOUND', 'Post not found.');
  if (p.status !== 'active' || p.resolved)
    return sendErr(res, 409, 'POST_NOT_ACTIVE', 'This post is no longer claimable.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const msg = (body.message || '').trim();
  if (msg.length < 10 || msg.length > 1000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'message must be 10–1000 chars.', { fields: ['message'] });
  if (DB.claims.some((c) => c.post_id === p.post_id && c.claimant_email === a.user.email_id))
    return sendErr(res, 409, 'ALREADY_EXISTS', 'You already claimed this post.');
  const c = {
    claim_id: uid('CLM'), post_id: p.post_id,
    claimant_email: a.user.email_id, claimant_name: a.user.name,
    claimant_phone_number: a.user.phone_number, claimant_role: a.user.role,
    message: msg, status: 'pending', decision: 'pending',
    created_at: nowIso(), updated_at: nowIso(),
  };
  DB.claims.push(c);
  send(res, 201, c);
});

route('GET', P('/api/v1/findit/posts/{id}/claims'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const p = DB.posts.find((x) => x.post_id === decodeURIComponent(q.id));
  if (!p) return sendErr(res, 404, 'NOT_FOUND', 'Post not found.');
  let items = DB.claims.filter((c) => c.post_id === p.post_id).sort(byNewest);
  if (!(a.kind === 'user' && isOfficeStaff(a.user)))
    items = items.filter((c) => c.claimant_email === a.email);
  send(res, 200, paginate(items, q.limit, q.cursor));
});

route('GET', P('/api/v1/findit/claims/me'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const items = DB.claims.filter((c) => c.claimant_email === a.user.email_id).sort(byNewest);
  send(res, 200, paginate(items, q.limit, q.cursor));
});

route('GET', P('/api/v1/findit/claims/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const c = DB.claims.find((x) => x.claim_id === decodeURIComponent(q.id));
  if (!c) return sendErr(res, 404, 'NOT_FOUND', 'Claim not found.');
  if (c.claimant_email !== a.user.email_id && !isOfficeStaff(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Not your claim.');
  send(res, 200, c);
});

route('DELETE', P('/api/v1/findit/claims/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const i = DB.claims.findIndex((x) => x.claim_id === decodeURIComponent(q.id));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'Claim not found.');
  const c = DB.claims[i];
  if (c.claimant_email !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the claimant can withdraw.');
  if (c.status !== 'pending')
    return sendErr(res, 409, 'CLAIM_LOCKED', 'This claim has been decided and cannot be withdrawn.');
  DB.claims.splice(i, 1);
  send(res, 200, { message: 'Claim withdrawn.' });
});

/* ---- resolution ---- */

route('POST', P('/api/v1/findit/posts/{id}/resolution'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !isOfficeStaff(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only office staff can resolve posts.');
  const p = DB.posts.find((x) => x.post_id === decodeURIComponent(q.id));
  if (!p) return sendErr(res, 404, 'NOT_FOUND', 'Post not found.');
  if (p.resolved) return sendErr(res, 409, 'ALREADY_RESOLVED', 'Already resolved — PATCH to change.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const claim = DB.claims.find((c) => c.claim_id === body.claim_id && c.post_id === p.post_id);
  if (!claim) return sendErr(res, 422, 'VALIDATION_ERROR', 'claim_id must belong to this post.', { fields: ['claim_id'] });
  const r = {
    claim_id: claim.claim_id, claimant_email: claim.claimant_email,
    note: body.note ?? null, resolved_by: a.user.email_id,
    resolved_at: nowIso(), updated_at: nowIso(),
  };
  for (const c of DB.claims.filter((c) => c.post_id === p.post_id)) {
    c.status = c.decision = c.claim_id === claim.claim_id ? 'approved' : 'rejected';
    c.updated_at = nowIso();
  }
  p.resolved = true;
  p.status = 'archived';
  p.resolution = r;
  p.updated_at = nowIso();
  send(res, 201, r);
});

route('GET', P('/api/v1/findit/posts/{id}/resolution'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const p = DB.posts.find((x) => x.post_id === decodeURIComponent(q.id));
  if (!p || !p.resolved || !p.resolution) return sendErr(res, 404, 'NOT_FOUND', 'No resolution.');
  if (!isOfficeStaff(a.user) && p.resolution.claimant_email !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only office staff and the approved claimant.');
  send(res, 200, p.resolution);
});

route('PATCH', P('/api/v1/findit/posts/{id}/resolution'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !isOfficeStaff(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only office staff.');
  const p = DB.posts.find((x) => x.post_id === decodeURIComponent(q.id));
  if (!p || !p.resolved || !p.resolution) return sendErr(res, 404, 'NOT_FOUND', 'No resolution.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  if (body.claim_id) {
    const claim = DB.claims.find((c) => c.claim_id === body.claim_id && c.post_id === p.post_id);
    if (!claim) return sendErr(res, 422, 'VALIDATION_ERROR', 'claim_id must belong to this post.', { fields: ['claim_id'] });
    for (const c of DB.claims.filter((c) => c.post_id === p.post_id)) {
      c.status = c.decision = c.claim_id === claim.claim_id ? 'approved' : 'rejected';
      c.updated_at = nowIso();
    }
    p.resolution.claim_id = claim.claim_id;
    p.resolution.claimant_email = claim.claimant_email;
  }
  if (body.note !== undefined) p.resolution.note = body.note;
  p.resolution.updated_at = nowIso();
  p.updated_at = nowIso();
  send(res, 200, p.resolution);
});

route('DELETE', P('/api/v1/findit/posts/{id}/resolution'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !isOfficeStaff(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only office staff.');
  const p = DB.posts.find((x) => x.post_id === decodeURIComponent(q.id));
  if (!p || !p.resolved) return sendErr(res, 404, 'NOT_FOUND', 'No resolution.');
  for (const c of DB.claims.filter((c) => c.post_id === p.post_id)) {
    c.status = c.decision = 'pending';
    c.updated_at = nowIso();
  }
  p.resolved = false;
  p.status = 'active';
  delete p.resolution;
  p.updated_at = nowIso();
  send(res, 200, postView(p, a.user));
});

/* ---- lost requests (bonus) ---- */

route('POST', P('/api/v1/findit/lost-requests'), async (req, res) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const title = (body.title || '').trim();
  if (title.length < 3 || title.length > 100)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'title must be 3–100 chars.', { fields: ['title'] });
  const r = {
    request_id: uid('LST'), title,
    description: body.description ?? null, location_lost: body.location_lost ?? null,
    lost_on: body.lost_on ?? null, status: 'active',
    created_by: a.user.email_id, created_by_role: a.user.role,
    created_by_name: a.user.name, created_by_phone_number: a.user.phone_number,
    created_at: nowIso(), updated_at: nowIso(),
  };
  DB.lostRequests.push(r);
  send(res, 201, r);
});

route('GET', P('/api/v1/findit/lost-requests'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  let items = [...DB.lostRequests].sort(byNewest);
  items = items.filter((r) => r.status === (q.status || 'active'));
  if (!(isOfficeStaff(a.user) && q.mine !== 'true'))
    items = items.filter((r) => r.created_by === a.user.email_id);
  send(res, 200, paginate(items, q.limit, q.cursor));
});

route('GET', P('/api/v1/findit/lost-requests/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const r = DB.lostRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Lost request not found.');
  if (r.created_by !== a.user.email_id && !isOfficeStaff(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Not your request.');
  send(res, 200, r);
});

route('PATCH', P('/api/v1/findit/lost-requests/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const r = DB.lostRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Lost request not found.');
  if (r.created_by !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the owner can edit.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  if (body.title !== undefined) {
    if (body.title.trim().length < 3 || body.title.trim().length > 100)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'title must be 3–100 chars.', { fields: ['title'] });
    r.title = body.title.trim();
  }
  for (const k of ['description', 'location_lost', 'lost_on'])
    if (body[k] !== undefined) r[k] = body[k] === '' ? null : body[k];
  if (body.status === 'active' || body.status === 'archived') r.status = body.status;
  r.updated_at = nowIso();
  send(res, 200, r);
});

route('DELETE', P('/api/v1/findit/lost-requests/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const i = DB.lostRequests.findIndex((x) => x.request_id === decodeURIComponent(q.id));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'Lost request not found.');
  if (DB.lostRequests[i].created_by !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the owner can delete.');
  DB.lostRequests.splice(i, 1);
  send(res, 200, { message: 'Lost request deleted.' });
});

/* ============================== Notice Hub ============================== */

const canPostNotice = (u) =>
  u && (u.role === 'faculty' || u.role === 'office_staff') ;

function refreshNotices() {
  // scheduled notices whose time arrived become active (mock of auto-activation)
  const t = Date.now();
  for (const n of DB.notices)
    if (n.status === 'scheduled' && new Date(n.publish_at).getTime() <= t) {
      n.status = 'active';
      n.updated_at = nowIso();
    }
}

route('POST', P('/api/v1/noticehub/notices'), async (req, res) => {
  const a = requireAuth(req, res);
  if (!a) return;
  if (a.kind === 'admin') {
    // admin CAN post notices (per analysis: admin, faculty, office_staff)
  } else if (!canPostNotice(a.user)) {
    return sendErr(res, 403, 'FORBIDDEN', 'Students cannot post notices.');
  }
  const who = a.kind === 'admin' ? a.admin : a.user;
  const { fields, files } = parseMultipart(req, await readBody(req));
  const title = (fields.title || '').trim();
  const bodyT = (fields.body || '').trim();
  if (title.length < 3 || title.length > 150)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'title must be 3–150 chars.', { fields: ['title'] });
  if (bodyT.length < 1 || bodyT.length > 5000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'body must be 1–5000 chars.', { fields: ['body'] });
  const att = (files.attachment || [])[0];
  const publishAt = fields.publish_at || new Date().toISOString().slice(0, 19);
  const n = {
    notice_id: uid('NTC'), title, body: bodyT,
    status: new Date(publishAt) > new Date() ? 'scheduled' : 'active',
    pinned: fields.pinned === 'true', publish_at: publishAt,
    attachment: att ? storeFile(att) : null,
    created_by: who.email_id, created_by_name: who.name, created_by_role: who.role,
    created_at: nowIso(), updated_at: nowIso(),
  };
  DB.notices.push(n);
  send(res, 201, n);
});

route('GET', P('/api/v1/noticehub/notices'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  refreshNotices();
  let items = [...DB.notices].sort(byNewest);
  items = items.filter((n) => n.status === (q.status || 'active'));
  if (q.mine === 'true') items = items.filter((n) => n.created_by === a.email);
  if (q.pinned === 'true') items = items.filter((n) => n.pinned);
  else if (q.pinned === 'false') items = items.filter((n) => !n.pinned);
  send(res, 200, paginate(items, q.limit, q.cursor));
});

route('GET', P('/api/v1/noticehub/notices/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  refreshNotices();
  const n = DB.notices.find((x) => x.notice_id === decodeURIComponent(q.id));
  if (!n) return sendErr(res, 404, 'NOT_FOUND', 'Notice not found.');
  send(res, 200, n);
});

route('PATCH', P('/api/v1/noticehub/notices/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  refreshNotices();
  const n = DB.notices.find((x) => x.notice_id === decodeURIComponent(q.id));
  if (!n) return sendErr(res, 404, 'NOT_FOUND', 'Notice not found.');
  if (n.created_by !== a.email)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the publisher can edit this notice.');
  const { fields, files } = parseMultipart(req, await readBody(req));
  if (fields.title !== undefined) {
    const t = fields.title.trim();
    if (t.length < 3 || t.length > 150)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'title must be 3–150 chars.', { fields: ['title'] });
    n.title = t;
  }
  if (fields.body !== undefined) {
    if (fields.body.trim().length < 1 || fields.body.trim().length > 5000)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'body must be 1–5000 chars.', { fields: ['body'] });
    n.body = fields.body.trim();
  }
  if (fields.pinned !== undefined) n.pinned = fields.pinned === 'true';
  if (fields.publish_at !== undefined) {
    if (n.status !== 'scheduled')
      return sendErr(res, 409, 'NOTICE_ALREADY_PUBLISHED', 'Only a scheduled notice can be rescheduled.');
    n.publish_at = fields.publish_at;
  }
  if (fields.status === 'archived' || fields.status === 'active') {
    n.status = fields.status === 'active' && new Date(n.publish_at) > new Date() ? 'scheduled' : fields.status;
  }
  const att = (files.attachment || [])[0];
  if (att) n.attachment = storeFile(att);
  else if (fields.remove_attachment === 'true') n.attachment = null;
  n.updated_at = nowIso();
  send(res, 200, n);
});

route('DELETE', P('/api/v1/noticehub/notices/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const i = DB.notices.findIndex((x) => x.notice_id === decodeURIComponent(q.id));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'Notice not found.');
  if (DB.notices[i].created_by !== a.email && a.kind !== 'admin')
    return sendErr(res, 403, 'FORBIDDEN', 'Only the publisher or admin can delete.');
  const nid = DB.notices[i].notice_id;
  DB.doubts = DB.doubts.filter((d) => d.notice_id !== nid);
  DB.notices.splice(i, 1);
  send(res, 200, { message: 'Notice deleted.' });
});

route('GET', P('/api/v1/noticehub/notices/{id}/attachment'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const n = DB.notices.find((x) => x.notice_id === decodeURIComponent(q.id));
  if (!n || !n.attachment) return sendErr(res, 404, 'NOT_FOUND', 'No attachment.');
  const f = DB.files[n.attachment.file_id];
  if (!f) return sendErr(res, 404, 'NOT_FOUND', 'File not found.');
  res.writeHead(200, {
    'Content-Type': f.content_type,
    'Content-Length': f.data.length,
    'Content-Disposition': `attachment; filename="${f.filename}"`,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(f.data);
});

/* ---- doubts ---- */

const canAskDoubt = (u) => u && ['student', 'faculty', 'office_staff'].includes(u.role);

route('POST', P('/api/v1/noticehub/notices/{id}/doubts'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !canAskDoubt(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only students, faculty and staff can ask doubts.');
  refreshNotices();
  const n = DB.notices.find((x) => x.notice_id === decodeURIComponent(q.id));
  if (!n) return sendErr(res, 404, 'NOT_FOUND', 'Notice not found.');
  if (n.status !== 'active')
    return sendErr(res, 409, 'NOTICE_NOT_ACTIVE', 'Doubts can only be asked on active notices.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const question = (body.question || '').trim();
  if (question.length < 5 || question.length > 1000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'question must be 5–1000 chars.', { fields: ['question'] });
  const d = {
    doubt_id: uid('DBT'), notice_id: n.notice_id, question,
    asked_by: a.user.email_id, asked_by_name: a.user.name, asked_by_role: a.user.role,
    answered: false, response: null,
    created_at: nowIso(), updated_at: nowIso(),
  };
  DB.doubts.push(d);
  send(res, 201, d);
});

route('GET', P('/api/v1/noticehub/notices/{id}/doubts'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const n = DB.notices.find((x) => x.notice_id === decodeURIComponent(q.id));
  if (!n) return sendErr(res, 404, 'NOT_FOUND', 'Notice not found.');
  let items = DB.doubts.filter((d) => d.notice_id === n.notice_id).sort(byNewest);
  if (q.answered === 'true') items = items.filter((d) => d.answered);
  else if (q.answered === 'false') items = items.filter((d) => !d.answered);
  if (q.mine === 'true') items = items.filter((d) => d.asked_by === a.email);
  send(res, 200, paginate(items, q.limit, q.cursor));
});

route('GET', P('/api/v1/noticehub/doubts/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const d = DB.doubts.find((x) => x.doubt_id === decodeURIComponent(q.id));
  if (!d) return sendErr(res, 404, 'NOT_FOUND', 'Doubt not found.');
  send(res, 200, d);
});

route('PATCH', P('/api/v1/noticehub/doubts/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const d = DB.doubts.find((x) => x.doubt_id === decodeURIComponent(q.id));
  if (!d) return sendErr(res, 404, 'NOT_FOUND', 'Doubt not found.');
  if (d.asked_by !== a.email)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the asker can edit.');
  if (d.answered) return sendErr(res, 409, 'DOUBT_ANSWERED', 'Cannot edit an answered doubt.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const question = (body.question || '').trim();
  if (question.length < 5 || question.length > 1000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'question must be 5–1000 chars.', { fields: ['question'] });
  d.question = question;
  d.updated_at = nowIso();
  send(res, 200, d);
});

route('DELETE', P('/api/v1/noticehub/doubts/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const i = DB.doubts.findIndex((x) => x.doubt_id === decodeURIComponent(q.id));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'Doubt not found.');
  if (DB.doubts[i].asked_by !== a.email && a.kind !== 'admin')
    return sendErr(res, 403, 'FORBIDDEN', 'Only the asker or admin can delete.');
  DB.doubts.splice(i, 1);
  send(res, 200, { message: 'Doubt deleted.' });
});

/* ---- responses (one per doubt) ---- */

function canRespond(a, doubt) {
  if (a.kind === 'admin') return true;
  const n = DB.notices.find((x) => x.notice_id === doubt.notice_id);
  return n && n.created_by === a.email;
}

route('POST', P('/api/v1/noticehub/doubts/{id}/response'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const d = DB.doubts.find((x) => x.doubt_id === decodeURIComponent(q.id));
  if (!d) return sendErr(res, 404, 'NOT_FOUND', 'Doubt not found.');
  if (!canRespond(a, d))
    return sendErr(res, 403, 'FORBIDDEN', 'Only the notice publisher or admin can respond.');
  if (d.answered) return sendErr(res, 409, 'ALREADY_ANSWERED', 'One response per doubt — PATCH to edit.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const message = (body.message || '').trim();
  if (message.length < 1 || message.length > 2000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'message must be 1–2000 chars.', { fields: ['message'] });
  const who = a.kind === 'admin' ? a.admin : a.user;
  d.response = {
    message, responded_by: who.email_id, responded_by_name: who.name,
    responded_by_role: who.role, responded_at: nowIso(), updated_at: nowIso(),
  };
  d.answered = true;
  d.updated_at = nowIso();
  send(res, 201, d);
});

route('GET', P('/api/v1/noticehub/doubts/{id}/response'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const d = DB.doubts.find((x) => x.doubt_id === decodeURIComponent(q.id));
  if (!d || !d.answered || !d.response) return sendErr(res, 404, 'NOT_FOUND', 'No response yet.');
  send(res, 200, d.response);
});

route('PATCH', P('/api/v1/noticehub/doubts/{id}/response'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const d = DB.doubts.find((x) => x.doubt_id === decodeURIComponent(q.id));
  if (!d || !d.answered || !d.response) return sendErr(res, 404, 'NOT_FOUND', 'No response yet.');
  if (d.response.responded_by !== a.email && a.kind !== 'admin')
    return sendErr(res, 403, 'FORBIDDEN', 'Only the responder or admin can edit.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const message = (body.message || '').trim();
  if (message.length < 1 || message.length > 2000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'message must be 1–2000 chars.', { fields: ['message'] });
  d.response.message = message;
  d.response.updated_at = nowIso();
  d.updated_at = nowIso();
  send(res, 200, d);
});

route('DELETE', P('/api/v1/noticehub/doubts/{id}/response'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const d = DB.doubts.find((x) => x.doubt_id === decodeURIComponent(q.id));
  if (!d || !d.answered || !d.response) return sendErr(res, 404, 'NOT_FOUND', 'No response yet.');
  if (d.response.responded_by !== a.email && a.kind !== 'admin')
    return sendErr(res, 403, 'FORBIDDEN', 'Only the responder or admin can remove.');
  d.response = null;
  d.answered = false;
  d.updated_at = nowIso();
  send(res, 200, d);
});

/* ============================== DocDesk ============================== */

const canRequestDoc = (u) => u && ['student', 'faculty', 'office_staff'].includes(u.role);

function docRequestVisible(r, a) {
  if (a.kind === 'admin') return true;
  const u = a.user;
  if (isStudentAffairs(u)) return true;
  return r.requested_by === u.email_id;
}

function docView(r) {
  // strip internal file bytes; keep FileRefs
  return r;
}

route('POST', P('/api/v1/docdesk/requests'), async (req, res) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !canRequestDoc(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Admins are read-only in DocDesk.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const dt = DB.docTypes.find((d) => d.doc_type_id === body.doc_type_id);
  if (!dt) return sendErr(res, 422, 'VALIDATION_ERROR', 'Unknown doc_type_id.', { fields: ['doc_type_id'] });
  if (dt.status === 'archived')
    return sendErr(res, 409, 'DOC_TYPE_ARCHIVED', 'This document type is archived.');
  const reason = (body.reason || '').trim();
  if (reason.length < 5 || reason.length > 1000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'reason must be 5–1000 chars.', { fields: ['reason'] });
  const r = {
    request_id: uid('DRQ'), doc_type_id: dt.doc_type_id, doc_type_name: dt.name,
    reason, status: 'pending', tat: null, answer: null, document: null, filled_form: null,
    acknowledged_at: null,
    requested_by: a.user.email_id, requested_by_name: a.user.name,
    requested_by_role: a.user.role, requested_by_dept: a.user.dept || null,
    requested_by_phone_number: a.user.phone_number,
    created_at: nowIso(), updated_at: nowIso(),
  };
  DB.docRequests.push(r);
  send(res, 201, docView(r));
});

route('GET', P('/api/v1/docdesk/requests'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  let items = [...DB.docRequests].sort(byNewest).filter((r) => docRequestVisible(r, a));
  if (q.status) items = items.filter((r) => r.status === q.status);
  if (q.doc_type_id) items = items.filter((r) => r.doc_type_id === q.doc_type_id);
  if (q.mine === 'true' && a.kind === 'user')
    items = items.filter((r) => r.requested_by === a.user.email_id);
  send(res, 200, paginate(items.map(docView), q.limit, q.cursor));
});

route('GET', P('/api/v1/docdesk/requests/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r || !docRequestVisible(r, a)) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  send(res, 200, docView(r));
});

route('PATCH', P('/api/v1/docdesk/requests/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Admins are read-only in DocDesk.');
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  if (r.requested_by !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the requester can edit.');
  if (r.status !== 'pending')
    return sendErr(res, 409, 'REQUEST_NOT_PENDING', 'Only pending requests can be edited.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  if (body.doc_type_id !== undefined) {
    const dt = DB.docTypes.find((d) => d.doc_type_id === body.doc_type_id);
    if (!dt) return sendErr(res, 422, 'VALIDATION_ERROR', 'Unknown doc_type_id.', { fields: ['doc_type_id'] });
    if (dt.status === 'archived')
      return sendErr(res, 409, 'DOC_TYPE_ARCHIVED', 'This document type is archived.');
    r.doc_type_id = dt.doc_type_id;
    r.doc_type_name = dt.name;
  }
  if (body.reason !== undefined) {
    const reason = String(body.reason).trim();
    if (reason.length < 5 || reason.length > 1000)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'reason must be 5–1000 chars.', { fields: ['reason'] });
    r.reason = reason;
  }
  r.updated_at = nowIso();
  send(res, 200, docView(r));
});

route('DELETE', P('/api/v1/docdesk/requests/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Admins are read-only in DocDesk.');
  const i = DB.docRequests.findIndex((x) => x.request_id === decodeURIComponent(q.id));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  const r = DB.docRequests[i];
  if (r.requested_by !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the requester can withdraw.');
  if (r.status !== 'pending')
    return sendErr(res, 409, 'REQUEST_NOT_PENDING', 'Only pending requests can be withdrawn.');
  DB.docRequests.splice(i, 1);
  send(res, 200, { message: 'Request withdrawn.' });
});

/* ---- answers (Student Affairs) ---- */

route('POST', P('/api/v1/docdesk/requests/{id}/answer'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !isStudentAffairs(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only Student Affairs staff can answer.');
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  if (r.status !== 'pending')
    return sendErr(res, 409, 'REQUEST_NOT_PENDING', 'Only pending requests can be answered.');
  const { fields, files } = parseMultipart(req, await readBody(req));
  const message = (fields.message || '').trim();
  if (message.length < 1 || message.length > 2000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'message must be 1–2000 chars.', { fields: ['message'] });
  const doc = (files.document || [])[0];
  r.answer = {
    message, answered_by: a.user.email_id, answered_by_name: a.user.name,
    answered_at: nowIso(), updated_at: nowIso(),
  };
  r.document = doc ? storeFile(doc) : null;
  r.status = 'answered';
  r.updated_at = nowIso();
  send(res, 201, docView(r));
});

route('PATCH', P('/api/v1/docdesk/requests/{id}/answer'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !isStudentAffairs(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only Student Affairs staff.');
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  if (!r.answer) return sendErr(res, 409, 'NOT_ANSWERED', 'No answer to change yet.');
  if (r.status === 'acknowledged')
    return sendErr(res, 409, 'ALREADY_ACKNOWLEDGED', 'Request is closed.');
  const { fields, files } = parseMultipart(req, await readBody(req));
  if (fields.message !== undefined) {
    const message = fields.message.trim();
    if (message.length < 1 || message.length > 2000)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'message must be 1–2000 chars.', { fields: ['message'] });
    r.answer.message = message;
    r.answer.updated_at = nowIso();
  }
  const doc = (files.document || [])[0];
  if (doc) {
    r.document = storeFile(doc);
    r.filled_form = null; // new document invalidates the filled form
  } else if (fields.remove_document === 'true') {
    r.document = null;
    r.filled_form = null;
  }
  r.updated_at = nowIso();
  send(res, 200, docView(r));
});

route('DELETE', P('/api/v1/docdesk/requests/{id}/answer'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !isStudentAffairs(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Only Student Affairs staff.');
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  if (!r.answer) return sendErr(res, 409, 'NOT_ANSWERED', 'No answer to withdraw.');
  r.answer = null;
  r.document = null;
  r.filled_form = null;
  r.status = 'pending';
  r.updated_at = nowIso();
  send(res, 200, docView(r));
});

route('POST', P('/api/v1/docdesk/requests/{id}/acknowledge'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  if (r.requested_by !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the requester can acknowledge.');
  if (r.status !== 'answered')
    return sendErr(res, 409, 'NOT_ANSWERED', 'Nothing to acknowledge yet.');
  r.status = 'acknowledged';
  r.acknowledged_at = nowIso();
  r.updated_at = nowIso();
  send(res, 200, docView(r));
});

/* ---- doc types (bonus, Student Affairs) ---- */

route('GET', P('/api/v1/docdesk/doc-types'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  let items = [...DB.docTypes].sort(byNewest);
  items = items.filter((d) => d.status === (q.status || 'active'));
  send(res, 200, paginate(items, q.limit, q.cursor));
});

route('GET', P('/api/v1/docdesk/doc-types/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const d = DB.docTypes.find((x) => x.doc_type_id === decodeURIComponent(q.id));
  if (!d) return sendErr(res, 404, 'NOT_FOUND', 'Doc type not found.');
  send(res, 200, d);
});

function requireStudentAffairs(req, res) {
  const a = requireAuth(req, res);
  if (!a) return null;
  if (a.kind !== 'user' || !isStudentAffairs(a.user)) {
    sendErr(res, 403, 'FORBIDDEN', 'Only Student Affairs staff.');
    return null;
  }
  return a;
}

route('POST', P('/api/v1/docdesk/doc-types'), async (req, res) => {
  if (!requireStudentAffairs(req, res)) return;
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const name = (body.name || '').trim();
  if (name.length < 3 || name.length > 80)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'name must be 3–80 chars.', { fields: ['name'] });
  if (DB.docTypes.some((d) => d.name.toLowerCase() === name.toLowerCase()))
    return sendErr(res, 409, 'ALREADY_EXISTS', 'A doc type with this name already exists.');
  const a = authOf(req);
  const d = {
    doc_type_id: uid('DTY'), name, description: body.description ?? null, status: 'active',
    created_by: a.email, created_at: nowIso(), updated_at: nowIso(),
  };
  DB.docTypes.push(d);
  send(res, 201, d);
});

route('PATCH', P('/api/v1/docdesk/doc-types/{id}'), async (req, res, q) => {
  if (!requireStudentAffairs(req, res)) return;
  const d = DB.docTypes.find((x) => x.doc_type_id === decodeURIComponent(q.id));
  if (!d) return sendErr(res, 404, 'NOT_FOUND', 'Doc type not found.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 3 || name.length > 80)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'name must be 3–80 chars.', { fields: ['name'] });
    if (DB.docTypes.some((x) => x !== d && x.name.toLowerCase() === name.toLowerCase()))
      return sendErr(res, 409, 'ALREADY_EXISTS', 'A doc type with this name already exists.');
    d.name = name;
  }
  if (body.description !== undefined) d.description = body.description === '' ? null : body.description;
  if (body.status === 'active' || body.status === 'archived') d.status = body.status;
  d.updated_at = nowIso();
  send(res, 200, d);
});

route('DELETE', P('/api/v1/docdesk/doc-types/{id}'), async (req, res, q) => {
  if (!requireStudentAffairs(req, res)) return;
  const i = DB.docTypes.findIndex((x) => x.doc_type_id === decodeURIComponent(q.id));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'Doc type not found.');
  DB.docTypes.splice(i, 1);
  send(res, 200, { message: 'Doc type deleted.' });
});

/* ---- TAT (bonus) ---- */

function applyTat(r, expected_by, note, byEmail) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expected_by || ''))
    return 'expected_by must be YYYY-MM-DD.';
  const today = new Date().toISOString().slice(0, 10);
  if (expected_by < today) return 'expected_by cannot be before today.';
  r.tat = { expected_by, note: note ?? null, updated_by: byEmail, updated_at: nowIso() };
  r.updated_at = nowIso();
  return null;
}

route('PUT', P('/api/v1/docdesk/requests/{id}/tat'), async (req, res, q) => {
  const a = requireStudentAffairs(req, res);
  if (!a) return;
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const problem = applyTat(r, body.expected_by, body.note, a.email);
  if (problem) return sendErr(res, 422, 'VALIDATION_ERROR', problem, { fields: ['expected_by'] });
  send(res, 200, docView(r));
});

route('POST', P('/api/v1/docdesk/requests/bulk-tat'), async (req, res) => {
  const a = requireStudentAffairs(req, res);
  if (!a) return;
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const ids = body.request_ids || [];
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'request_ids must have 1–100 entries.', { fields: ['request_ids'] });
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.expected_by || '') || body.expected_by < today)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'expected_by must be YYYY-MM-DD and not before today.', { fields: ['expected_by'] });
  // all-or-nothing: validate everything first
  const bad = [];
  const targets = [];
  for (const id of ids) {
    const r = DB.docRequests.find((x) => x.request_id === id);
    if (!r) { bad.push(id); continue; }
    if (r.status !== 'pending') { bad.push(id); continue; }
    targets.push(r);
  }
  if (bad.length)
    return sendErr(res, 409, 'REQUEST_NOT_PENDING', 'Some requests are missing or not pending — nothing was changed.', { request_ids: bad });
  for (const r of targets) applyTat(r, body.expected_by, body.note, a.email);
  send(res, 200, { items: targets.map(docView), count: targets.length });
});

/* ---- documents & filled forms (bonus) ---- */

function serveFile(res, ref) {
  if (!ref) return sendErr(res, 404, 'NOT_FOUND', 'No file.');
  const f = DB.files[ref.file_id];
  if (!f) return sendErr(res, 404, 'NOT_FOUND', 'File not found.');
  res.writeHead(200, {
    'Content-Type': f.content_type,
    'Content-Length': f.data.length,
    'Content-Disposition': `attachment; filename="${f.filename}"`,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(f.data);
}

route('GET', P('/api/v1/docdesk/requests/{id}/document'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r || !docRequestVisible(r, a)) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  serveFile(res, r.document);
});

route('PUT', P('/api/v1/docdesk/requests/{id}/filled-form'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  if (r.requested_by !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the requester can upload the filled form.');
  if (r.status === 'acknowledged')
    return sendErr(res, 409, 'ALREADY_ACKNOWLEDGED', 'Request is closed.');
  if (r.status !== 'answered' || !r.answer)
    return sendErr(res, 409, 'NOT_ANSWERED', 'Wait for the answer first.');
  if (!r.document)
    return sendErr(res, 409, 'NO_DOCUMENT', 'The answer has no document to fill in.');
  const { files } = parseMultipart(req, await readBody(req));
  const file = (files.file || [])[0];
  if (!file) return sendErr(res, 422, 'VALIDATION_ERROR', 'Attach the filled form as "file".', { fields: ['file'] });
  r.filled_form = storeFile(file);
  r.updated_at = nowIso();
  send(res, 200, docView(r));
});

route('GET', P('/api/v1/docdesk/requests/{id}/filled-form'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r || !docRequestVisible(r, a)) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  serveFile(res, r.filled_form);
});

route('DELETE', P('/api/v1/docdesk/requests/{id}/filled-form'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const r = DB.docRequests.find((x) => x.request_id === decodeURIComponent(q.id));
  if (!r) return sendErr(res, 404, 'NOT_FOUND', 'Request not found.');
  if (r.requested_by !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the requester.');
  if (r.status === 'acknowledged')
    return sendErr(res, 409, 'ALREADY_ACKNOWLEDGED', 'Request is closed.');
  if (!r.filled_form) return sendErr(res, 404, 'NOT_FOUND', 'No filled form.');
  r.filled_form = null;
  r.updated_at = nowIso();
  send(res, 200, docView(r));
});

/* ============================== FixIt ============================== */

function ticketVisible(t, a) {
  if (a.kind === 'admin') return true;
  const u = a.user;
  if (isCampusMaintenance(u)) return true;
  return t.reporter_email === u.email_id;
}

function ticketView(t) {
  const v = { ...t };
  if (v.tat && v.status === 'open') {
    const today = new Date().toISOString().slice(0, 10);
    v.overdue = v.tat.expected_by < today;
  } else v.overdue = false;
  return v;
}

function requireCampusMaintenance(req, res) {
  const a = requireAuth(req, res);
  if (!a) return null;
  if (a.kind !== 'user' || !isCampusMaintenance(a.user)) {
    sendErr(res, 403, 'FORBIDDEN', 'Only Campus Maintenance staff.');
    return null;
  }
  return a;
}

route('POST', P('/api/v1/fixit/tickets'), async (req, res) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user' || !canRequestDoc(a.user))
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a student, faculty or staff member.');
  const { fields, files } = parseMultipart(req, await readBody(req));
  const it = DB.issueTypes.find((t) => t.issue_type_id === fields.issue_type_id);
  if (!it) return sendErr(res, 422, 'VALIDATION_ERROR', 'Unknown issue_type_id — pick one from GET /issue-types.', { fields: ['issue_type_id'] });
  const title = (fields.title || '').trim();
  const description = (fields.description || '').trim();
  if (title.length < 3 || title.length > 120)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'title must be 3–120 chars.', { fields: ['title'] });
  if (description.length < 5 || description.length > 2000)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'description must be 5–2000 chars — say WHERE the problem is.', { fields: ['description'] });
  const photo = (files.photo || [])[0];
  const t = {
    ticket_id: uid('TKT'), issue_type_id: it.issue_type_id, issue_type_name: it.name,
    title, description, photo: photo ? storeFile(photo) : null,
    status: 'open', status_note: null, tat: null, overdue: false,
    reporter_email: a.user.email_id, reporter_name: a.user.name,
    reporter_role: a.user.role, reporter_phone_number: a.user.phone_number,
    acknowledged_at: null, created_at: nowIso(), updated_at: nowIso(),
  };
  DB.tickets.push(t);
  send(res, 201, ticketView(t));
});

route('GET', P('/api/v1/fixit/tickets'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  let items = [...DB.tickets].sort(byNewest).filter((t) => ticketVisible(t, a));
  if (q.status) items = items.filter((t) => t.status === q.status);
  if (q.issue_type_id) items = items.filter((t) => t.issue_type_id === q.issue_type_id);
  if (q.mine === 'true' && a.kind === 'user')
    items = items.filter((t) => t.reporter_email === a.user.email_id);
  send(res, 200, paginate(items.map(ticketView), q.limit, q.cursor));
});

route('GET', P('/api/v1/fixit/tickets/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const t = DB.tickets.find((x) => x.ticket_id === decodeURIComponent(q.id));
  if (!t || !ticketVisible(t, a)) return sendErr(res, 404, 'NOT_FOUND', 'Ticket not found.');
  send(res, 200, ticketView(t));
});

route('PATCH', P('/api/v1/fixit/tickets/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const t = DB.tickets.find((x) => x.ticket_id === decodeURIComponent(q.id));
  if (!t) return sendErr(res, 404, 'NOT_FOUND', 'Ticket not found.');
  if (t.reporter_email !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the reporter can edit.');
  if (t.status !== 'open')
    return sendErr(res, 409, 'TICKET_NOT_OPEN', 'Only open tickets can be edited.');
  const { fields, files } = parseMultipart(req, await readBody(req));
  if (fields.issue_type_id !== undefined) {
    const it = DB.issueTypes.find((x) => x.issue_type_id === fields.issue_type_id);
    if (!it) return sendErr(res, 422, 'VALIDATION_ERROR', 'Unknown issue_type_id.', { fields: ['issue_type_id'] });
    t.issue_type_id = it.issue_type_id;
    t.issue_type_name = it.name;
  }
  if (fields.title !== undefined) {
    if (fields.title.trim().length < 3 || fields.title.trim().length > 120)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'title must be 3–120 chars.', { fields: ['title'] });
    t.title = fields.title.trim();
  }
  if (fields.description !== undefined) {
    if (fields.description.trim().length < 5 || fields.description.trim().length > 2000)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'description must be 5–2000 chars.', { fields: ['description'] });
    t.description = fields.description.trim();
  }
  const photo = (files.photo || [])[0];
  if (photo) t.photo = storeFile(photo);
  else if (fields.remove_photo === 'true') t.photo = null;
  t.updated_at = nowIso();
  send(res, 200, ticketView(t));
});

route('DELETE', P('/api/v1/fixit/tickets/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const i = DB.tickets.findIndex((x) => x.ticket_id === decodeURIComponent(q.id));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'Ticket not found.');
  const t = DB.tickets[i];
  const isReporter = a.kind === 'user' && t.reporter_email === a.user.email_id && t.status === 'open';
  const isCM = a.kind === 'user' && isCampusMaintenance(a.user);
  if (!isReporter && !isCM && a.kind !== 'admin')
    return sendErr(res, 403, 'FORBIDDEN', 'Only the reporter (while open), Campus Maintenance or admin.');
  DB.tickets.splice(i, 1);
  send(res, 200, { message: 'Ticket deleted.' });
});

route('GET', P('/api/v1/fixit/tickets/{id}/photo'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const t = DB.tickets.find((x) => x.ticket_id === decodeURIComponent(q.id));
  if (!t || !ticketVisible(t, a)) return sendErr(res, 404, 'NOT_FOUND', 'Ticket not found.');
  serveFile(res, t.photo);
});

route('PUT', P('/api/v1/fixit/tickets/{id}/status'), async (req, res, q) => {
  const a = requireCampusMaintenance(req, res);
  if (!a) return;
  const t = DB.tickets.find((x) => x.ticket_id === decodeURIComponent(q.id));
  if (!t) return sendErr(res, 404, 'NOT_FOUND', 'Ticket not found.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const note = (body.note || '').trim();
  if (note.length < 1 || note.length > 280)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'note is required (1–280 chars) and the reporter sees it.', { fields: ['note'] });
  if (body.status !== 'open' && body.status !== 'resolved')
    return sendErr(res, 422, 'VALIDATION_ERROR', 'status must be open | resolved.', { fields: ['status'] });
  t.status = body.status;
  t.status_note = note;
  t.updated_at = nowIso();
  send(res, 200, ticketView(t));
});

route('POST', P('/api/v1/fixit/tickets/{id}/acknowledge'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a || a.kind !== 'user')
    return sendErr(res, 403, 'FORBIDDEN', 'Log in as a user.');
  const t = DB.tickets.find((x) => x.ticket_id === decodeURIComponent(q.id));
  if (!t) return sendErr(res, 404, 'NOT_FOUND', 'Ticket not found.');
  if (t.reporter_email !== a.user.email_id)
    return sendErr(res, 403, 'FORBIDDEN', 'Only the reporter can acknowledge.');
  if (t.status !== 'resolved')
    return sendErr(res, 409, 'NOT_RESOLVED', 'The ticket is not resolved yet.');
  t.status = 'acknowledged';
  t.acknowledged_at = nowIso();
  t.updated_at = nowIso();
  send(res, 200, ticketView(t));
});

route('PUT', P('/api/v1/fixit/tickets/{id}/tat'), async (req, res, q) => {
  const a = requireCampusMaintenance(req, res);
  if (!a) return;
  const t = DB.tickets.find((x) => x.ticket_id === decodeURIComponent(q.id));
  if (!t) return sendErr(res, 404, 'NOT_FOUND', 'Ticket not found.');
  if (t.status !== 'open')
    return sendErr(res, 409, 'TICKET_RESOLVED', 'Reopen the ticket first.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const problem = applyTat(t, body.expected_by, body.note, a.email);
  if (problem) return sendErr(res, 422, 'VALIDATION_ERROR', problem, { fields: ['expected_by'] });
  send(res, 200, ticketView(t));
});

/* ---- issue types (bonus) ---- */

route('GET', P('/api/v1/fixit/issue-types'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  send(res, 200, paginate([...DB.issueTypes].sort(byNewest), q.limit, q.cursor));
});

route('GET', P('/api/v1/fixit/issue-types/{id}'), async (req, res, q) => {
  const a = requireAuth(req, res);
  if (!a) return;
  const t = DB.issueTypes.find((x) => x.issue_type_id === decodeURIComponent(q.id));
  if (!t) return sendErr(res, 404, 'NOT_FOUND', 'Issue type not found.');
  send(res, 200, t);
});

route('POST', P('/api/v1/fixit/issue-types'), async (req, res) => {
  const a = requireCampusMaintenance(req, res);
  if (!a) return;
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  const name = (body.name || '').trim();
  if (name.length < 3 || name.length > 80)
    return sendErr(res, 422, 'VALIDATION_ERROR', 'name must be 3–80 chars.', { fields: ['name'] });
  if (DB.issueTypes.some((t) => t.name.toLowerCase() === name.toLowerCase()))
    return sendErr(res, 409, 'ALREADY_EXISTS', 'An issue type with this name already exists.');
  const t = {
    issue_type_id: uid('ITY'), name, description: body.description ?? null,
    created_by: a.email, created_at: nowIso(), updated_at: nowIso(),
  };
  DB.issueTypes.push(t);
  send(res, 201, t);
});

route('PATCH', P('/api/v1/fixit/issue-types/{id}'), async (req, res, q) => {
  const a = requireCampusMaintenance(req, res);
  if (!a) return;
  const t = DB.issueTypes.find((x) => x.issue_type_id === decodeURIComponent(q.id));
  if (!t) return sendErr(res, 404, 'NOT_FOUND', 'Issue type not found.');
  const body = await readJson(req);
  if (body === null) return sendErr(res, 400, 'VALIDATION_ERROR', 'Invalid JSON.');
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 3 || name.length > 80)
      return sendErr(res, 422, 'VALIDATION_ERROR', 'name must be 3–80 chars.', { fields: ['name'] });
    if (DB.issueTypes.some((x) => x !== t && x.name.toLowerCase() === name.toLowerCase()))
      return sendErr(res, 409, 'ALREADY_EXISTS', 'An issue type with this name already exists.');
    t.name = name;
  }
  if (body.description !== undefined) t.description = body.description === '' ? null : body.description;
  t.updated_at = nowIso();
  send(res, 200, t);
});

route('DELETE', P('/api/v1/fixit/issue-types/{id}'), async (req, res, q) => {
  const a = requireCampusMaintenance(req, res);
  if (!a) return;
  const i = DB.issueTypes.findIndex((x) => x.issue_type_id === decodeURIComponent(q.id));
  if (i === -1) return sendErr(res, 404, 'NOT_FOUND', 'Issue type not found.');
  DB.issueTypes.splice(i, 1);
  send(res, 200, { message: 'Issue type deleted.' });
});

/* ============================== start ============================== */

seed();
// ---------------------------------------------------------------------------
// Vercel serverless entry: re-uses the mock's `dispatch` request handler.
// When run directly (`node mock-server.cjs`) it still starts a local server.
// ---------------------------------------------------------------------------
if (require.main === module) {
  const server = http.createServer(dispatch);
  server.listen(PORT, () => {
    console.log('');
    console.log('  CampusOS Mock API  →  http://localhost:' + PORT);
    console.log('');
  });
}

module.exports = { dispatch };
