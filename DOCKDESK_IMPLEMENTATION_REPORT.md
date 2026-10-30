# DockDesk Implementation Report — College Documents Desk re-skin

Date: 2026-10-31 · Track: `src/tracks/docdesk` · Repo: CH-Bhaskar/campus-os-frontend-public

## 1. Original architecture
Vite + React 19 + TS + React Router 7 + Tailwind v4 (theme.css + utilities.css, no
preflight) + Vitest. Track system: `src/tracks/<id>/index.ts` manifest,
auto-discovered, routes relative to `/tracks/<id>`, lazy-loaded. DocDesk track
had a complete typed API client (`api/client.ts`, `api/docdesk.ts`, `api/types.ts`),
role routing in `screens/DocDeskPage.tsx` (admin → AdminView, Student Affairs
office_staff → StaffConsole, others → RequesterView), and an "Ivy & Brass"
visual identity (deep green + gold, Fraunces serif).

## 2. What changed (Phase 4 — UI integration)
Re-skinned the DocDesk track to the College Documents Desk design (periwinkle
`#4f46e5`, ink `#1e1b4b`, paper `#f3f5fd`, navy `#232350`, Poppins + Inter).
**Presentation only — zero logic changes.**

| File | Change |
|---|---|
| `src/tracks/docdesk/theme.css` | Rewritten: desk tokens, `card-desk`/`lift`/`thin-scroll` utilities, `.docdesk-scope` canvas, dark-variant remap kept |
| `src/tracks/docdesk/components/ui.tsx` | Rewritten: rounded-full buttons (navy primary), card-desk cards, tinted badges, Poppins headings, periwinkle logo; **same props/API** |
| `index.html` | Google Fonts: Fraunces → Poppins (shared file, fonts only) |
| `screens/*.tsx`, `components/*.tsx` | Class migration ivy→indigo, brass→amber, paper→desk-bg, ink→desk-ink, night→slate, shadow-card→shadow-desk (scripted, verified zero stragglers) |

**Untouched:** `api/` (client, docdesk.ts, types.ts), `DocDeskPage.tsx` role logic,
`index.ts` manifest, `routes.tsx`, all data fetching/mutations, auth, mock server.

## 3. API verification (live backend)
Base: `https://campus-os-backend-8sjf.onrender.com` — OpenAPI spec fetched and
compared. All 10 DocDesk paths and schemas match the typed client
(`doc_type_id`/`reason`, answer multipart `message`+`document`, filled-form
`file`, bulk-TAT `expected_by`/`note`/`request_ids`). **No API code changed.**

| Feature | Endpoint | Method | Auth | Status |
|---|---|---|---|---|
| Create request | /api/v1/docdesk/requests | POST | Bearer | Verified vs OpenAPI |
| List requests | /api/v1/docdesk/requests | GET | Bearer | Verified vs OpenAPI |
| Request details | /api/v1/docdesk/requests/{id} | GET | Bearer | Verified vs OpenAPI |
| Edit request | /api/v1/docdesk/requests/{id} | PATCH | Bearer | Verified vs OpenAPI |
| Withdraw request | /api/v1/docdesk/requests/{id} | DELETE | Bearer | Verified vs OpenAPI |
| Answer request | /api/v1/docdesk/requests/{id}/answer | POST | Bearer | Verified vs OpenAPI |
| Update answer | /api/v1/docdesk/requests/{id}/answer | PATCH | Bearer | Verified vs OpenAPI |
| Withdraw answer | /api/v1/docdesk/requests/{id}/answer | DELETE | Bearer | Verified vs OpenAPI |
| Acknowledge | /api/v1/docdesk/requests/{id}/acknowledge | POST | Bearer | Verified vs OpenAPI |
| Bulk TAT | /api/v1/docdesk/requests/bulk-tat | POST | Bearer | Verified vs OpenAPI |
| Single TAT | /api/v1/docdesk/requests/{id}/tat | PUT | Bearer | Verified vs OpenAPI |
| Answer document | /api/v1/docdesk/requests/{id}/document | GET | Bearer | Verified vs OpenAPI |
| Filled form | /api/v1/docdesk/requests/{id}/filled-form | GET/PUT/DELETE | Bearer | Verified vs OpenAPI |
| Doc types | /api/v1/docdesk/doc-types | GET/POST | Bearer | Verified vs OpenAPI |
| Doc type detail | /api/v1/docdesk/doc-types/{id} | GET/PATCH/DELETE | Bearer | Verified vs OpenAPI |

## 4. Live smoke test (team-32 admin, read-only)
- `POST /api/v1/auth/admin/login` → 200, token issued (role admin, team32)
- `GET /api/v1/docdesk/requests` → 200, `{count, items}` shape matches client
- `GET /api/v1/docdesk/doc-types` → 200
- Team has 0 requests / 0 doc types so far (fresh). No data was modified.

## 5. Checks
- `npm run build` (tsc + vite): clean
- `npm test`: 33/33 pass (8 files, incl. track boundary tests)
- Pushed to `main` as `09eda0e`

## 6. Known issues / remaining work
- Render cold start: first API call can take 30–90s; the client's timeout handling
  covers it, but the team should warm the backend before demos.
- Full role testing (student raise → SA answer → acknowledge) needs student and
  Student Affairs accounts — the team admin creates them via
  `POST /api/v1/admin/users`; not done here (no test accounts invented).
- The Vercel demo deploy stalled at Google sign-in (2026-10-30); retry when ready.
- Mock server (`workspace/hackathon-2026-10-30/mock-server`) kept for offline dev.

## 7. Run it
```bash
git clone https://github.com/CH-Bhaskar/campus-os-frontend-public.git
cd campus-os-frontend-public && npm install
# .env:  VITE_API_BASE_URL=https://campus-os-backend-8sjf.onrender.com
npm run dev   # open /tracks/docdesk
```
