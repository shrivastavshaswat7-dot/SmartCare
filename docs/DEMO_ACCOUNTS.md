# Demo accounts

**Status:** no demo account credentials are published in this repository, and none have been verified as part of this documentation. The hosted project currently has one admin account and ten doctor accounts that were created earlier with a local provisioning script; their passwords are private and must not be shared publicly. There are no patient accounts yet.

## Rules
- Use a separate Supabase project for public demos if possible, with fictional data only.
- Never commit passwords, service-role/secret keys or access tokens. Keep them in `.env.local` (gitignored) or a password manager.
- Do not publish reusable credentials for admin or doctor accounts on the production database. If you must show privileged screens, sign in yourself during the presentation.
- Use obviously fictional names (for example "Demo Patient One") and an email domain you control. Do not use real people's names, phone numbers or medical details.

## Roles and how each account is created

| Role | How to create | Notes |
|---|---|---|
| Patient | Sign up at `/register`, or Supabase → Authentication → Users → **Add user** (tick *Auto confirm*) and then sign in once so the app creates the `profiles` row | Self-registration always gets `role = 'patient'` |
| Doctor | `npm run provision:doctors` (local only) | Creates or links the ten seeded doctors to auth accounts |
| Admin | Create a user as for a patient, then promote it in the SQL Editor (see below) | The role-protection trigger only allows role changes from the SQL Editor or an existing admin |

### Doctor provisioning script
`provision_doctors.mjs` is gitignored and stays on your machine. It needs, in `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...      # Supabase → Project Settings → API Keys → secret key
DEMO_ADMIN_PASSWORD=...                      # password of the existing admin account
DEMO_DOCTOR_PASSWORD=...                     # password given to newly created doctor accounts
```

It exits without changes if any of these are missing. It creates doctor accounts only when they do not exist (existing passwords are not changed), promotes their profiles to `doctor` and sets `doctors.user_id`. It writes to the database, so run it deliberately.

### Promote an admin (SQL Editor)
```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your-admin-email@your-domain';
```

### Change a demo password
Supabase → Authentication → Users → select the user → **Reset password** / update password. Update `.env.local` afterwards if the provisioning script uses it.

## Resetting demo data safely
Only touch rows that belong to your demo patients. Check first:

```sql
-- How many appointments belong to demo patients (replace the domain)?
SELECT COUNT(*) FROM public.appointments a
JOIN public.profiles p ON p.id = a.patient_id
WHERE p.email LIKE '%@your-demo-domain';
```

Prefer cancelling over deleting, which keeps history and frees the patient to book again:

```sql
UPDATE public.appointments a SET status = 'cancelled'
FROM public.profiles p
WHERE p.id = a.patient_id AND p.email LIKE '%@your-demo-domain'
  AND a.status IN ('waiting', 'consulting');
```

Never run an unfiltered `DELETE` or `UPDATE` on `appointments`, `profiles` or `consultations`.

## Before a presentation
1. Create two or three fictional patient accounts.
2. Book a few appointments for today with one doctor, so the queues and dashboards are not empty.
3. Sign in once with each role you will show, and keep the passwords private.
