-- ====================================================================
-- SmartCare: ROLLBACK of supabase_emergency_requests.sql
-- Only run if the emergency-request migration must be undone.
-- Removes the trigger, its function and the emergency_requested column
-- (any pending requests are lost; priorities already approved stay).
-- ====================================================================
DROP TRIGGER IF EXISTS trg_enforce_patient_booking_rules ON public.appointments;
DROP FUNCTION IF EXISTS public.enforce_patient_booking_rules();
ALTER TABLE public.appointments DROP COLUMN IF EXISTS emergency_requested;

NOTIFY pgrst, 'reload schema';

SELECT 'emergency_requested column exists' AS check_name,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'appointments'
                  AND column_name = 'emergency_requested')::text AS result
UNION ALL
SELECT 'trigger exists',
       EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgrelid = 'public.appointments'::regclass
                  AND tgname = 'trg_enforce_patient_booking_rules')::text;
