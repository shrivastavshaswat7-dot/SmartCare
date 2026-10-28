-- ====================================================================
-- SmartCare: READ-ONLY inspection of the live database objects the
-- migrations depend on. Returns definitions, grants and aggregate counts
-- only - never patient rows. The guarded runner executes this file in a
-- READ ONLY transaction.
-- ====================================================================

-- 1. Function definitions, security mode, search_path and EXECUTE grants
SELECT p.proname AS function,
       p.prosecdef AS security_definer,
       p.proconfig AS settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('get_my_queue_status', 'is_admin', 'is_doctor', 'get_doctor_id',
                     'assign_token_number', 'protect_profile_role',
                     'patient_has_active_appointment', 'enforce_patient_booking_rules')
 ORDER BY p.proname;

-- 2. appointments columns
SELECT column_name, data_type, is_nullable, column_default, is_identity
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'appointments'
 ORDER BY ordinal_position;

-- 3. Constraints, indexes and triggers on appointments and profiles
SELECT 'constraint' AS kind, conrelid::regclass::text AS on_table, conname AS name, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint WHERE conrelid IN ('public.appointments'::regclass, 'public.profiles'::regclass)
UNION ALL
SELECT 'index', tablename, indexname, indexdef
  FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('appointments', 'profiles')
UNION ALL
SELECT 'trigger', tgrelid::regclass::text, tgname || ' [' || tgenabled::text || ']', pg_get_triggerdef(oid)
  FROM pg_trigger WHERE tgrelid IN ('public.appointments'::regclass, 'public.profiles'::regclass) AND NOT tgisinternal
ORDER BY 1, 2, 3;

-- 4. RLS policies on appointments, profiles and consultations
SELECT tablename, policyname, cmd, roles::text AS roles, permissive, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('appointments', 'profiles', 'consultations')
 ORDER BY tablename, cmd, policyname;

-- 5. Environment and aggregate counts (no row data)
SELECT 'server_version' AS item, current_setting('server_version') AS value
UNION ALL SELECT 'connected_as', current_user
UNION ALL SELECT 'appointments_owner', pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid = 'public.appointments'::regclass
UNION ALL SELECT 'rls_appointments', c.relrowsecurity::text FROM pg_class c WHERE c.oid = 'public.appointments'::regclass
UNION ALL SELECT 'profiles_' || COALESCE(role, 'null'), COUNT(*)::text FROM public.profiles GROUP BY role
UNION ALL SELECT 'appointments_' || COALESCE(status, 'null'), COUNT(*)::text FROM public.appointments GROUP BY status
UNION ALL SELECT 'doctors_total', COUNT(*)::text FROM public.doctors
UNION ALL SELECT 'doctors_linked_to_user', COUNT(*)::text FROM public.doctors WHERE user_id IS NOT NULL;
