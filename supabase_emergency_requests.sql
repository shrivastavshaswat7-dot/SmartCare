-- ====================================================================
-- SmartCare: emergency priority becomes a REQUEST that staff approve
-- Run in the Supabase SQL Editor AFTER supabase_rls.sql. Safe to run more than once.
-- ====================================================================
-- Problem: the patient INSERT policy only checks auth.uid() = patient_id,
-- so a patient could insert priority = 'emergency' or any status directly
-- through the API.
--
-- After this migration, for a signed-in patient (not admin, not doctor):
--   INSERT: status is forced to 'waiting'; priority 'emergency' is stored
--           as priority 'normal' + emergency_requested = true;
--           follow_up_of must point to the patient's own appointment.
--   UPDATE: (only possible if some UPDATE policy allows it) changes to
--           priority, status, patient, doctor, date, slot or token are rejected.
-- Admins, doctors and server scripts (auth.uid() IS NULL) are unchanged.
-- Staff approve with:
--   UPDATE appointments SET priority = 'emergency', emergency_requested = false WHERE id = ...
-- which the existing admin/doctor UPDATE policies already allow.
-- Emergency priority is a queue-ordering flag only; it is not medical triage.
--
-- Data compatibility: ADD COLUMN ... NOT NULL DEFAULT false is a metadata-only
-- change on PostgreSQL 11+ (no table rewrite). Existing rows get false.
-- Locking: brief ACCESS EXCLUSIVE lock on appointments for the ALTER/trigger.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_enforce_patient_booking_rules ON public.appointments;
--   DROP FUNCTION IF EXISTS public.enforce_patient_booking_rules();
--   ALTER TABLE public.appointments DROP COLUMN IF EXISTS emergency_requested;
-- ====================================================================

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL OR to_regprocedure('public.is_doctor()') IS NULL THEN
    RAISE EXCEPTION 'STOP: public.is_admin() / public.is_doctor() are missing; run supabase_rls.sql first.';
  END IF;
END $$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS emergency_requested BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_patient_booking_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server scripts and staff keep full control
  IF auth.uid() IS NULL OR public.is_admin() OR public.is_doctor() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.emergency_requested := COALESCE(NEW.emergency_requested, false)
                               OR COALESCE(NEW.priority, 'normal') = 'emergency';
    NEW.priority := 'normal';
    NEW.status := 'waiting';
    IF NEW.follow_up_of IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.appointments
       WHERE id = NEW.follow_up_of AND patient_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Invalid follow-up reference' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE by a patient: protected fields may not change
  IF NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
     OR NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
     OR NEW.slot_start IS DISTINCT FROM OLD.slot_start
     OR NEW.token_number IS DISTINCT FROM OLD.token_number THEN
    RAISE EXCEPTION 'Patients cannot change appointment priority, status or schedule'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_patient_booking_rules ON public.appointments;
CREATE TRIGGER trg_enforce_patient_booking_rules
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_patient_booking_rules();

-- Make the API (PostgREST) see the new column immediately after commit
NOTIFY pgrst, 'reload schema';

-- Verify (read-only): expect the column and an enabled trigger
SELECT 'column' AS kind, column_name || ' ' || data_type || ' default ' || column_default AS detail
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'emergency_requested'
UNION ALL
SELECT 'trigger', tgname || ' enabled=' || tgenabled::text
  FROM pg_trigger
 WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'trg_enforce_patient_booking_rules';
