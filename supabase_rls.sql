-- ====================================================================
-- SmartCare Supabase Row Level Security (RLS) & Role Setup Script
-- ====================================================================
-- This script configures hardened, non-recursive RLS policies for SmartCare.
-- It ensures:
--   1. No infinite recursion on the `profiles` table.
--   2. Admins can view/update all appointments and view patient profiles.
--   3. Patients can view/create their own appointments and manage their profile.
--   4. Queue visibility is strictly scoped: patients can ONLY view active
--      queue tokens for the specific doctor and date where they currently
--      have a waiting or consulting appointment (preventing hospital-wide data leaks).
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. ENABLE ROW LEVEL SECURITY
-- --------------------------------------------------------------------
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------
-- 2. SECURITY DEFINER HELPER FUNCTIONS
-- --------------------------------------------------------------------
-- Helper A: is_admin()
-- Evaluates whether the currently authenticated user has role = 'admin'.
-- Using SECURITY DEFINER and search_path = public ensures this check runs
-- with table-owner privileges, bypassing RLS on `profiles` and preventing
-- infinite recursion when called from `profiles` policies.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- Helper B: patient_has_active_appointment(...)
-- Checks if the authenticated user has an active (waiting/consulting)
-- appointment with a given doctor on a given date.
-- Used to safely scope queue visibility without exposing unrelated appointments.
CREATE OR REPLACE FUNCTION public.patient_has_active_appointment(
  p_doctor_id appointments.doctor_id%TYPE,
  p_appointment_date appointments.appointment_date%TYPE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.appointments
    WHERE patient_id = auth.uid()
      AND doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date
      AND status IN ('waiting', 'consulting')
  );
END;
$$;

-- Grant execution permissions on helper functions to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_has_active_appointment TO authenticated;


-- --------------------------------------------------------------------
-- 3. APPOINTMENTS TABLE RLS POLICIES
-- --------------------------------------------------------------------

-- Policy 1: Patients can read their own appointments
DROP POLICY IF EXISTS "Patients can view own appointments" ON appointments;
CREATE POLICY "Patients can view own appointments"
  ON appointments FOR SELECT
  USING (auth.uid() = patient_id);

-- Policy 2: Patients can insert their own appointments
DROP POLICY IF EXISTS "Patients can create own appointments" ON appointments;
CREATE POLICY "Patients can create own appointments"
  ON appointments FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

-- Policy 3: Scoped Queue Visibility for Patients
-- Replaces the broad, unsafe policy. A patient can ONLY view active queue
-- rows (waiting/consulting) if they themselves have an active appointment
-- with the same doctor on the same date. Hospital-wide rows are NOT exposed.
DROP POLICY IF EXISTS "Patients can view active queue tokens for same doctor and date" ON appointments;
DROP POLICY IF EXISTS "Patients can view active queue tokens for their booked doctor and date" ON appointments;
CREATE POLICY "Patients can view active queue tokens for their booked doctor and date"
  ON appointments FOR SELECT
  USING (
    status IN ('waiting', 'consulting')
    AND public.patient_has_active_appointment(doctor_id, appointment_date)
  );

-- Policy 4: Admin / Reception can read ALL appointments
DROP POLICY IF EXISTS "Admin can read all appointments" ON appointments;
CREATE POLICY "Admin can read all appointments"
  ON appointments FOR SELECT
  USING (public.is_admin());

-- Policy 5: Admin / Reception can update appointment status
-- Allows admins to change status (waiting -> consulting -> completed / cancelled)
DROP POLICY IF EXISTS "Admin can update appointment status" ON appointments;
CREATE POLICY "Admin can update appointment status"
  ON appointments FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- --------------------------------------------------------------------
-- 4. PROFILES TABLE RLS POLICIES
-- --------------------------------------------------------------------

-- Policy 1: Users can read their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Users can insert their own profile on signup / login
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy 3: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 4: Admin / Reception can view all patient profiles
-- Uses public.is_admin() (SECURITY DEFINER) instead of an in-policy subquery
-- on `profiles`, which completely resolves RLS recursion.
DROP POLICY IF EXISTS "Admin can read all profiles" ON profiles;
CREATE POLICY "Admin can read all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin());


-- --------------------------------------------------------------------
-- 5. ADMIN USER PROMOTION & VERIFICATION SCRIPT
-- --------------------------------------------------------------------
-- Step 1: Register a user normally via the SmartCare signup page or create in Supabase Auth.
-- Step 2: Promote that user to 'admin' by running the following query (replace with actual email):
--
-- UPDATE profiles
-- SET role = 'admin'
-- WHERE email = 'admin@smartcare.com';

-- Step 3: Verify existing admins:
-- SELECT id, name, email, role FROM profiles WHERE role = 'admin';

-- Step 4: Verify is_admin() function returns true for the admin user:
-- SELECT public.is_admin();


-- ====================================================================
-- 6. AUTOMATIC TOKEN NUMBER GENERATION (per doctor + appointment_date)
-- ====================================================================
-- Replaces the client-side MAX(token_number)+1 pattern with a
-- concurrency-safe, database-level trigger. Two patients booking the
-- same doctor and date at the exact same moment will always receive
-- distinct, sequential token numbers — no retries needed.
-- ====================================================================

-- --------------------------------------------------------------------
-- 6a. TRIGGER FUNCTION: assign_token_number()
-- --------------------------------------------------------------------
-- Fires BEFORE INSERT on appointments.
-- 1. Acquires a transaction-scoped advisory lock keyed on (doctor, date)
--    so concurrent inserts for the same pair are serialized.
-- 2. Computes MAX(token_number)+1 for that (doctor, date) — safe under
--    the lock.
-- 3. Overwrites NEW.token_number regardless of what the client sent.
--
-- SECURITY DEFINER: reads appointments with table-owner privileges,
-- bypassing RLS. This means the inserting patient does NOT need SELECT
-- access to other patients' rows just to receive a token.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_token_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lock_key BIGINT;
BEGIN
  -- 1. Compute a deterministic lock key for this (doctor, date) pair.
  --    hashtext() returns a stable 32-bit int; different pairs get
  --    different keys, so unrelated inserts are never blocked.
  lock_key := hashtext(NEW.doctor_id::text || NEW.appointment_date::text);

  -- 2. Acquire a transaction-scoped advisory lock.
  --    Concurrent inserts for the SAME doctor+date queue here.
  --    The lock is automatically released on COMMIT or ROLLBACK.
  PERFORM pg_advisory_xact_lock(lock_key);

  -- 3. Safely compute the next sequential token number.
  SELECT COALESCE(MAX(token_number), 0) + 1
    INTO NEW.token_number
    FROM public.appointments
   WHERE doctor_id        = NEW.doctor_id
     AND appointment_date = NEW.appointment_date;

  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------
-- 6b. TRIGGER: attach to appointments table
-- --------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_assign_token_number ON public.appointments;
CREATE TRIGGER trg_assign_token_number
  BEFORE INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_token_number();

-- --------------------------------------------------------------------
-- 6c. UNIQUE CONSTRAINT: belt-and-suspenders safety net
-- --------------------------------------------------------------------
-- The trigger guarantees uniqueness, but this constraint catches any
-- edge-case bugs. If existing data has duplicates, run a dedup query
-- before applying this constraint.
-- --------------------------------------------------------------------
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS uq_doctor_date_token;
ALTER TABLE public.appointments
  ADD CONSTRAINT uq_doctor_date_token
  UNIQUE (doctor_id, appointment_date, token_number);


-- ====================================================================
-- 7. DOCTOR IDENTITY, CONSULTATIONS TABLE & DOCTOR RLS POLICIES
-- ====================================================================
-- Links the doctors table to auth users via a user_id column.
-- Doctors can only read/update their own appointments and consultations.
-- ====================================================================

-- --------------------------------------------------------------------
-- 7a. DOCTORS TABLE: add user_id column to link with auth.users
-- --------------------------------------------------------------------
-- This column links a doctor record to a Supabase Auth user.
-- If the column already exists, DO NOTHING (idempotent).
-- After running this, UPDATE each doctor row:
--   UPDATE doctors SET user_id = '<auth-user-uuid>' WHERE id = <doctor-id>;
--   UPDATE profiles SET role = 'doctor' WHERE id = '<auth-user-uuid>';
-- --------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'doctors'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.doctors ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Enable RLS on doctors table
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the doctors catalog (needed for booking)
DROP POLICY IF EXISTS "Authenticated users can view doctors" ON doctors;
CREATE POLICY "Authenticated users can view doctors"
  ON doctors FOR SELECT
  USING (true);

-- --------------------------------------------------------------------
-- 7b. CONSULTATIONS TABLE (create if not exists)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  doctor_id BIGINT NOT NULL REFERENCES public.doctors(id),
  notes TEXT DEFAULT '',
  prescription TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one consultation per appointment (prevents duplicates)
-- The upsert in the application uses ON CONFLICT (appointment_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_consultation_appointment'
  ) THEN
    ALTER TABLE public.consultations
      ADD CONSTRAINT uq_consultation_appointment UNIQUE (appointment_id);
  END IF;
END $$;

ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 7c. HELPER: get_doctor_id()
-- --------------------------------------------------------------------
-- Returns the doctors.id for the currently authenticated user.
-- SECURITY DEFINER to bypass RLS on doctors table.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_doctor_id()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM public.doctors
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_doctor_id() TO authenticated;

-- Helper: is_doctor()
CREATE OR REPLACE FUNCTION public.is_doctor()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'doctor'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_doctor() TO authenticated;

-- --------------------------------------------------------------------
-- 7d. APPOINTMENTS TABLE: Doctor-specific RLS Policies
-- --------------------------------------------------------------------

-- Policy: Doctors can read their own appointments
DROP POLICY IF EXISTS "Doctors can view own appointments" ON appointments;
CREATE POLICY "Doctors can view own appointments"
  ON appointments FOR SELECT
  USING (
    doctor_id = public.get_doctor_id()
  );

-- Policy: Doctors can update status on their own appointments
DROP POLICY IF EXISTS "Doctors can update own appointments" ON appointments;
CREATE POLICY "Doctors can update own appointments"
  ON appointments FOR UPDATE
  USING (
    doctor_id = public.get_doctor_id()
  )
  WITH CHECK (
    doctor_id = public.get_doctor_id()
  );

-- --------------------------------------------------------------------
-- 7e. CONSULTATIONS TABLE: RLS Policies
-- --------------------------------------------------------------------

-- Doctors can read their own consultations
DROP POLICY IF EXISTS "Doctors can view own consultations" ON consultations;
CREATE POLICY "Doctors can view own consultations"
  ON consultations FOR SELECT
  USING (
    doctor_id = public.get_doctor_id()
  );

-- Doctors can create consultations for their own appointments
DROP POLICY IF EXISTS "Doctors can create own consultations" ON consultations;
CREATE POLICY "Doctors can create own consultations"
  ON consultations FOR INSERT
  WITH CHECK (
    doctor_id = public.get_doctor_id()
  );

-- Doctors can update their own consultations
DROP POLICY IF EXISTS "Doctors can update own consultations" ON consultations;
CREATE POLICY "Doctors can update own consultations"
  ON consultations FOR UPDATE
  USING (
    doctor_id = public.get_doctor_id()
  )
  WITH CHECK (
    doctor_id = public.get_doctor_id()
  );

-- Admin can read all consultations
DROP POLICY IF EXISTS "Admin can read all consultations" ON consultations;
CREATE POLICY "Admin can read all consultations"
  ON consultations FOR SELECT
  USING (public.is_admin());

-- Admin can update all consultations
DROP POLICY IF EXISTS "Admin can update all consultations" ON consultations;
CREATE POLICY "Admin can update all consultations"
  ON consultations FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- --------------------------------------------------------------------
-- 7f. PROFILES TABLE: Doctor can read patient profiles
-- --------------------------------------------------------------------
-- Doctors need to see patient names/phones in their queue.
-- This policy lets doctors read profiles for patients who have
-- appointments with them. Uses SECURITY DEFINER helper.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Doctors can view patient profiles" ON profiles;
CREATE POLICY "Doctors can view patient profiles"
  ON profiles FOR SELECT
  USING (
    public.is_doctor()
    AND id IN (
      SELECT DISTINCT patient_id FROM public.appointments
      WHERE doctor_id = public.get_doctor_id()
    )
  );
