# Testing

## Commands
```bash
npm test         # unit tests (node --test, no extra dependencies)
npm run lint     # ESLint
npm run build    # production build
```

## Unit tests (`tests/`)

| File | Covers |
|---|---|
| `queue.test.js` | emergency-first then token ordering, missing/mixed-case priority, wait estimate, pending emergency requests |
| `bookingErrors.test.js` | duplicate same-day booking, slot clash, other unique violations, permission and foreign-key errors, never showing raw database text for unique violations |
| `roleRoutes.test.js` | signed-out redirects, each role limited to its own area, unknown roles treated as patient, home route per role |

### Last verified results (2026-10-29, local)
- `npm test`: 13 passed, 0 failed
- `npm run lint`: 0 errors, 3 warnings (pre-existing: two unused eslint-disable comments, one hook dependency warning in `AdminQueueControl.jsx`)
- `npm run build`: succeeded

## Database tests (Supabase SQL Editor)

| Script | What it does | Changes data? |
|---|---|---|
| `supabase_verify_readonly.sql` | Lists live RLS policies, triggers, functions (security definer, anon access), indexes and whether the emergency column exists | No |
| `supabase_inspect_readonly.sql` | Live function definitions, grants, columns, constraints, triggers, policies and aggregate counts (READ ONLY transaction) | No |
| `supabase_verify_behaviour.sql` | Inserts disposable appointments on 2099-01-06 and checks: queue position, emergency-first order and own-rows-only (Q1–Q3), token sequence (T1), patient insert sanitised (E1), patient priority / status / schedule updates blocked (E2, E4), patient may withdraw a request (E5), follow-up of another patient rejected (E6), doctor status update (E7), admin approval (E3), duplicate same-day booking rejected by `uq_patient_doctor_day_active` (D1) | No: it always ends with an error that carries the report, which rolls everything back. Only identity ids are consumed |

Both can be run from the terminal with `npm run db -- <file>` (see README); the runner executes the file in one transaction and prints the result or report without showing the connection string.

Run the behaviour script after `supabase_queue_status.sql` and `supabase_emergency_requests.sql`. The patient-path tests use a random user id that matches no profile (so it is neither admin nor doctor); they test the trigger, not RLS, and need no patient account.

### Last verified results against the hosted database (2026-10-29)
- `get_my_queue_status()`: already present; live definition identical to `supabase_queue_status.sql`; security definer, `search_path=public`, anon cannot execute, authenticated can
- `supabase_emergency_requests.sql`: dry run OK, then applied (column `emergency_requested`, trigger `trg_enforce_patient_booking_rules` enabled)
- `supabase_verify_behaviour.sql`: Q1, Q2, Q3, T1, E1, E2, E3, E4, E5, E6, E7, D1 all PASS; 0 rows left on the test date
- Public API: anon `select emergency_requested` returns 200 (schema cache refreshed); anon call to `get_my_queue_status` is refused (42501)
- Not covered: RLS as a real signed-in patient (no patient account exists yet), and the browser UI while signed in

## Manual checks (signed-in flows)
These need real accounts and have **not** been automated. Use fictional accounts only.

**Patient**
- [ ] Register → lands on the patient dashboard as a patient
- [ ] Book a slot → token shown; booking listed on the dashboard
- [ ] Book the same doctor and date again → "already have an appointment" message, no second booking
- [ ] Live Queue Status shows position, now serving and wait (after `supabase_queue_status.sql`)
- [ ] Opening `/admin` or `/doctor` redirects back to `/`
- [ ] Sign Out → back to `/login`; browser back does not show the dashboard

**Doctor**
- [ ] Doctor tab sign-in → `/doctor`; patient tab sign-in with a doctor account is rejected
- [ ] Queue ordered emergency first, then token
- [ ] Start → notes and prescription → complete; appears in Consultation History
- [ ] Approve / Decline emergency request (after `supabase_emergency_requests.sql`)

**Admin**
- [ ] Overview counts match the queue
- [ ] Call Next Patient, complete, cancel
- [ ] Cancelled patient can rebook the same doctor and day

**General**
- [ ] Refresh on a deep link (e.g. `/doctor/queue`) keeps the page
- [ ] Mobile width (~390 px): sidebar, booking form and queue cards usable
- [ ] Browser console has no errors

## Known limitations
- No end-to-end browser tests; role and booking flows are verified manually.
- The database behaviour tests need the SQL Editor (no CI database).
- Base table DDL is not in the repo, so a fresh database cannot be built from these files alone.
