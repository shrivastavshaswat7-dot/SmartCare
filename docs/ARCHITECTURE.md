# SmartCare architecture

## Overview

```text
Browser (React SPA on Vercel)
   │  supabase-js with the publishable key + the signed-in user's JWT
   ▼
Supabase
   ├─ Auth          email/password sign-in, sessions
   ├─ PostgREST     table access, filtered by Row Level Security
   └─ PostgreSQL    tables, RLS policies, triggers, SECURITY DEFINER functions
```

There is no custom backend server. Every rule that must hold even if someone calls the API directly lives in the database (RLS policies, triggers, unique indexes). The React app only decides what to show.

## Frontend

| Area | Files |
|---|---|
| Routing | `src/App.jsx`; guards in `src/components/{ProtectedRoute,DoctorRoute,AdminRoute}.jsx` use `guardRedirect()` from `src/lib/roleRoutes.js` |
| Session and role | `src/context/AuthContext.jsx` reads the session from Supabase Auth and the role from `profiles.role` |
| Patient | `PatientDashboard`, `BookAppointment`, `PatientQueue` |
| Doctor | `DoctorDashboard`, `DoctorQueue`, `DoctorHistory` |
| Admin | `AdminDashboard`, `AdminQueueControl` |
| Shared rules | `src/lib/queue.js` (queue order, wait estimate), `src/lib/bookingErrors.js` (database error → message) |

| Route | Who |
|---|---|
| `/login`, `/register` | everyone |
| `/`, `/book-appointment`, `/queue` | patients |
| `/doctor`, `/doctor/queue`, `/doctor/history` | doctors |
| `/admin`, `/admin/queue` | admins |

Route guards are a convenience only: they stop people landing on the wrong dashboard. Data protection comes from RLS.

## Authentication and roles

- Accounts live in Supabase Auth. Each user has a `profiles` row with `role` = `patient`, `doctor` or `admin`.
- Self-registration always creates `role = 'patient'`: the profiles INSERT policy only allows `patient`, and the `protect_profile_role()` trigger rejects role changes by anyone who is not already an admin.
- Doctors are linked to their `doctors` row through `doctors.user_id`; `get_doctor_id()` returns the caller's doctor id.
- The login page has a role tab; if it does not match `profiles.role` the user is signed out with an explanation.
- Helper functions `is_admin()`, `is_doctor()`, `get_doctor_id()` are `SECURITY DEFINER` with a fixed `search_path` so policies can use them without recursive RLS.

### Row Level Security (from `supabase_rls.sql`)

| Table | Patient | Doctor | Admin |
|---|---|---|---|
| `appointments` | read own; insert own | read/update own doctor's | read/update all |
| `profiles` | read/update own | read patients who booked them | read/update all |
| `consultations` | read own | read/insert/update own | read/update all |
| `doctors`, `departments`, `doctor_schedules` | read | read; manage own schedule | read; manage schedules |

`supabase_verify_readonly.sql` lists the policies that are actually live, which can differ from the repo files.

## Appointment and token flow

1. The patient picks department → date → doctor → slot. Free slots are built from `doctor_schedules` (Mon–Fri 09:00–17:00, 15 minutes by default) minus non-cancelled bookings.
2. The browser inserts into `appointments` with `status = 'waiting'`.
3. Database checks, in the same insert:
   - `trg_enforce_patient_booking_rules` (after `supabase_emergency_requests.sql`): for patients, forces `status = 'waiting'` and turns `priority = 'emergency'` into `priority = 'normal'` + `emergency_requested = true`.
   - `trg_assign_token_number` takes a transaction advisory lock on (doctor, date) and sets `token_number = MAX + 1`, so simultaneous bookings get distinct tokens. `uq_doctor_date_token` backs this up.
   - `idx_uq_appointments_slot`: one non-cancelled booking per doctor, date and slot.
   - `uq_patient_doctor_day_active`: one non-cancelled booking per patient, doctor and date. Completed visits count; cancelled ones do not.
4. A unique violation comes back as PostgreSQL error `23505`; `bookingErrorMessage()` turns it into a message naming the rule that was hit.
5. The confirmation shows the token and the priority the database actually stored.

Cancelled appointments keep their token number; tokens are never reused for that doctor and day.

## Queue

- Order everywhere: emergency first, then token number (`compareQueueOrder`).
- Doctors and admins read the full queue for a doctor and date (allowed by RLS) and sort it in the browser.
- Patients can only read their own rows, so they call `get_my_queue_status()` (`supabase_queue_status.sql`). It is `SECURITY DEFINER` but returns only counts for the caller's own active appointments: people ahead, waiting total and the token being served. It never returns other patients' rows or ids.
- Estimated wait = (people ahead + the patient in consultation) × 10 minutes.
- Until that function exists, the queue page shows "Live position unavailable" instead of guessing.

## Emergency requests

Patients can ask for emergency priority; they cannot grant it. After `supabase_emergency_requests.sql`, the request is stored as `emergency_requested = true` and the doctor queue and admin queue show **Approve emergency / Decline** buttons. Approval sets `priority = 'emergency'`. The trigger also blocks patients from changing priority, status, schedule or token through any UPDATE path. "Emergency" orders the queue only; it is not medical triage.

## Database files

| File | Purpose |
|---|---|
| `supabase_seed.sql` | departments and doctors |
| `supabase_rls.sql` | policies, helper functions, role trigger, token trigger, consultations |
| `supabase_time_slots.sql` | slot columns, slot index, doctor schedules |
| `supabase_one_booking_per_day.sql` | `uq_patient_doctor_day_active` |
| `supabase_queue_status.sql` | `get_my_queue_status()` |
| `supabase_emergency_requests.sql` | emergency request column and trigger |
| `supabase_verify_readonly.sql` | read-only report of live policies, triggers, functions and indexes |
| `supabase_verify_behaviour.sql` | self-tests that always roll back |
