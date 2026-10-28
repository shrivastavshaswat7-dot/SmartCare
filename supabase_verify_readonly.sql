-- ====================================================================
-- SmartCare: READ-ONLY security and schema report
-- Run any time in the Supabase SQL Editor. Changes nothing and returns
-- schema metadata only (no patient rows).
-- ====================================================================
SELECT 'appointments policy' AS kind,
       policyname || ' [' || cmd || '] using: ' || COALESCE(qual, '-') || ' check: ' || COALESCE(with_check, '-') AS detail
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments'
UNION ALL
SELECT 'profiles policy',
       policyname || ' [' || cmd || '] using: ' || COALESCE(qual, '-') || ' check: ' || COALESCE(with_check, '-')
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
UNION ALL
SELECT 'consultations policy', policyname || ' [' || cmd || ']'
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consultations'
UNION ALL
SELECT 'rls enabled', c.relname || ' = ' || c.relrowsecurity
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relname IN ('appointments', 'profiles', 'doctors', 'departments', 'consultations', 'doctor_schedules')
UNION ALL
SELECT 'trigger', c.relname || '.' || t.tgname || ' enabled=' || t.tgenabled::text
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
UNION ALL
SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       || ' security_definer=' || p.prosecdef
       || ' search_path_set=' || (p.proconfig IS NOT NULL)
       || ' anon_exec=' || has_function_privilege('anon', p.oid, 'EXECUTE')
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('is_admin', 'is_doctor', 'get_doctor_id', 'assign_token_number',
                     'protect_profile_role', 'patient_has_active_appointment',
                     'get_my_queue_status', 'enforce_patient_booking_rules')
UNION ALL
SELECT 'index', indexname
  FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'appointments'
UNION ALL
SELECT 'column', 'appointments.emergency_requested exists = '
       || EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'appointments'
                     AND column_name = 'emergency_requested')
ORDER BY 1, 2;
