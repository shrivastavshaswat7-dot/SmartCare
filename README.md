# SmartCare — Hospital Appointment & Queue Management

SmartCare is a college project exploring full-stack development, authentication, PostgreSQL database design, Row Level Security, appointment scheduling and queue management.

Patients book appointments and follow their place in the queue, doctors run their consultation queue and write notes and prescriptions, and administrators control every doctor's queue.

**Live demo:** https://smart-care-black.vercel.app

> Educational project. Use fictional data only. It is not a medical system: "emergency" is a queue-ordering flag, not clinical triage.

## Features

**Patient**
- Register, sign in, sign out
- Book by department, date and 15-minute slot (doctor schedules from `doctor_schedules`)
- New or follow-up visits (follow-up reuses the previous doctor)
- Database-generated queue token for every booking
- Live queue position, "now serving" token and estimated wait
- Emergency/urgent *request* that a doctor or admin must approve (after the emergency migration)

**Doctor**
- Today's queue, emergency-first ordering
- Start / complete consultations, mark absent
- Consultation notes and prescriptions, consultation history
- Approve or decline emergency requests

**Administrator**
- Overview of all doctors' queues and daily counts
- Queue control: call next / specific patient, complete, cancel
- Approve or decline emergency requests

**Data integrity**
- One non-cancelled appointment per patient, doctor and day (`uq_patient_doctor_day_active`)
- One patient per doctor, date and slot (`idx_uq_appointments_slot`)
- Concurrency-safe token numbers (`assign_token_number()` trigger + `uq_doctor_date_token`)
- Role checks in the database (RLS + triggers), not only in the UI

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7, Vite 8, plain CSS |
| Backend | Supabase (PostgreSQL, Auth, Row Level Security, SQL functions/triggers) — no custom server |
| Hosting | Vercel (auto-deploys `main` from GitHub) |
| Tests | Node's built-in test runner (`node --test`) |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Project structure

```text
src/
├── components/   route guards (ProtectedRoute, DoctorRoute, AdminRoute), DashboardLayout
├── context/      AuthContext (session + role)
├── lib/          supabase client, queue rules, booking error messages, role routing
├── pages/        Login, Register, patient / doctor / admin pages
└── main.jsx, App.jsx
tests/            unit tests (node --test)
docs/             architecture, demo guide, demo accounts, testing
supabase_*.sql    database setup, migrations and verification scripts
```

## Scope
Appointment scheduling, doctor-wise tokens, queue management, priority handling, consultation records and role-based workflows. Billing, pharmacy, ambulance management and payments are intentionally out of scope.

## Getting started

### Prerequisites
- Node.js 20 or newer (developed on Node 24) and npm
- A Supabase project

### 1. Install
```bash
git clone https://github.com/shrivastavshaswat7-dot/SmartCare.git
cd SmartCare
npm install
```

### 2. Environment variables
```bash
cp .env.example .env
```
Fill in `.env`:

| Variable | Where to find it | Exposed to browser? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Yes (public) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key (`sb_publishable_…`) | Yes (public, protected by RLS) |

Never put a secret/service-role key in any `VITE_` variable — Vite bundles those into the public JavaScript. `.env`, `.env.local` and other `.env.*` files are gitignored.

### 3. Database
The base tables (`profiles`, `departments`, `doctors`, `appointments`, `consultations`) were created in the Supabase dashboard and are **not** yet scripted in this repo (see Known limitations). With those in place, run these files in the Supabase SQL Editor, in order:

1. `supabase_seed.sql` — departments and doctors (fictional)
2. `supabase_rls.sql` — RLS policies, role-protection trigger, token trigger, consultations table
3. `supabase_time_slots.sql` — slots, visit types, doctor schedules
4. `supabase_one_booking_per_day.sql` — one active booking per patient/doctor/day
5. `supabase_queue_status.sql` — `get_my_queue_status()` for patient queue position
6. `supabase_emergency_requests.sql` — emergency requests need staff approval

Then check with `supabase_verify_readonly.sql` (read-only report) and `supabase_verify_behaviour.sql` (self-tests that always roll back).

### 4. Run
```bash
npm run dev       # http://localhost:5173
npm test          # unit tests
npm run lint
npm run build     # production build in dist/
npm run preview   # serve the production build
```

Demo accounts: see [docs/DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md). Presentation script: [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md). Testing: [docs/TESTING.md](docs/TESTING.md).

## Deployment
The Vercel project is connected to this GitHub repository: every push to `main` builds and deploys production automatically. `vercel.json` rewrites all paths to `index.html` so client-side routes work on refresh. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production and Preview in Vercel → Project → Settings → Environment Variables; changing them requires a redeploy because Vite inlines them at build time.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Blank data / "Invalid API key" | Wrong or disabled key in `VITE_SUPABASE_PUBLISHABLE_KEY`; legacy anon JWT keys are disabled on the hosted project |
| "Live position unavailable" on the queue page | `supabase_queue_status.sql` has not been run |
| "You already have an appointment with this doctor on this date" | Expected: one active booking per patient/doctor/day |
| Deep link returns 404 on Vercel | `vercel.json` rewrite missing |
| Signed in but sent to another dashboard | The account's `profiles.role` differs from the login tab chosen |

## Known limitations
- Base table DDL is not in the repo yet; export it with `supabase db dump --schema-only` before recreating the project elsewhere.
- No automated browser (end-to-end) tests; signed-in flows are checked manually (see docs/TESTING.md).
- Estimated wait uses a fixed 10 minutes per consultation.
- Patients cannot cancel their own appointments in the UI; doctors and admins can.

## License
No license has been chosen yet; all rights reserved by the author.
